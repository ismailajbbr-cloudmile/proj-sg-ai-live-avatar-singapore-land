"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

// Format time consistently to avoid hydration mismatches
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

interface ChatProps {
  onBotMessage?: () => void;
  language?: string | string[]; // Language code(s) for speech recognition
  // Examples: "en-US", "zh-CN", ["en-US", "zh-CN"], "en-US,zh-CN"
}

// Speech Recognition types
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export default function Chat({ onBotMessage, language = "en-US" }: ChatProps) {
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
  const recognitionRef = useRef<any>(null);
  const isPressingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const messageIdRef = useRef(2);

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

    // Simulate bot response
    setTimeout(() => {
      const botResponse: Message = {
        id: messageIdRef.current++,
        text: "I received your message: " + text,
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botResponse]);
      
      // Trigger talking animation
      if (onBotMessage) {
        onBotMessage();
      }
    }, 500);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      
      // Normalize language prop to comma-separated string
      let languageString: string;
      if (!language) {
        languageString = "en-US";
      } else if (Array.isArray(language)) {
        languageString = language.join(",");
      } else {
        languageString = language;
      }
      
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = languageString;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript.trim()) {
          // Send the transcript directly
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
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language]);

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

  // Handle keyboard shortcut (Space bar for push-to-talk)
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

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      {/* Chat Header */}
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Chat
        </h2>
      </div>

      {/* Messages Area */}
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
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
          />
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

