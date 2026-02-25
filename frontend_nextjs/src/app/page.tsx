"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Page Name: Lobby
// Route: /
// Description: Pre-call lobby screen — shows avatar preview and Start video chat button

const AVATAR_NAME = "Sofia";

const LANGUAGE_OPTIONS = [
  { code: "en-US", label: "English", flag: "🇺🇸" },
  { code: "zh-CN", label: "中文 (简体)", flag: "🇨🇳" },
];

export default function LobbyPage() {
  const router = useRouter();
  const [langIndex, setLangIndex] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [showAvatarsMenu, setShowAvatarsMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup stream if user navigates away before entering
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleStartChat = async () => {
    setIsStarting(true);
    setPermError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      streamRef.current = stream;
      // Store selected language in sessionStorage so /chat can read it
      sessionStorage.setItem("selectedLang", LANGUAGE_OPTIONS[langIndex].code);
      router.push("/chat");
    } catch (err: any) {
      // Permission denied or not supported — still allow entry, just note it
      console.warn("Media permission error:", err.message);
      setPermError(
        "Mic/camera access denied. You can still chat using text."
      );
      sessionStorage.setItem("selectedLang", LANGUAGE_OPTIONS[langIndex].code);
      setTimeout(() => router.push("/chat"), 1800);
    }
  };

  return (
    <div
      className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden"
      style={{ background: "#0f0f0f" }}
    >
      {/* Avatar preview card */}
      <div className="relative mx-auto w-full max-w-3xl flex-1 flex items-center justify-center px-4">
        <div
          className="relative w-full overflow-hidden"
          style={{
            borderRadius: "12px",
            maxHeight: "68vh",
            aspectRatio: "16/9",
            background: "#1a1a1a",
          }}
        >
          {/* Avatar image placeholder — replace with actual 3D canvas if desired */}
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#2a2835] to-[#1a1825]">
            <div className="text-center">
              <div
                className="mx-auto mb-4 flex items-center justify-center rounded-full bg-white/10 text-white"
                style={{ width: 100, height: 100, fontSize: 52 }}
              >
                👤
              </div>
              <p className="text-lg font-semibold text-white">{AVATAR_NAME}</p>
              <p className="text-sm text-white/50">AI Avatar</p>
            </div>
          </div>

          {/* Powered by watermark */}
          <div className="absolute bottom-3 right-4">
            <span className="text-xs font-medium text-white/40">
              Powered by Avatar AI
            </span>
          </div>
        </div>
      </div>

      {/* Error hint */}
      {permError && (
        <p className="mb-2 text-xs text-amber-400 px-4 text-center">
          ⚠️ {permError}
        </p>
      )}

      {/* Bottom bar */}
      <div className="flex items-center gap-3 pb-8 pt-4">
        {/* Avatars button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowAvatarsMenu((p) => !p);
              setShowLangMenu(false);
            }}
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition"
            style={{ background: "#2a2a2a" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/>
            </svg>
            Avatars
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {showAvatarsMenu && (
            <div
              className="absolute bottom-full mb-2 left-0 rounded-xl p-2 shadow-xl w-44"
              style={{ background: "#1e1e1e", border: "1px solid #333" }}
            >
              {["Sofia", "Alex", "Maya"].map((name) => (
                <button
                  key={name}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Language selector */}
        <div className="relative">
          <button
            onClick={() => {
              setShowLangMenu((p) => !p);
              setShowAvatarsMenu(false);
            }}
            className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white transition"
            style={{ background: "#2a2a2a" }}
          >
            <span className="text-lg">{LANGUAGE_OPTIONS[langIndex].flag}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {showLangMenu && (
            <div
              className="absolute bottom-full mb-2 left-0 rounded-xl p-2 shadow-xl w-48"
              style={{ background: "#1e1e1e", border: "1px solid #333" }}
            >
              {LANGUAGE_OPTIONS.map((lang, i) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLangIndex(i);
                    setShowLangMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10 transition"
                >
                  <span className="text-base">{lang.flag}</span>
                  {lang.label}
                  {i === langIndex && (
                    <svg className="ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Start video chat button */}
        <button
          onClick={handleStartChat}
          disabled={isStarting}
          className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition disabled:opacity-70"
          style={{ background: isStarting ? "#16a34a" : "#22c55e", color: "#fff" }}
        >
          {isStarting ? (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.32.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.26.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"/>
            </svg>
          )}
          {isStarting ? "Starting…" : "Start video chat"}
        </button>
      </div>
    </div>
  );
}
