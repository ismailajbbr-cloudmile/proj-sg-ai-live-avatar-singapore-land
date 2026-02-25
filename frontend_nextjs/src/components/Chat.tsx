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

// Small rounded icon for bot messages
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
  onBotMessage,
  language = "en-US",
  onClose,
  avatarName = "AI Concierge",
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: `Welcome to Singapore Land Group. I'm your ${avatarName}. How can I assist you today?`,
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

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const selectedVoiceNameRef = useRef<string>("");
  const isPressingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const messageIdRef = useRef(2);

  const availableLanguages = getAvailableLanguages(language);
  const [currentLanguageIndex, setCurrentLanguageIndex] = useState(0);
  const currentLanguage = availableLanguages[currentLanguageIndex];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    synthRef.current = window.speechSynthesis;
    setTtsSupported(true);
    const loadVoices = () => setVoices(synthRef.current?.getVoices() || []);
    loadVoices();
    synthRef.current.addEventListener("voiceschanged", loadVoices);
    return () => synthRef.current?.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    if (voices.length === 0 || !currentLanguage) return;
    const langPrefix = currentLanguage.split("-")[0];
    setSelectedVoiceName((prev) => {
      const currentVoiceMatches = voices.find((v) => v.name === prev)?.lang.startsWith(langPrefix);
      if (!isVoiceManuallySelected || !currentVoiceMatches) {
        const matchingVoice = voices.find((v) => v.lang.startsWith(langPrefix)) || voices[0];
        if (matchingVoice) {
          setIsVoiceManuallySelected(false);
          selectedVoiceNameRef.current = matchingVoice.name;
          return matchingVoice.name;
        }
      }
      return prev;
    });
  }, [currentLanguage, voices, isVoiceManuallySelected]);

  useEffect(() => { selectedVoiceNameRef.current = selectedVoiceName; }, [selectedVoiceName]);

  const speakText = useCallback((text: string) => {
    if (!ttsEnabled || !synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = currentLanguage;
    const availableVoices = synthRef.current.getVoices();
    if (availableVoices.length > 0) {
      const selectedName = selectedVoiceNameRef.current;
      let voiceToUse = availableVoices.find((v) => v.name === selectedName);
      if (!voiceToUse) {
        const langPrefix = currentLanguage.split("-")[0];
        voiceToUse = availableVoices.find((v) => v.lang.startsWith(langPrefix)) || availableVoices[0];
      }
      if (voiceToUse) utterance.voice = voiceToUse;
    }
    synthRef.current.speak(utterance);
  }, [ttsEnabled, currentLanguage]);

  useEffect(() => () => synthRef.current?.cancel(), []);
  useEffect(() => { if (!ttsEnabled) synthRef.current?.cancel(); }, [ttsEnabled]);

  const handleSend = (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { id: messageIdRef.current++, text, sender: "user", timestamp: new Date() }]);
    if (!textToSend) setInput("");

    setTimeout(() => {
      const botResponse: Message = { id: messageIdRef.current++, text: "I received your message: " + text, sender: "bot", timestamp: new Date() };
      setMessages((prev) => [...prev, botResponse]);
      onBotMessage?.();
      speakText(botResponse.text);
    }, 500);
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
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
    recognition.onerror = recognition.onend = () => { isRecordingRef.current = false; setIsRecording(false); };
    recognitionRef.current = recognition;
    return () => recognitionRef.current?.stop();
  }, [currentLanguage]);

  const startRecord = useCallback(() => {
    if (recognitionRef.current && !isRecordingRef.current) {
      try { recognitionRef.current.start(); isRecordingRef.current = true; setIsRecording(true); } catch { }
    }
  }, []);
  const stopRecord = useCallback(() => {
    if (recognitionRef.current && isRecordingRef.current) { try { recognitionRef.current.stop(); } catch { } }
  }, []);

  const handlePushToTalkStart = () => { if (!isPressingRef.current) { isPressingRef.current = true; startRecord(); } };
  const handlePushToTalkEnd = () => { if (isPressingRef.current) { isPressingRef.current = false; stopRecord(); } };

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); handlePushToTalkStart(); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); handlePushToTalkEnd(); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const toggleLanguage = () => {
    if (availableLanguages.length > 1) { setCurrentLanguageIndex((p) => (p + 1) % availableLanguages.length); setIsVoiceManuallySelected(false); }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shadow-sm z-10">
        <span className="text-base font-bold text-[#0a2240]">Conversation</span>
        <div className="flex items-center gap-3">
          {ttsSupported && (
            <button
              onClick={() => setTtsEnabled((p) => !p)}
              className="rounded-lg p-1.5 transition-colors hover:bg-gray-100"
              style={{ color: ttsEnabled ? "#0a2240" : "#94a3b8" }}
              title={ttsEnabled ? "TTS On" : "TTS Off"}
            >
              {ttsEnabled ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
              )}
            </button>
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
                      className="rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] shadow-sm"
                      style={{ background: "white", color: "#1e293b", border: "1px solid #f1f5f9", lineHeight: 1.5, display: "inline-block" }}
                    >
                      {message.text}
                    </div>
                    <p className="mt-1.5 ml-1 text-[11px] font-medium text-gray-400">
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-end w-full pl-8">
                  <div
                    className="rounded-2xl rounded-tr-sm px-4 py-3 text-[15px] shadow-sm ml-auto"
                    style={{ background: "#0a2240", color: "white", lineHeight: 1.5, display: "inline-block" }}
                  >
                    {message.text}
                  </div>
                  <p className="mt-1.5 mr-1 text-[11px] font-medium text-gray-400">
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
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-1.5 focus-within:border-[#0a2240] focus-within:ring-1 focus-within:ring-[#0a2240] transition-all">

          {/* Push to talk */}
          {isSupported && (
            <button
              onMouseDown={handlePushToTalkStart}
              onMouseUp={handlePushToTalkEnd}
              onMouseLeave={handlePushToTalkEnd}
              onTouchStart={(e) => { e.preventDefault(); handlePushToTalkStart(); }}
              onTouchEnd={(e) => { e.preventDefault(); handlePushToTalkEnd(); }}
              className={`flex-shrink-0 flex items-center justify-center rounded-full transition-colors ${isRecording ? "bg-red-500 text-white animate-pulse shadow-md" : "bg-white text-gray-500 hover:text-[#0a2240] shadow-sm border border-gray-100"
                }`}
              style={{ width: 34, height: 34 }}
              title="Hold to talk (Space)"
            >
              {isRecording ? (
                <div className="h-2.5 w-2.5 rounded-full bg-white" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                </svg>
              )}
            </button>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type your message..."
            className="flex-1 bg-transparent px-2 text-[15px] text-[#0a2240] placeholder-gray-400 focus:outline-none"
          />

          {/* Lang toggle */}
          {availableLanguages.length > 1 && (
            <button
              onClick={toggleLanguage}
              className="flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-gray-400 hover:text-[#0a2240] hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
            >
              {currentLanguage.split("-")[0].toUpperCase()}
            </button>
          )}

          {/* Send */}
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="flex-shrink-0 flex items-center justify-center rounded-full bg-[#c89b3c] text-white transition-opacity disabled:opacity-40 shadow-sm hover:opacity-90"
            style={{ width: 34, height: 34 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: -1, marginTop: 1 }}>
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* Footer info text */}
        <p className="mt-3 text-center text-[10px] font-medium text-gray-400">
          Powered by CloudMile &bull; Your privacy is protected
        </p>
      </div>
    </div>
  );
}
