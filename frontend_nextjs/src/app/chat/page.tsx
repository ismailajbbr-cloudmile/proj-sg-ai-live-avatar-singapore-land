"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";

// Page Name: Chat (In-call)
// Route: /chat
// Description: Singapore Land AI Concierge Interface (Push Animation Layout)

const AVATAR_NAME = "Singapore Land AI Concierge";
const TALKING_DURATION_MS = 3000;

function SingaporeLandLogo() {
  return (
    <div className="flex items-center gap-2">
      {/* Abstract logo mark approximation */}
      <div className="flex items-end h-[24px] gap-0.5">
        <div className="w-[8px] h-[16px] bg-[#0a2240]" style={{ clipPath: "polygon(0 30%, 100% 0, 100% 100%, 0 100%)" }} />
        <div className="w-[8px] h-[24px] bg-[#0a2240]" style={{ clipPath: "polygon(0 15%, 100% 0, 100% 100%, 0 100%)" }} />
        <div className="w-[8px] h-[14px] bg-[#c89b3c]" style={{ clipPath: "polygon(0 0, 100% 30%, 100% 100%, 0 100%)" }} />
      </div>
      {/* Logotype */}
      <div className="flex flex-col">
        <span
          className="text-[#0a2240] font-bold text-lg tracking-[0.1em] leading-none"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          SINGAPORELAND
        </span>
      </div>
    </div>
  );
}

function CallTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <div className="rounded-full bg-white/80 backdrop-blur-md border border-gray-200 px-3 py-1.5 shadow-sm">
      <span className="text-sm font-semibold text-[#0a2240] tabular-nums">
        {mm}:{ss}
      </span>
    </div>
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
      className="flex flex-col items-center gap-1.5 focus:outline-none group"
    >
      <div
        className={`flex items-center justify-center gap-0.5 rounded-full shadow-md transition-all ${danger
            ? "hover:bg-red-600 active:bg-red-700"
            : "hover:scale-105 active:scale-95"
          }`}
        style={{
          width: 52,
          height: 52,
          background: danger
            ? "#ef4444"
            : active
              ? "#0a2240"
              : "white",
          color: danger || active ? "white" : "#0a2240",
          border: danger || active ? "none" : "1px solid #e2e8f0"
        }}
      >
        {children}
        {dropdown && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </div>
      {label && (
        <span className="text-xs font-medium text-[#0a2240] opacity-80 group-hover:opacity-100 transition truncate w-16 text-center">
          {label}
        </span>
      )}
    </button>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const [isTalking, setIsTalking] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [lang, setLang] = useState("en-US");

  useEffect(() => {
    const stored = sessionStorage.getItem("selectedLang");
    if (stored) setLang(stored);

    // Auto-open chat slightly delayed for effect
    const t = setTimeout(() => setIsChatOpen(true), 1000);
    return () => clearTimeout(t);
  }, []);

  const handleBotMessage = () => {
    setIsTalking(true);
    setTimeout(() => setIsTalking(false), TALKING_DURATION_MS);
  };

  const handleHangUp = () => {
    router.push("/");
  };

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] overflow-hidden">

      {/* ── Left Side: Avatar Container (Flex pushing) ── */}
      <div
        className="relative flex-1 transition-all duration-[400ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] overflow-hidden h-full drop-shadow-sm"
      >
        {/* Full-screen Avatar inside this flex column */}
        <div className="absolute inset-0">
          <Avatar isTalking={isTalking} />
        </div>

        {/* ── Top Header Bar ── */}
        <div className="absolute left-6 right-6 top-6 z-20 flex items-center justify-between">

          {/* Logo Pill */}
          <div className="flex items-center gap-3 bg-white/90 backdrop-blur-md pl-4 pr-5 py-2.5 rounded-full shadow-md border border-white/50">
            <SingaporeLandLogo />
            <div className="w-px h-5 bg-gray-200 ml-1"></div>
            <span className="text-sm font-semibold text-[#64748b]">AI Concierge</span>
          </div>

          <button
            onClick={handleHangUp}
            className="flex items-center justify-center rounded-full bg-white/90 backdrop-blur-md shadow-md border border-white/50 hover:bg-white text-[#0a2240] transition-all"
            style={{ width: 44, height: 44 }}
            title="Exit"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>

        {/* ── Bottom Toolbar Center ── */}
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-end gap-5 bg-white/80 backdrop-blur-xl px-8 py-4 rounded-[2rem] shadow-xl border border-white/60"
        >
          {/* Timer on the far left of toolbar */}
          <div className="mr-4 self-center">
            <CallTimer />
          </div>

          <ToolbarBtn active={isMicOn} onClick={() => setIsMicOn((p) => !p)} label={isMicOn ? "Mic" : "Mic off"}>
            {isMicOn ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </ToolbarBtn>

          <ToolbarBtn active={isCamOn} onClick={() => setIsCamOn((p) => !p)} label={isCamOn ? "Camera" : "Cam off"}>
            {isCamOn ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </ToolbarBtn>

          <ToolbarBtn label="Avatars" dropdown>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
            </svg>
          </ToolbarBtn>

          <div className="w-px h-10 bg-gray-200 self-center mx-1"></div>

          <ToolbarBtn active={isChatOpen} onClick={() => setIsChatOpen((p) => !p)} label="Chat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </ToolbarBtn>

          <ToolbarBtn danger onClick={handleHangUp} label="End call">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.32.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.26.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z" />
            </svg>
          </ToolbarBtn>
        </div>
      </div>

      {/* ── Right Side: Chat Panel Container (Push Animated) ── */}
      <div
        className="h-full bg-white transition-all duration-[400ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] shadow-2xl z-30"
        style={{
          width: isChatOpen ? 380 : 0,
          minWidth: isChatOpen ? 380 : 0,
          borderLeft: isChatOpen ? "1px solid #e2e8f0" : "none"
        }}
      >
        <div style={{ width: 380, height: "100%", opacity: isChatOpen ? 1 : 0, transition: "opacity 300ms 100ms" }}>
          <Chat
            onBotMessage={handleBotMessage}
            language={lang}
            onClose={() => setIsChatOpen(false)}
            avatarName="Sofia"
          />
        </div>
      </div>

    </div>
  );
}
