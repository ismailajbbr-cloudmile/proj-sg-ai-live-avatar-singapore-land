"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import type { VisemeFrame, AvatarGesture } from "@/types/viseme";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

interface ChatProps {
  /** Called whenever the bot has a new spoken sentence ready */
  onBotSpeech?: (audioBase64: string, mimeType: string, visemes: VisemeFrame[], gesture: AvatarGesture) => void;
  /** Called when the user sends a new message — clears any queued audio */
  onClearSpeech?: () => void;
  language?: string | string[];
  onClose?: () => void;
  avatarName?: string;
  isPttHoveredOrPressed?: boolean;
  onRecordingStatusChange?: (isRecording: boolean) => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  "en-US": "English (US)",
  "zh-CN": "中文 (简体)",
  "zh-TW": "中文 (繁體)",
  "zh-HK": "中文 (香港)",
};

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

function getLanguageName(lang: string): string {
  return LANGUAGE_NAMES[lang] || lang;
}

/**
 * Strips markdown and expands common abbreviations so the TTS engine reads it naturally.
 */
function cleanTextForTTS(text: string): string {
  let cleaned = text;

  // 1. Remove Markdown formatting
  // Remove bold/italic (* or _)
  cleaned = cleaned.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
  // Remove inline code (`)
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");
  // Remove links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Remove headings (#)
  cleaned = cleaned.replace(/^#+\s+/gm, "");

  // 2. Expand common abbreviations
  cleaned = cleaned.replace(/\be\.g\./gi, "for example");
  cleaned = cleaned.replace(/\bi\.e\./gi, "that is");
  cleaned = cleaned.replace(/\betc\./gi, "and so on");

  return cleaned.trim();
}

/** Splits buffer on sentence boundaries (.?!) followed by whitespace.
 *  Returns complete sentences and the remaining partial sentence. */
function extractSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const regex = /[.?!]+\s+/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(buffer)) !== null) {
    const sentence = buffer.slice(lastIndex, match.index + match[0].length).trim();
    if (sentence) sentences.push(sentence);
    lastIndex = match.index + match[0].length;
  }
  return { sentences, rest: buffer.slice(lastIndex) };
}

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
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: `Welcome to Marina Square. I'm your ${avatarName}. How can I assist you today?`,
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

  // Sequential TTS queue — ensures sentences are spoken in order
  // even if TTS API responses arrive out of order
  const ttsQueueRef = useRef<Array<{ text: string; gesture: AvatarGesture }>>([]);
  const ttsProcessingRef = useRef(false);

  const availableLanguages = getAvailableLanguages(language);
  const [currentLanguageIndex, setCurrentLanguageIndex] = useState(0);
  const currentLanguage = availableLanguages[currentLanguageIndex];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // ── TTS via Next.js API ───────────────────────────────────────────────────
  const speakText = useCallback(async (text: string, gesture: AvatarGesture = "idle") => {
    if (!onBotSpeech) return;
    setIsTtsBusy(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: currentLanguage }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn("[TTS] API error:", err.error ?? res.statusText);
        return;
      }
      const { audioBase64, mimeType, visemes } = await res.json();
      onBotSpeech(audioBase64, mimeType, visemes, gesture);
    } catch (err) {
      console.error("[TTS] fetch failed:", err);
    } finally {
      setIsTtsBusy(false);
    }
  }, [onBotSpeech, currentLanguage]);

  // ── Sequential TTS processor ─────────────────────────────────────────────
  // Drains ttsQueueRef one item at a time, awaiting each speakText call so
  // that onBotSpeech is always invoked in sentence order, never out of order.
  const processTtsQueue = useCallback(async () => {
    if (ttsProcessingRef.current) return;
    ttsProcessingRef.current = true;
    while (ttsQueueRef.current.length > 0) {
      const item = ttsQueueRef.current.shift()!;
      await speakText(item.text, item.gesture);
    }
    ttsProcessingRef.current = false;
  }, [speakText]);

  const enqueueTts = useCallback((text: string, gesture: AvatarGesture) => {
    ttsQueueRef.current.push({ text, gesture });
    processTtsQueue();
  }, [processTtsQueue]);

  // ── Chat logic ────────────────────────────────────────────────────────────
  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || isThinking) return;

    const newUserMessage: Message = { id: messageIdRef.current++, text, sender: "user", timestamp: new Date() };
    setMessages((prev) => [...prev, newUserMessage]);
    if (!textToSend) setInput("");

    onClearSpeech?.();
    ttsQueueRef.current = [];
    ttsProcessingRef.current = false;
    setIsThinking(true);

    const history = messages.map(msg => ({ role: msg.sender, text: msg.text }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok) throw new Error("Failed to fetch from chat API");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      let gesture: AvatarGesture = "idle";
      const botMessageId = messageIdRef.current++;
      let fullText = "";
      let messageAdded = false;
      let sseBuffer = "";
      let sentenceBuffer = "";

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

            if (parsed.type === "gesture") {
              gesture = parsed.value;
            } else if (parsed.type === "chunk") {
              setIsThinking(false);
              fullText += parsed.value;
              sentenceBuffer += parsed.value;

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
                const cleaned = cleanTextForTTS(sentence);
                if (cleaned) enqueueTts(cleaned, gesture);
              }
            } else if (parsed.type === "done") {
              setIsThinking(false);
              if (!messageAdded) {
                setMessages((prev) => [...prev, { id: botMessageId, text: fullText || "Sorry, I am having trouble responding right now.", sender: "bot", timestamp: new Date() }]);
              }
              // Flush any remaining text that didn't end with punctuation
              const remaining = sentenceBuffer.trim();
              if (remaining) enqueueTts(cleanTextForTTS(remaining), gesture);
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
        text: "I'm sorry, there was a system error when trying to respond.",
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
        <span className="text-base font-bold text-[#0a2240]">Conversation</span>
        <div className="flex items-center gap-3">
          {isTtsBusy && (
            <span className="text-xs text-gray-400 animate-pulse">Speaking…</span>
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
                      <ReactMarkdown
                        components={{
                          p: ({ node, ...props }) => <p className="m-0" {...props} />,
                          a: ({ node, ...props }) => <a className="text-[#0a2240] font-semibold hover:underline" {...props} />
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    </div>
                    <p className="mt-1.5 ml-1 text-[11px] font-medium text-gray-400" suppressHydrationWarning>
                      {formatTime(message.timestamp)}
                    </p>
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
            placeholder={isThinking ? "AI is thinking..." : "Type your message..."}
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
          Powered by CloudMile &bull; Your privacy is protected
        </p>
      </div>
    </div>
  );
}
