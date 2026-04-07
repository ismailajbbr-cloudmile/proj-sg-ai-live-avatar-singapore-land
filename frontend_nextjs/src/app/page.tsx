"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useIdleLogout } from "@/hooks/useIdleLogout";

// Page Name: Lobby
// Route: /
// Description: Pre-call lobby screen — Marina Square theme

const AVATAR_NAME = "Marina Square AI Concierge";


function SingaporeLandLogo() {
  return (
    <div className="flex items-center gap-3">
      {/* Abstract logo mark approximation */}
      <div className="flex items-end h-[40px] gap-0.5">
        <div className="w-[12px] h-[24px] bg-[#0a2240]" style={{ clipPath: "polygon(0 30%, 100% 0, 100% 100%, 0 100%)" }} />
        <div className="w-[12px] h-[36px] bg-[#0a2240]" style={{ clipPath: "polygon(0 15%, 100% 0, 100% 100%, 0 100%)" }} />
        <div className="w-[12px] h-[20px] bg-[#e8197a]" style={{ clipPath: "polygon(0 0, 100% 30%, 100% 100%, 0 100%)" }} />
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
  const [isStarting, setIsStarting] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [idleTimeout, setIdleTimeout] = useState<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch user info and config on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.is_admin === true) setIsAdmin(true);
      })
      .catch(() => {});

    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.session_idle_timeout_minutes === "number") {
          setIdleTimeout(d.session_idle_timeout_minutes);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-logout on idle
  useIdleLogout(idleTimeout);

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
      sessionStorage.setItem("selectedLang", "en-US");
      router.push("/chat");
    } catch (err: unknown) {
      console.warn("Media permission error:", err instanceof Error ? err.message : err);
      setPermError("Camera/Mic access denied. Continuing with text only...");
      sessionStorage.setItem("selectedLang", "en-US");
      setTimeout(() => router.push("/chat"), 1800);
    }
  };

  return (
    <div className="relative flex h-screen w-full justify-center overflow-hidden bg-[#f8f9fa]">

      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 h-20 bg-white shadow-sm flex items-center justify-between px-8 z-10 w-full">
        <img src="/logo-marinasquare.png" alt="Marina Square" className="h-12 object-contain" />
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-sm font-medium text-[#0a2240] border border-[#0a2240]/20 rounded-full px-4 py-2 hover:bg-[#0a2240] hover:text-white transition-colors"
            >
              Admin Panel
            </Link>
          )}
          <div className="text-[#0a2240] font-medium tracking-wide">
            AI Concierge Kiosk
          </div>
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
        <div className="mt-8 mb-4 flex items-center bg-white p-3 rounded-full shadow-lg border border-gray-100">
          <button
            onClick={handleStartChat}
            disabled={isStarting}
            className="flex items-center gap-3 rounded-full px-10 py-3.5 text-[15px] font-bold text-white shadow-xl shadow-[#2323a8]/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:hover:scale-100"
            style={{
              background: isStarting ? "#1a1a8a" : "linear-gradient(135deg, #2323a8 0%, #00b5ad 100%)",
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
