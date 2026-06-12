"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { KIOSK_CHAT_ENTRY_KEY } from "@/lib/kioskChatGate";
import { getLocaleStrings } from "@/lib/locale";
import ReactMarkdown from "react-markdown";
import type { VisemeFrame, AvatarGesture } from "@/types/viseme";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  showQr?: boolean;
}

type TtsSegment = { audioBase64: string; mimeType: string; visemes: VisemeFrame[]; gesture: AvatarGesture; text: string };

interface ChatProps {
  /** Called whenever the bot has a new spoken sentence ready */
  onBotSpeech?: (audioBase64: string, mimeType: string, visemes: VisemeFrame[], gesture: AvatarGesture, text: string) => void;
  /** Called when the user sends a new message — clears any queued audio */
  onClearSpeech?: () => void;
  language?: string | string[];
  onClose?: () => void;
  avatarName?: string;
  isPttHoveredOrPressed?: boolean;
  onRecordingStatusChange?: (isRecording: boolean) => void;
  /** Notifies parent when the chat API is waiting for a streamed response */
  onThinkingChange?: (thinking: boolean) => void;
  /** Ref the parent populates; Chat writes a handler here to receive speech-ended events */
  speechEndCallbackRef?: React.MutableRefObject<(() => void) | null>;
  /** False until parent reads sessionStorage locale after mount (avoids SSR hydration mismatch) */
  localeReady?: boolean;
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getAvailableLanguages(language?: string | string[]): string[] {
  if (!language) return ["en-US"];
  if (Array.isArray(language)) return language;
  return [language];
}

const GESTURE_PREFIX_RE = /^(idle|nod|shake|tilt|lookup|excited)(\s+|$)/i;

/** Strip a leading gesture token if the model leaked it into visible text. */
function stripLeadingGesture(text: string): string {
  return text.replace(GESTURE_PREFIX_RE, "");
}

/** Strip markdown markers so TTS reads plain words (chat display keeps raw markdown). */
function stripMarkdownForSpeech(text: string): string {
  let cleaned = text;

  // Paired bold/italic — loop until stable (handles nested/overlapping runs)
  let prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
  }

  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  cleaned = cleaned.replace(/^#+\s+/gm, "");
  cleaned = cleaned.replace(/^\s*[-*]\s+/gm, "");

  // Stray markers (unclosed bold, sentence splits mid-markdown)
  cleaned = cleaned.replace(/\*+/g, "");
  cleaned = cleaned.replace(/(?<!\w)_(?!\w)/g, "");
  cleaned = cleaned.replace(/^\s+/gm, "");
  cleaned = cleaned.replace(/  +/g, " ");

  return cleaned;
}

/**
 * Strips markdown and expands common abbreviations so the TTS engine reads it naturally.
 */
function cleanTextForTTS(text: string, language: string): string {
  let cleaned = stripLeadingGesture(text);
  cleaned = stripMarkdownForSpeech(cleaned);

  // Strip internal markers
  cleaned = cleaned.replace(/\[SHOW_QR\]/gi, "");

  // Expand common abbreviations (English only)
  if (!language.startsWith("zh")) {
    cleaned = cleaned.replace(/\be\.g\./gi, "for example");
    cleaned = cleaned.replace(/\bi\.e\./gi, "that is");
    cleaned = cleaned.replace(/\betc\./gi, "and so on");
  }

  return cleaned.trim();
}

/** Splits buffer on sentence boundaries (.?! and 。！？) followed by optional whitespace. */
function extractSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const regex = /[.?!。！？]+\s*/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(buffer)) !== null) {
    const sentence = buffer.slice(lastIndex, match.index + match[0].length).trim();
    if (sentence) sentences.push(sentence);
    lastIndex = match.index + match[0].length;
  }
  return { sentences, rest: buffer.slice(lastIndex) };
}

const botMarkdownComponents = {
  p: ({ ...props }) => <p className="mb-2.5 last:mb-0 leading-relaxed" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold text-[#0a2240]" {...props} />,
  ul: ({ ...props }) => <ul className="my-2 ml-4 list-disc space-y-1" {...props} />,
  ol: ({ ...props }) => <ol className="my-2 ml-4 list-decimal space-y-1" {...props} />,
  li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
  a: ({ ...props }) => <a className="text-[#0a2240] font-semibold hover:underline" {...props} />,
};

function BotAvatar() {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full text-white text-[10px] font-bold shadow-sm"
      style={{ width: 26, height: 26, background: "#0a2240" }}
    >
      AI
    </div>
  );
}

