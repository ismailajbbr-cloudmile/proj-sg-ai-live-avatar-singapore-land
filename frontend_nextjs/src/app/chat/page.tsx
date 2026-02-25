"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";

// Page Name: Chat (In-call)
// Route: /chat
// Description: Full-screen avatar video-call interface with floating chat panel

const AVATAR_NAME = "Sofia";
const TALKING_DURATION_MS = 3000;

function CallTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <span className="text-sm font-medium text-white/80 tabular-nums">
      {mm}:{ss}
    </span>
  );
}

interface ToolbarBtnProps {
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  label?: string;
  dropdown?: boolean;
}

function ToolbarBtn({ active, danger, children, onClick, label, dropdown }: ToolbarBtnProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex flex-col items-center gap-1 focus:outline-none group"
    >
      <div
        className="flex items-center justify-center gap-0.5 rounded-full transition-all"
        style={{
          width: 44,
          height: 44,
          background: danger
            ? "#ef4444"
            : active
              ? "rgba(255,255,255,0.25)"
              : "rgba(255,255,255,0.12)",
        }}
      >
        {children}
        {dropdown && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </div>
      {label && (
        <span className="text-[10px] text-white/60 group-hover:text-white/90 transition">
          {label}
        </span>
      )}
    </button>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const [isTalking, setIsTalking] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [lang, setLang] = useState("en-US");

  // Read language chosen in lobby
  useEffect(() => {
    const stored = sessionStorage.getItem("selectedLang");
    if (stored) setLang(stored);
  }, []);

  const handleBotMessage = () => {
    setIsTalking(true);
    setTimeout(() => setIsTalking(false), TALKING_DURATION_MS);
  };

  const handleHangUp = () => {
    router.push("/");
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden" style={{ background: "#000" }}>
      {/* ── Full-screen Avatar ── */}
      <div className="absolute inset-0">
        <Avatar isTalking={isTalking} />
      </div>

      {/* ── Top Header Bar ── */}
      <div
        className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, transparent 100%)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">{AVATAR_NAME}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
          </svg>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
          >
            {/* sparkle icon */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Create interactive AI avatar
          </button>
          <button
            onClick={handleHangUp}
            className="flex items-center justify-center rounded-full transition hover:bg-white/20"
            style={{ width: 32, height: 32, background: "rgba(255,255,255,0.12)" }}
            title="Exit"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Chat Panel ── */}
      {isChatOpen && (
        <div className="absolute right-0 top-0 bottom-0 z-20" style={{ width: 340 }}>
          <Chat
            onBotMessage={handleBotMessage}
            language={lang}
            onClose={() => setIsChatOpen(false)}
            avatarName={AVATAR_NAME}
          />
        </div>
      )}

      {/* ── Bottom Toolbar ── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex items-end justify-between px-8 py-5"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)" }}
      >
        {/* Timer */}
        <div className="flex items-center gap-2 pb-1">
          <CallTimer />
        </div>

        {/* Center buttons */}
        <div className="flex items-end gap-5">
          <ToolbarBtn active={isMicOn} onClick={() => setIsMicOn((p) => !p)} label={isMicOn ? "Mic" : "Mic off"}>
            {isMicOn ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </ToolbarBtn>

          <ToolbarBtn active={isCamOn} onClick={() => setIsCamOn((p) => !p)} label={isCamOn ? "Camera" : "Cam off"}>
            {isCamOn ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </ToolbarBtn>

          <ToolbarBtn label="Avatars" dropdown>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
            </svg>
          </ToolbarBtn>

          <ToolbarBtn active={isChatOpen} onClick={() => setIsChatOpen((p) => !p)} label="Chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </ToolbarBtn>

          <ToolbarBtn danger onClick={handleHangUp} label="End call">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.32.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.26.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z" />
            </svg>
          </ToolbarBtn>
        </div>

        {/* Right spacer */}
        <div style={{ width: 80 }} />
      </div>
    </div>
  );
}
