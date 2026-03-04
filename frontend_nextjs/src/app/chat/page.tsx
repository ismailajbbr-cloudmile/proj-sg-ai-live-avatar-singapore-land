"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";
import type { VisemeFrame } from "@/types/viseme";

// Page Name: Chat (In-call)
// Route: /chat
// Description: Singapore Land AI Concierge Interface (Push Animation Layout)

const AVATAR_NAME = "Singapore Land AI Concierge";

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
      <span className="text-sm font-semibold text-[#0a2240] tabular-nums">{mm}:{ss}</span>
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
    <button onClick={onClick} title={label} className="flex flex-col items-center justify-center gap-1.5 focus:outline-none group flex-shrink-0">
      <div
        className={`flex items-center justify-center gap-0.5 rounded-full shadow-md transition-all ${danger ? "hover:bg-red-600 active:bg-red-700" : "hover:scale-105 active:scale-95"
          }`}
        style={{
          width: 52, height: 52,
          background: danger ? "#ef4444" : active ? "#0a2240" : "white",
          color: danger || active ? "white" : "#0a2240",
          border: danger || active ? "none" : "1px solid #e2e8f0",
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
        <span className="text-xs font-medium text-[#0a2240] opacity-80 group-hover:opacity-100 transition truncate w-16 text-center leading-tight min-h-[1.25rem]">
          {label}
        </span>
      )}
    </button>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isPttPressed, setIsPttPressed] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [lang, setLang] = useState("en-US");

  // ── Lip sync state ────────────────────────────────────────────────────────
  const [visemeFrames, setVisemeFrames] = useState<VisemeFrame[]>([]);
  const [playheadMs, setPlayheadMs] = useState(0);

  // Hidden audio element for cloud TTS playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const playTokenRef = useRef<number>(0);

  useEffect(() => {
    const el = document.createElement("audio");
    el.preload = "auto";
    el.style.display = "none";
    document.body.appendChild(el);
    audioRef.current = el;
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      el.pause();
      el.remove();
    };
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("selectedLang");
    if (stored) setLang(stored);
  }, []);

  // ── RAF ticker ─────────────────────────────────────────────────────────────
  const stopRaf = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const startTick = useCallback((token: number) => {
    const tick = () => {
      if (playTokenRef.current !== token) return;
      const a = audioRef.current;
      if (!a) return;
      setPlayheadMs(a.currentTime * 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    stopRaf();
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf]);

  // ── Called by Chat.tsx when Google TTS delivers audio + visemes ────────────
  const handleBotSpeech = useCallback((audioBase64: string, mimeType: string, visemes: VisemeFrame[]) => {
    const token = playTokenRef.current + 1;
    playTokenRef.current = token;

    const el = audioRef.current;
    if (!el) return;

    try { el.pause(); } catch { }

    // Decode base64 → Blob → Object URL
    const bytes = atob(audioBase64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    const blob = new Blob([buf], { type: mimeType });
    const url = URL.createObjectURL(blob);

    setVisemeFrames(visemes);
    setPlayheadMs(0);

    el.src = url;
    el.load();

    // ── Scale viseme timeline to exactly match the real audio duration ─────
    // This is the key sync fix: whether Google returned real timepoints or
    // we estimated them, we always stretch/compress to the exact audio length.
    const onMetadata = () => {
      if (playTokenRef.current !== token) return;
      const audioDurationMs = el.duration * 1000;
      if (!isFinite(audioDurationMs) || audioDurationMs <= 0 || visemes.length === 0) return;

      const estimatedDurationMs = visemes[visemes.length - 1].t;
      if (estimatedDurationMs <= 0) return;

      const scale = audioDurationMs / estimatedDurationMs;
      // Only rescale if there's a meaningful mismatch (>5%)
      if (Math.abs(scale - 1) > 0.05) {
        const scaled = visemes.map((f) => ({ ...f, t: Math.round(f.t * scale) }));
        setVisemeFrames(scaled);
        console.log(`[AudioSync] Rescaled visemes x${scale.toFixed(2)} (estimated=${estimatedDurationMs.toFixed(0)}ms, actual=${audioDurationMs.toFixed(0)}ms)`);
      }

      el.removeEventListener("loadedmetadata", onMetadata);
    };

    const onPlaying = () => {
      if (playTokenRef.current !== token) return;
      startTick(token);
      el.removeEventListener("playing", onPlaying);
    };
    const onEnded = () => {
      if (playTokenRef.current !== token) return;
      stopRaf();
      setPlayheadMs(0);
      URL.revokeObjectURL(url);
      el.removeEventListener("ended", onEnded);
    };

    el.addEventListener("loadedmetadata", onMetadata);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("ended", onEnded);
    void el.play().catch(() => { });
  }, [startTick, stopRaf]);

  const isTalking = visemeFrames.length > 0 && playheadMs > 0;

  const handleHangUp = () => router.push("/");

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] overflow-hidden">

      {/* ── Left Side: Avatar Container (Flex pushing) ── */}
      <div className="relative flex-1 transition-all duration-[400ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] overflow-hidden h-full drop-shadow-sm">
        <div className="absolute inset-0">
          <Avatar
            isTalking={isTalking}
            visemes={visemeFrames}
            playheadMs={playheadMs}
          />
        </div>

        {/* ── Top Header Bar ── */}
        <div className="absolute left-6 right-6 top-6 z-20 flex items-center justify-between">
          <div className="flex items-center gap-3 bg-white/90 backdrop-blur-md pl-4 pr-5 py-2.5 rounded-full shadow-md border border-white/50">
            <img src="/logo.png" alt="Singapore Land Group" className="h-8 object-contain" />
            <div className="w-px h-5 bg-gray-200 ml-1"></div>
            <span className="text-sm font-semibold text-[#64748b]">AI Concierge</span>
          </div>
        </div>

        {/* ── Bottom Toolbar Center ── */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-5 bg-white/80 backdrop-blur-xl px-8 py-4 rounded-[2rem] shadow-xl border border-white/60">
          <div className="flex-shrink-0">
            <CallTimer />
          </div>

          <button
            onMouseDown={() => setIsPttPressed(true)}
            onMouseUp={() => setIsPttPressed(false)}
            onMouseLeave={() => setIsPttPressed(false)}
            onTouchStart={(e) => { e.preventDefault(); setIsPttPressed(true); }}
            onTouchEnd={(e) => { e.preventDefault(); setIsPttPressed(false); }}
            className={`flex items-center justify-center gap-3 rounded-full px-8 h-14 font-bold text-[17px] tracking-wide transition-all shadow-xl select-none relative overflow-hidden group ${isPttPressed || isRecording
                ? "bg-red-500 text-white scale-95"
                : "bg-gradient-to-r from-[#c89b3c] to-[#a67c2b] text-white hover:scale-105 active:scale-95"
              }`}
          >
            {isRecording ? (
              <>
                <div className="flex gap-1.5 items-center justify-center">
                  <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce"></div>
                </div>
                <span>Listening...</span>
              </>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                <span>Push to Talk</span>
              </>
            )}

            {/* Shimmer effect when idle */}
            {!isRecording && !isPttPressed && (
              <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />
            )}
          </button>

          <div className="w-px h-10 bg-gray-200 flex-shrink-0 mx-1" />

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
        className="h-full bg-white transition-all duration-[400ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] shadow-2xl z-30 overflow-hidden"
        style={{
          width: isChatOpen ? 380 : 0,
          minWidth: isChatOpen ? 380 : 0,
          borderLeft: isChatOpen ? "1px solid #e2e8f0" : "none",
        }}
      >
        <div style={{ width: 380, height: "100%", opacity: isChatOpen ? 1 : 0, transition: "opacity 300ms 100ms" }}>
          <Chat
            onBotSpeech={handleBotSpeech}
            language={lang}
            onClose={() => setIsChatOpen(false)}
            avatarName="AI Concierge"
            isPttHoveredOrPressed={isPttPressed}
            onRecordingStatusChange={(recording) => setIsRecording(recording)}
          />
        </div>
      </div>

    </div>
  );
}