export default function Chat({
  onBotSpeech,
  onClearSpeech,
  language = "en-US",
  onClose,
  avatarName = "AI Concierge",
  isPttHoveredOrPressed = false,
  onRecordingStatusChange,
  onThinkingChange,
  speechEndCallbackRef,
}: ChatProps) {
  const router = useRouter();
  const initialLang = getAvailableLanguages(language)[0];
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 1,
      text: getLocaleStrings(initialLang).chat.welcome(avatarName),
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isTtsBusy, setIsTtsBusy] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const isPressingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const messageIdRef = useRef(2);
  const conversationIdRef = useRef<string | null>(null);

  // Parallel TTS fetch queue — fires fetches immediately as sentences arrive,
  // but drains results in original order so audio always plays in sequence.
  const pendingTtsRef = useRef<Promise<TtsSegment | null>[]>([]);
  const ttsDrainRunningRef = useRef(false);
  const ttsActiveFetchesRef = useRef(0);

  // Message queue — holds messages submitted while avatar is speaking
  const pendingMessageQueueRef = useRef<string[]>([]);
  const [queuedMessageCount, setQueuedMessageCount] = useState(0);
  const isAvatarSpeakingRef = useRef(false);

  const availableLanguages = getAvailableLanguages(language);
  const [currentLanguageIndex, setCurrentLanguageIndex] = useState(0);
  const currentLanguage = availableLanguages[currentLanguageIndex];
  const localeStrings = getLocaleStrings(currentLanguage);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0].id !== 1 || prev[0].sender !== "bot") return prev;
      return [{
        ...prev[0],
        text: getLocaleStrings(currentLanguage).chat.welcome(avatarName),
      }];
    });
  }, [currentLanguage, avatarName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    onThinkingChange?.(isThinking);
  }, [isThinking, onThinkingChange]);

  // ── Speech-ended callback — registered with parent so it can notify us ───
  // No dependency array: always captures the latest handleSend without stale closure.
  useEffect(() => {
    if (!speechEndCallbackRef) return;
    speechEndCallbackRef.current = () => {
      isAvatarSpeakingRef.current = false;
      const next = pendingMessageQueueRef.current.shift();
      if (next !== undefined) {
        setQueuedMessageCount(pendingMessageQueueRef.current.length);
        handleSend(next);
      }
    };
  });

  // ── TTS fetch (fires immediately, returns a promise) ─────────────────────
  const fetchTtsSegment = useCallback(async (text: string, gesture: AvatarGesture): Promise<TtsSegment | null> => {
    ttsActiveFetchesRef.current++;
    setIsTtsBusy(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: currentLanguage }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          sessionStorage.removeItem(KIOSK_CHAT_ENTRY_KEY);
          router.replace("/");
          return null;
        }
        const err = await res.json().catch(() => ({}));
        console.warn("[TTS] API error:", err.detail ?? err.error ?? res.statusText);
        return null;
      }
      const { audioBase64, mimeType, visemes } = await res.json();
      return { audioBase64, mimeType, visemes, gesture, text };
    } catch (err) {
      console.error("[TTS] fetch failed:", err);
      return null;
    } finally {
      ttsActiveFetchesRef.current--;
      if (ttsActiveFetchesRef.current === 0) setIsTtsBusy(false);
    }
  }, [currentLanguage, router]);

  // ── Drain resolved segments in original order ─────────────────────────────
  const drainTtsQueue = useCallback(async () => {
    if (ttsDrainRunningRef.current) return;
    ttsDrainRunningRef.current = true;
    while (pendingTtsRef.current.length > 0) {
      const seg = await pendingTtsRef.current[0];
      pendingTtsRef.current.shift();
      if (seg && onBotSpeech) {
        onBotSpeech(seg.audioBase64, seg.mimeType, seg.visemes, seg.gesture, seg.text);
      }
    }
    ttsDrainRunningRef.current = false;
  }, [onBotSpeech]);

  const enqueueTts = useCallback((text: string, gesture: AvatarGesture) => {
    // Fire fetch immediately — parallel with any already in-flight fetches
    pendingTtsRef.current.push(fetchTtsSegment(text, gesture));
    drainTtsQueue();
  }, [fetchTtsSegment, drainTtsQueue]);

  // ── Chat logic ────────────────────────────────────────────────────────────
  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || isThinking) return;

    // Voice/PTT input interrupts current speech; typed input while speaking is queued
    if (isAvatarSpeakingRef.current) {
      if (textToSend) {
        onClearSpeech?.();
        pendingTtsRef.current = [];
        ttsDrainRunningRef.current = false;
        ttsActiveFetchesRef.current = 0;
        setIsTtsBusy(false);
        isAvatarSpeakingRef.current = false;
        pendingMessageQueueRef.current = [];
        setQueuedMessageCount(0);
      } else {
        pendingMessageQueueRef.current.push(text);
        setQueuedMessageCount(pendingMessageQueueRef.current.length);
        return;
      }
    }

    const newUserMessage: Message = { id: messageIdRef.current++, text, sender: "user", timestamp: new Date() };
    setMessages((prev) => [...prev, newUserMessage]);
    if (!textToSend) setInput("");

    onClearSpeech?.();
    pendingTtsRef.current = [];
    ttsDrainRunningRef.current = false;
    ttsActiveFetchesRef.current = 0;
    setIsTtsBusy(false);
    setIsThinking(true);
    isAvatarSpeakingRef.current = true;

    const history = messages.map(msg => ({ role: msg.sender, text: msg.text }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          conversation_id: conversationIdRef.current,
          language: currentLanguage,
        }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          sessionStorage.removeItem(KIOSK_CHAT_ENTRY_KEY);
          setIsThinking(false);
          router.replace("/");
          return;
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Chat API error (${res.status})`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      let gesture: AvatarGesture = "idle";
      const botMessageId = messageIdRef.current++;
      let fullText = "";
      let messageAdded = false;
      let sseBuffer = "";
      let sentenceBuffer = "";
      let showQrDetected = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));

            if (parsed.type === "conversation_id") {
              conversationIdRef.current = parsed.value;
            } else if (parsed.type === "gesture") {
              gesture = parsed.value;
            } else if (parsed.type === "chunk") {
              setIsThinking(false);
              // Strip QR marker before display and TTS
              let chunkVal = parsed.value.replace(/\[SHOW_QR\]/gi, "");
              if (chunkVal !== parsed.value) showQrDetected = true;
              if (!messageAdded) chunkVal = stripLeadingGesture(chunkVal);
              fullText += chunkVal;
              sentenceBuffer += chunkVal;

              if (!messageAdded) {
                setMessages((prev) => [...prev, { id: botMessageId, text: fullText, sender: "bot", timestamp: new Date() }]);
                messageAdded = true;
              } else {
                setMessages((prev) => prev.map((m) => m.id === botMessageId ? { ...m, text: fullText } : m));
              }

              // Enqueue TTS for each complete sentence in order
              const { sentences, rest } = extractSentences(sentenceBuffer);
              sentenceBuffer = rest;
              for (const sentence of sentences) {
                const cleaned = cleanTextForTTS(sentence, currentLanguage);
                if (cleaned) enqueueTts(cleaned, gesture);
              }
            } else if (parsed.type === "done") {
              setIsThinking(false);
              if (!messageAdded) {
                setMessages((prev) => [...prev, {
                  id: botMessageId,
                  text: fullText || localeStrings.chat.errorEmpty,
                  sender: "bot",
                  timestamp: new Date(),
                }]);
              }
              // Flush any remaining text that didn't end with punctuation
              const remaining = sentenceBuffer.trim();
              if (remaining) enqueueTts(cleanTextForTTS(remaining, currentLanguage), gesture);
              // Show QR and speak the prompt when marker was detected
              if (showQrDetected) {
                setMessages((prev) =>
                  prev.map((m) => m.id === botMessageId ? { ...m, showQr: true } : m)
                );
                enqueueTts(localeStrings.chat.qrTts, gesture);
              }
            } else if (parsed.type === "show_qr") {
              setMessages((prev) =>
                prev.map((m) => m.id === botMessageId ? { ...m, showQr: true } : m)
              );
            } else if (parsed.type === "error") {
              throw new Error(parsed.value);
            }
          } catch {
            // skip malformed SSE event
          }
        }
      }
    } catch (error) {
      console.error("Chat API error:", error);
      setIsThinking(false);
      setMessages((prev) => [...prev, {
        id: messageIdRef.current++,
        text: localeStrings.chat.errorSystem,
        sender: "bot",
        timestamp: new Date(),
      }]);
    }
  };

  // ── Speech recognition ────────────────────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = currentLanguage;
    recognition.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      if (t.trim()) handleSend(t);
    };
    recognition.onerror = recognition.onend = () => {
      isRecordingRef.current = false;
      setIsRecording(false);
      onRecordingStatusChange?.(false);
    };
    recognitionRef.current = recognition;
    return () => recognitionRef.current?.stop();
  }, [currentLanguage, onRecordingStatusChange]);

  const startRecord = useCallback(() => {
    if (recognitionRef.current && !isRecordingRef.current) {
      try {
        recognitionRef.current.start();
        isRecordingRef.current = true;
        setIsRecording(true);
        onRecordingStatusChange?.(true);
      } catch { }
    }
  }, [onRecordingStatusChange]);

  const stopRecord = useCallback(() => {
    if (recognitionRef.current && isRecordingRef.current) {
      try { recognitionRef.current.stop(); } catch { }
    }
  }, []);

  const handlePushToTalkStart = () => {
    if (!isPressingRef.current) { isPressingRef.current = true; startRecord(); }
  };
  const handlePushToTalkEnd = () => {
    if (isPressingRef.current) { isPressingRef.current = false; stopRecord(); }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault(); handlePushToTalkStart();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); handlePushToTalkEnd(); }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Sync external PTT state
  useEffect(() => {
    if (isPttHoveredOrPressed) {
      handlePushToTalkStart();
    } else {
      handlePushToTalkEnd();
    }
  }, [isPttHoveredOrPressed]);

  const toggleLanguage = () => {
    if (availableLanguages.length > 1) {
      setCurrentLanguageIndex((p) => (p + 1) % availableLanguages.length);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shadow-sm z-10">
        <span className="text-base font-bold text-[#0a2240] flex-shrink-0">{localeStrings.chat.header}</span>
        <div className="flex items-center gap-2 min-w-0">
          {queuedMessageCount > 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
              {localeStrings.chat.waiting(queuedMessageCount)}
            </span>
          )}
          {isTtsBusy && (
            <span className="text-xs text-gray-400 animate-pulse whitespace-nowrap flex-shrink-0">{localeStrings.chat.speaking}</span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-full p-1 transition-colors hover:bg-gray-100 text-gray-500"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Messages Area ── */}
      <div
        className="flex-1 overflow-y-auto px-5 py-6 bg-[#f8f9fa]"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}
      >
        <div className="flex flex-col gap-5">
          {messages.map((message) => (
            <div key={message.id}>
              {message.sender === "bot" ? (
                <div className="flex items-start gap-3 w-full">
                  <BotAvatar />
                  <div className="flex-1 min-w-0">
                    <div
                      className="rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] shadow-sm prose prose-sm max-w-none text-[#1e293b]"
                      style={{ background: "white", border: "1px solid #f1f5f9", lineHeight: 1.5, display: "inline-block" }}
                    >
                      <ReactMarkdown components={botMarkdownComponents}>
                        {message.text.replace(/\[SHOW_QR\]/g, "").trim()}
                      </ReactMarkdown>
                    </div>
                    <p className="mt-1.5 ml-1 text-[11px] font-medium text-gray-400" suppressHydrationWarning>
                      {formatTime(message.timestamp)}
                    </p>
                    {message.showQr && (
                      <div className="mt-3 ml-1">
                        <p className="text-[11px] text-gray-500 mb-1.5">{localeStrings.chat.qrCaption}</p>
                        <img
                          src="/qrcode.svg"
                          alt="Location QR Code"
                          className="w-32 h-32 rounded-lg border border-gray-200 bg-white p-1"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-end w-full pl-8">
                  <div
                    className="rounded-2xl rounded-tr-sm px-4 py-3 text-[15px] shadow-sm ml-auto whitespace-pre-wrap"
                    style={{ background: "#0a2240", color: "white", lineHeight: 1.5, display: "inline-block" }}
                  >
                    {message.text}
                  </div>
                  <p className="mt-1.5 mr-1 text-[11px] font-medium text-gray-400" suppressHydrationWarning>
                    {formatTime(message.timestamp)}
                  </p>
                </div>
              )}
            </div>
          ))}
          {isThinking && (
            <div className="flex items-start gap-3 w-full">
              <BotAvatar />
              <div
                className="rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1.5"
                style={{ background: "white", border: "1px solid #f1f5f9" }}
              >
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input Area ── */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-1.5 focus-within:border-[#0a2240] focus-within:ring-1 focus-within:ring-[#0a2240] transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder={isThinking ? localeStrings.chat.thinking : localeStrings.chat.placeholder}
            disabled={isThinking}
            className="flex-1 bg-transparent px-2 text-[15px] text-[#0a2240] placeholder-gray-400 focus:outline-none disabled:opacity-50"
          />

          {availableLanguages.length > 1 && (
            <button
              onClick={toggleLanguage}
              className="flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-gray-400 hover:text-[#0a2240] hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
            >
              {currentLanguage.split("-")[0].toUpperCase()}
            </button>
          )}

          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="flex-shrink-0 flex items-center justify-center rounded-full bg-[#2323a8] text-white transition-opacity disabled:opacity-40 shadow-sm hover:opacity-90"
            style={{ width: 34, height: 34 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: -1, marginTop: 1 }}>
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        <p className="mt-3 text-center text-[10px] font-medium text-gray-400">
          {localeStrings.chat.privacy}
        </p>
      </div>
    </div>
  );
}
