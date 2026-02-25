"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

interface ChatProps {
  onBotMessage?: () => void;
  language?: string | string[];
  onClose?: () => void;
  avatarName?: string;
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  "en-US": "English",
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

// Small avatar icon for bot messages
function BotAvatar() {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full text-white text-xs font-bold"
      style={{ width: 28, height: 28, background: "#5a4fcf", fontSize: 11 }}
    >
      AI
    </div>
  );
}

export default function Chat({
  onBotMessage,
  language = "en-US",
  onClose,
  avatarName = "Sofia",
}: ChatProps) {
  // State
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: `Hi! I'm ${avatarName}. How can I help you today?`,
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>("");
  const [isVoiceManuallySelected, setIsVoiceManuallySelected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Refs
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const selectedVoiceNameRef = useRef<string>("");
  const isPressingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const messageIdRef = useRef(2);

  // Language management
  const availableLanguages = getAvailableLanguages(language);
  const [currentLanguageIndex, setCurrentLanguageIndex] = useState(0);
  const currentLanguage = availableLanguages[currentLanguageIndex];

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    synthRef.current = window.speechSynthesis;
    setTtsSupported(true);
    const loadVoices = () => {
      const availableVoices = synthRef.current?.getVoices() || [];
      setVoices(availableVoices);
    };
    loadVoices();
    synthRef.current.addEventListener("voiceschanged", loadVoices);
    return () => {
      synthRef.current?.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  // Auto-select voice when language or voices change
  useEffect(() => {
    if (voices.length === 0 || !currentLanguage) return;
    const langPrefix = currentLanguage.split("-")[0];
    setSelectedVoiceName((prevName) => {
      const currentVoice = voices.find((v) => v.name === prevName);
      const currentVoiceMatches = currentVoice?.lang.startsWith(langPrefix);
      if (!isVoiceManuallySelected || !currentVoiceMatches) {
        const matchingVoice =
          voices.find((voice) => voice.lang.startsWith(langPrefix)) || voices[0];
        if (matchingVoice) {
          setIsVoiceManuallySelected(false);
          selectedVoiceNameRef.current = matchingVoice.name;
          return matchingVoice.name;
        }
      }
      return prevName;
    });
  }, [currentLanguage, voices, isVoiceManuallySelected]);

  useEffect(() => {
    selectedVoiceNameRef.current = selectedVoiceName;
  }, [selectedVoiceName]);

  // Text-to-speech
  const speakText = useCallback(
    (text: string) => {
      if (!ttsEnabled || !synthRef.current) return;
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = currentLanguage;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      const availableVoices = synthRef.current.getVoices();
      if (availableVoices.length > 0) {
        const selectedName = selectedVoiceNameRef.current;
        let voiceToUse = availableVoices.find((v) => v.name === selectedName) || null;
        if (!voiceToUse) {
          const langPrefix = currentLanguage.split("-")[0];
          voiceToUse =
            availableVoices.find((v) => v.lang.startsWith(langPrefix)) || availableVoices[0];
        }
        if (voiceToUse) utterance.voice = voiceToUse;
      }
      synthRef.current.speak(utterance);
    },
    [ttsEnabled, currentLanguage]
  );

  useEffect(() => () => { synthRef.current?.cancel(); }, []);
  useEffect(() => { if (!ttsEnabled) synthRef.current?.cancel(); }, [ttsEnabled]);

  // Message handling
  const handleSend = (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim()) return;
    const newMessage: Message = {
      id: messageIdRef.current++,
      text,
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    if (!textToSend) setInput("");

    setTimeout(() => {
      const botResponse: Message = {
        id: messageIdRef.current++,
        text: "I received your message: " + text,
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botResponse]);
      onBotMessage?.();
      speakText(botResponse.text);
    }, 500);
  };

  // Speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = currentLanguage;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) handleSend(transcript);
    };
    recognition.onerror = () => {
      isRecordingRef.current = false;
      setIsRecording(false);
    };
    recognition.onend = () => {
      isRecordingRef.current = false;
      setIsRecording(false);
    };
    recognitionRef.current = recognition;
    return () => { recognitionRef.current?.stop(); };
  }, [currentLanguage]);

  const startRecording = useCallback(() => {
    if (recognitionRef.current && !isRecordingRef.current) {
      try {
        recognitionRef.current.start();
        isRecordingRef.current = true;
        setIsRecording(true);
      } catch { }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecordingRef.current) {
      try { recognitionRef.current.stop(); } catch { }
    }
  }, []);

  const handlePushToTalkStart = () => {
    if (!isPressingRef.current) { isPressingRef.current = true; startRecording(); }
  };
  const handlePushToTalkEnd = () => {
    if (isPressingRef.current) { isPressingRef.current = false; stopRecording(); }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) { e.preventDefault(); handlePushToTalkStart(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); handlePushToTalkEnd(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const toggleLanguage = () => {
    if (availableLanguages.length > 1) {
      setCurrentLanguageIndex((prev) => (prev + 1) % availableLanguages.length);
      setIsVoiceManuallySelected(false);
    }
  };

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: "rgba(18, 18, 22, 0.96)",
        backdropFilter: "blur(16px)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <span className="text-sm font-semibold text-white">Avatar chat</span>
        <div className="flex items-center gap-2">
          {/* TTS toggle */}
          {ttsSupported && (
            <button
              onClick={() => setTtsEnabled((p) => !p)}
              className="rounded-md px-2 py-1 text-xs transition"
              style={{
                color: ttsEnabled ? "#60a5fa" : "rgba(255,255,255,0.4)",
                background: ttsEnabled ? "rgba(96,165,250,0.12)" : "transparent",
              }}
              title={ttsEnabled ? "TTS On" : "TTS Off"}
            >
              {ttsEnabled ? "🔊" : "🔇"}
            </button>
          )}
          {/* Close */}
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center justify-center rounded-full transition hover:bg-white/10"
              style={{ width: 28, height: 28 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <div key={message.id}>
              {message.sender === "bot" ? (
                <div className="flex items-start gap-2">
                  <BotAvatar />
                  <div>
                    <div
                      className="rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-white"
                      style={{
                        background: "rgba(255,255,255,0.1)",
                        maxWidth: 240,
                        lineHeight: 1.5,
                      }}
                    >
                      {message.text}
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-end">
                  <div
                    className="rounded-2xl rounded-tr-sm px-3 py-2 text-sm text-white"
                    style={{
                      background: "rgba(255,255,255,0.18)",
                      maxWidth: 220,
                      lineHeight: 1.5,
                    }}
                  >
                    {message.text}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {formatTime(message.timestamp)}
                  </p>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input Area ── */}
      <div className="px-3 pb-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2 rounded-full px-3 py-2" style={{ background: "rgba(255,255,255,0.08)" }}>
          {/* Push to talk */}
          {isSupported && (
            <button
              onMouseDown={handlePushToTalkStart}
              onMouseUp={handlePushToTalkEnd}
              onMouseLeave={handlePushToTalkEnd}
              onTouchStart={(e) => { e.preventDefault(); handlePushToTalkStart(); }}
              onTouchEnd={(e) => { e.preventDefault(); handlePushToTalkEnd(); }}
              className="flex-shrink-0 flex items-center justify-center rounded-full transition"
              style={{
                width: 30,
                height: 30,
                background: isRecording ? "rgba(239,68,68,0.8)" : "rgba(255,255,255,0.12)",
              }}
              title="Hold to talk (Space)"
            >
              {isRecording ? (
                <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                </svg>
              )}
            </button>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder={`Message ${avatarName}`}
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
          />

          {/* Language toggle */}
          {availableLanguages.length > 1 && (
            <button
              onClick={toggleLanguage}
              className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs transition"
              style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
              title={`Language: ${getLanguageName(currentLanguage)}`}
            >
              {currentLanguage.split("-")[0].toUpperCase()}
            </button>
          )}

          {/* Send */}
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="flex-shrink-0 flex items-center justify-center rounded-full transition disabled:opacity-30"
            style={{ width: 30, height: 30, background: "rgba(255,255,255,0.15)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* Privacy hint */}
        <p className="mt-2 text-center text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
          🔒 We don&apos;t share or retain your chats
        </p>
      </div>
    </div>
  );
}
