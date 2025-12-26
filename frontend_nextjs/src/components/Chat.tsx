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

export default function Chat({ onBotMessage, language = "en-US" }: ChatProps) {
  // State
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Hello! I'm your avatar chatbot. How can I help you today?",
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

  // Keep ref in sync with state
  useEffect(() => {
    selectedVoiceNameRef.current = selectedVoiceName;
  }, [selectedVoiceName]);

  // Text-to-speech function
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
        let voiceToUse =
          availableVoices.find((v) => v.name === selectedName) || null;

        if (!voiceToUse) {
          const langPrefix = currentLanguage.split("-")[0];
          voiceToUse =
            availableVoices.find((v) => v.lang.startsWith(langPrefix)) ||
            availableVoices[0];
        }

        if (voiceToUse) {
          utterance.voice = voiceToUse;
        }
      }

      synthRef.current.speak(utterance);
    },
    [ttsEnabled, currentLanguage]
  );

  // Cleanup TTS on unmount or disable
  useEffect(() => {
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!ttsEnabled) {
      synthRef.current?.cancel();
    }
  }, [ttsEnabled]);

  // Message handling
  const handleSend = (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim()) return;

    const newMessage: Message = {
      id: messageIdRef.current++,
      text: text,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    if (!textToSend) {
      setInput("");
    }

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

  // Speech recognition initialization
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    setIsSupported(true);

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = currentLanguage;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) {
        handleSend(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      isRecordingRef.current = false;
      setIsRecording(false);
    };

    recognition.onend = () => {
      isRecordingRef.current = false;
      setIsRecording(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognitionRef.current?.stop();
    };
  }, [currentLanguage]);

  // Recording controls
  const startRecording = useCallback(() => {
    if (recognitionRef.current && !isRecordingRef.current) {
      try {
        recognitionRef.current.start();
        isRecordingRef.current = true;
        setIsRecording(true);
      } catch (error) {
        console.error("Failed to start recording:", error);
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecordingRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error("Failed to stop recording:", error);
      }
    }
  }, []);

  const handlePushToTalkStart = () => {
    if (!isPressingRef.current) {
      isPressingRef.current = true;
      startRecording();
    }
  };

  const handlePushToTalkEnd = () => {
    if (isPressingRef.current) {
      isPressingRef.current = false;
      stopRecording();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        handlePushToTalkStart();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        handlePushToTalkEnd();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Language toggle
  const toggleLanguage = () => {
    if (availableLanguages.length > 1) {
      setCurrentLanguageIndex((prev) => (prev + 1) % availableLanguages.length);
      setIsVoiceManuallySelected(false);
    }
  };

  // Voice selection helpers
  const filteredVoices = voices.filter((voice) => {
    const langPrefix = currentLanguage.split("-")[0];
    return voice.lang.startsWith(langPrefix);
  });

  const handleVoiceChange = (newVoiceName: string) => {
    setSelectedVoiceName(newVoiceName);
    selectedVoiceNameRef.current = newVoiceName;
    setIsVoiceManuallySelected(true);
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Chat
          </h2>
          {ttsSupported && (
            <div className="flex items-center gap-2">
              {ttsEnabled && filteredVoices.length > 0 && (
                <select
                  value={selectedVoiceName || filteredVoices[0].name}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
                  title="Select voice"
                >
                  {filteredVoices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name}
                      {voice.lang !== currentLanguage && ` (${voice.lang})`}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => {
                  setTtsEnabled(!ttsEnabled);
                  if (!ttsEnabled) {
                    synthRef.current?.cancel();
                  }
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  ttsEnabled
                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                }`}
                title={ttsEnabled ? "Text-to-speech enabled" : "Text-to-speech disabled"}
              >
                {ttsEnabled ? "🔊 TTS On" : "🔇 TTS Off"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.sender === "user"
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                }`}
              >
                <p className="text-sm">{message.text}</p>
                <p
                  className={`mt-1 text-xs ${
                    message.sender === "user"
                      ? "text-zinc-300 dark:text-zinc-600"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {formatTime(message.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type your message..."
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
          />
          {isSupported && availableLanguages.length > 1 && (
            <button
              onClick={toggleLanguage}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              title={`Current language: ${getLanguageName(currentLanguage)}. Click to switch.`}
            >
              {getLanguageName(currentLanguage)}
            </button>
          )}
          {isSupported && (
            <button
              onMouseDown={handlePushToTalkStart}
              onMouseUp={handlePushToTalkEnd}
              onMouseLeave={handlePushToTalkEnd}
              onTouchStart={(e) => {
                e.preventDefault();
                handlePushToTalkStart();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handlePushToTalkEnd();
              }}
              className={`relative flex items-center justify-center rounded-lg px-6 py-2 font-medium text-white transition-all ${
                isRecording
                  ? "bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 animate-pulse"
                  : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
              }`}
              title="Hold to talk (or press Space)"
            >
              {isRecording ? (
                <>
                  <span className="mr-2 h-2 w-2 rounded-full bg-white"></span>
                  Recording...
                </>
              ) : (
                <>
                  <svg
                    className="mr-2 h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                  Push to Talk
                </>
              )}
            </button>
          )}
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="rounded-lg bg-zinc-900 px-6 py-2 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Send
          </button>
        </div>
        {isSupported && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            💡 Hold the button or press Space to record your message
            {availableLanguages.length > 1 && (
              <>
                {" "}
                • Current language: <strong>{getLanguageName(currentLanguage)}</strong> (click
                language button to switch)
              </>
            )}
          </p>
        )}
        {!isSupported && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            ⚠️ Speech recognition is not supported in your browser
          </p>
        )}
      </div>
    </div>
  );
}
