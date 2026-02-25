"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Page Name: Lobby
// Route: /
// Description: Pre-call lobby screen — Singapore Land corporate theme

const AVATAR_NAME = "Singapore Land AI Concierge";

const LANGUAGE_OPTIONS = [
  { code: "en-US", label: "English", flag: "🇺🇸" },
  { code: "zh-CN", label: "中文 (简体)", flag: "🇨🇳" },
];

function SingaporeLandLogo() {
  return (
    <div className="flex items-center gap-3">
      {/* Abstract logo mark approximation */}
      <div className="flex items-end h-[40px] gap-0.5">
        <div className="w-[12px] h-[24px] bg-[#0a2240]" style={{ clipPath: "polygon(0 30%, 100% 0, 100% 100%, 0 100%)" }} />
        <div className="w-[12px] h-[36px] bg-[#0a2240]" style={{ clipPath: "polygon(0 15%, 100% 0, 100% 100%, 0 100%)" }} />
        <div className="w-[12px] h-[20px] bg-[#c89b3c]" style={{ clipPath: "polygon(0 0, 100% 30%, 100% 100%, 0 100%)" }} />
      </div>
      {/* Logotype */}
      <div className="flex flex-col">
        <span
          className="text-[#0a2240] font-bold text-2xl tracking-[0.15em] leading-none"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          SINGAPORELAND
        </span>
      </div>
    </div>
  );
}

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
      sessionStorage.setItem("selectedLang", LANGUAGE_OPTIONS[langIndex].code);
      router.push("/chat");
    } catch (err: any) {
      console.warn("Media permission error:", err.message);
      setPermError("Camera/Mic access denied. Continuing with text only...");
      sessionStorage.setItem("selectedLang", LANGUAGE_OPTIONS[langIndex].code);
      setTimeout(() => router.push("/chat"), 1800);
    }
  };

  return (
    <div className="relative flex h-screen w-full justify-center overflow-hidden bg-[#f8f9fa]">

      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 h-20 bg-white shadow-sm flex items-center justify-between px-8 z-10 w-full">
        <img src="/logo.png" alt="Singapore Land Group" className="h-12 object-contain" />
        <div className="text-[#0a2240] font-medium tracking-wide">
          AI Concierge Kiosk
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative w-full max-w-5xl flex flex-col items-center justify-center pt-24 pb-8 px-4 h-full">

        {/* Avatar preview card */}
        <div className="relative w-full overflow-hidden rounded-2xl shadow-2xl shadow-black/5 bg-white border border-gray-100 flex-1 max-h-[70vh] flex flex-col">
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#f0f4f8] to-white">
            <div className="text-center">
              <div
                className="mx-auto mb-6 flex items-center justify-center rounded-full bg-[#0a2240] text-white shadow-lg"
                style={{ width: 120, height: 120, fontSize: 60 }}
              >
                👤
              </div>
              <h1 className="text-3xl font-bold text-[#0a2240] mb-2">{AVATAR_NAME}</h1>
              <p className="text-[#64748b] text-lg">Tap to start a conversation</p>
            </div>
          </div>
        </div>

        {/* Error hint */}
        {permError && (
          <p className="mt-4 text-sm font-medium text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
            ⚠️ {permError}
          </p>
        )}

        {/* Bottom controls */}
        <div className="mt-8 mb-4 flex items-center gap-4 bg-white p-3 rounded-full shadow-lg border border-gray-100">

          {/* Avatars button */}
          <div className="relative">
            <button
              onClick={() => {
                setShowAvatarsMenu((p) => !p);
                setShowLangMenu(false);
              }}
              className="flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-[#0a2240] hover:bg-gray-50 transition"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.85" />
              </svg>
              Select Concierge
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showAvatarsMenu && (
              <div className="absolute bottom-full mb-3 left-0 rounded-xl p-2 shadow-xl shadow-black/10 w-48 bg-white border border-gray-100 z-50">
                {["Sofia", "David", "Elena"].map((name) => (
                  <button key={name} className="w-full rounded-lg px-4 py-3 text-left font-medium text-[#0a2240] hover:bg-gray-50 transition">
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-8 bg-gray-200"></div>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowLangMenu((p) => !p);
                setShowAvatarsMenu(false);
              }}
              className="flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-[#0a2240] hover:bg-gray-50 transition"
            >
              <span className="text-xl">{LANGUAGE_OPTIONS[langIndex].flag}</span>
              {LANGUAGE_OPTIONS[langIndex].code.split('-')[0].toUpperCase()}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showLangMenu && (
              <div className="absolute bottom-full mb-3 left-0 rounded-xl p-2 shadow-xl shadow-black/10 w-56 bg-white border border-gray-100 z-50">
                {LANGUAGE_OPTIONS.map((lang, i) => (
                  <button
                    key={lang.code}
                    onClick={() => { setLangIndex(i); setShowLangMenu(false); }}
                    className="flex w-full items-center gap-3 rounded-lg px-4 py-3 font-medium text-[#0a2240] hover:bg-gray-50 transition"
                  >
                    <span className="text-xl">{lang.flag}</span>
                    {lang.label}
                    {i === langIndex && (
                      <svg className="ml-auto" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c89b3c" strokeWidth="3">
                        <path d="M20 6L9 17l-5-5" />
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
            className="flex items-center gap-3 rounded-full px-10 py-3.5 text-[15px] font-bold text-white shadow-xl shadow-[#c89b3c]/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:hover:scale-100"
            style={{
              background: isStarting ? "#b38a36" : "linear-gradient(135deg, #c89b3c 0%, #a67c2b 100%)",
            }}
          >
            {isStarting ? (
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.32.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.26.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z" />
              </svg>
            )}
            {isStarting ? "Connecting..." : "Tap to Start"}
          </button>
        </div>
      </div>
    </div>
  );
}
