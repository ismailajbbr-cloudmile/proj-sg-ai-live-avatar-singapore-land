"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";
import type { VisemeFrame, AvatarGesture } from "@/types/viseme";
import { useIdleReset } from "@/hooks/useIdleReset";
import { IdleWarningModal } from "@/components/IdleWarningModal";
import { IdleIndicator } from "@/components/IdleIndicator";
import { KIOSK_CHAT_ENTRY_KEY } from "@/lib/kioskChatGate";

// Page Name: Chat (In-call)
// Route: /chat
// Description: Marina Square AI Concierge Interface (Push Animation Layout)

const AVATAR_NAME = "Marina Square AI Concierge";

function CallTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <div className="rounded-full bg-white/80 backdrop-blur-md border border-gray-200 px-2 py-1 shadow-sm md:px-3 md:py-1.5">
      <span className="text-xs font-semibold text-[#0a2240] tabular-nums md:text-sm">{mm}:{ss}</span>
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
        <span className="max-sm:sr-only sm:block text-xs font-medium text-[#0a2240] opacity-80 group-hover:opacity-100 transition truncate w-14 sm:w-16 text-center leading-tight min-h-[1.25rem]">
          {label}
        </span>
      )}
    </button>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isPttPressed, setIsPttPressed] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [lang, setLang] = useState("en-US");
  const [idleTimeout, setIdleTimeout] = useState<number | null>(null);
  const [idleWarningOpen, setIdleWarningOpen] = useState(false);
  const [warningCountdown, setWarningCountdown] = useState(30);

  // ── Lip sync state ────────────────────────────────────────────────────────
  const [visemeFrames, setVisemeFrames] = useState<VisemeFrame[]>([]);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [gesture, setGesture] = useState<AvatarGesture>("idle");

  // Hidden audio element for cloud TTS playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const playTokenRef = useRef<number>(0);

  // Audio queue for sentence-by-sentence playback
  type AudioSegment = { audioBase64: string; mimeType: string; visemes: VisemeFrame[]; gesture: AvatarGesture };
  const audioQueueRef = useRef<AudioSegment[]>([]);
  const isPlayingRef = useRef(false);
  const playSegmentRef = useRef<((seg: AudioSegment) => void) | null>(null);

  // Callback ref: Chat.tsx writes a handler here; we call it when speech fully ends
  const chatSpeechEndCallbackRef = useRef<(() => void) | null>(null);

  // Fetch config for idle timeout
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.session_idle_timeout_minutes === "number") {
          setIdleTimeout(d.session_idle_timeout_minutes);
        }
      })
      .catch(() => {});
  }, []);

  // Kiosk idle reset — navigate back to lobby so next visitor gets a fresh session
  const { isActive: idleActive, isInWarning, remainingSecs, totalIdleSecs, manualResume } = useIdleReset(idleTimeout, {
    warningSeconds: 30,
    onWarning: () => {
      setWarningCountdown(30);
      setIdleWarningOpen(true);
    },
  });

  // Countdown ticker while warning modal is open
  useEffect(() => {
    if (!idleWarningOpen) return;
    const interval = setInterval(() => {
      setWarningCountdown((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [idleWarningOpen]);

  useEffect(() => {
    if (!sessionStorage.getItem(KIOSK_CHAT_ENTRY_KEY)) {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    const el = document.createElement("audio");
    el.preload = "auto";
    el.style.display = "none";
    document.body.appendChild(el);
    audioRef.current = el;

    // Unlock audio context on first user gesture (required by browser autoplay policy)
    const unlock = () => {
      el.play().then(() => el.pause()).catch(() => {});
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
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

  // ── Play a single audio segment ─────────────────────────────────────────
  const playSegment = useCallback((seg: AudioSegment) => {
    const { audioBase64, mimeType, visemes, gesture: segGesture } = seg;

    setGesture(segGesture);
    isPlayingRef.current = true;

    const token = playTokenRef.current + 1;
    playTokenRef.current = token;

    const el = audioRef.current;
    if (!el) return;

    try { el.pause(); } catch { }

    const bytes = atob(audioBase64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    const blob = new Blob([buf], { type: mimeType });
    const url = URL.createObjectURL(blob);

    setVisemeFrames(visemes);
    setPlayheadMs(0);

    el.src = url;
    el.load();

    const onMetadata = () => {
      if (playTokenRef.current !== token) return;
      const audioDurationMs = el.duration * 1000;
      if (!isFinite(audioDurationMs) || audioDurationMs <= 0 || visemes.length === 0) return;
      const estimatedDurationMs = visemes[visemes.length - 1].t;
      if (estimatedDurationMs <= 0) return;
      const scale = audioDurationMs / estimatedDurationMs;
      if (Math.abs(scale - 1) > 0.05) {
        setVisemeFrames(visemes.map((f) => ({ ...f, t: Math.round(f.t * scale) })));
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
      // Dequeue next segment or go idle
      const next = audioQueueRef.current.shift();
      if (next) {
        playSegmentRef.current?.(next);
      } else {
        isPlayingRef.current = false;
        setGesture("idle");
        chatSpeechEndCallbackRef.current?.();
      }
    };

    el.addEventListener("loadedmetadata", onMetadata);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("ended", onEnded);
    void el.play().catch(() => { });
  }, [startTick, stopRaf]);

  // Keep ref in sync so onEnded can call the latest version without stale closure
  useEffect(() => { playSegmentRef.current = playSegment; }, [playSegment]);

  // ── Clear all queued and playing audio (called when user sends new message) ─
  const clearSpeech = useCallback(() => {
    audioQueueRef.current = [];
    playTokenRef.current += 1;
    isPlayingRef.current = false;
    const el = audioRef.current;
    if (el) try { el.pause(); } catch { }
    stopRaf();
    setPlayheadMs(0);
    setVisemeFrames([]);
    setGesture("idle");
    chatSpeechEndCallbackRef.current?.();
  }, [stopRaf]);

  // ── Called by Chat.tsx for each TTS sentence segment ────────────────────
  const handleBotSpeech = useCallback((audioBase64: string, mimeType: string, visemes: VisemeFrame[], newGesture: AvatarGesture = "idle") => {
    const seg: AudioSegment = { audioBase64, mimeType, visemes, gesture: newGesture };
    if (isPlayingRef.current) {
      audioQueueRef.current.push(seg);
    } else {
      playSegment(seg);
    }
  }, [playSegment]);

  const isTalking = visemeFrames.length > 0 && playheadMs > 0;

  const handleHangUp = () => router.push("/");

  const showThinkingChrome = isAiThinking && !isChatOpen;

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] overflow-hidden">

      {/* ── Left Side: Avatar Container (Flex pushing) ── */}
      <div className="relative flex-1 transition-all duration-[400ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] overflow-hidden h-full drop-shadow-sm">
        <div className="absolute inset-0">
          <Avatar
            isTalking={isTalking}
            visemes={visemeFrames}
            playheadMs={playheadMs}
            gesture={gesture}
          />
        </div>

        {/* ── Top Header Bar ── */}
        <div className="absolute left-6 right-6 top-6 z-20 flex items-center justify-between">
          <div className="flex items-center gap-3 bg-white/90 backdrop-blur-md pl-4 pr-5 py-2.5 rounded-full shadow-md border border-white/50">
            <img src="/logo-marinasquare.png" alt="Marina Square" className="h-8 object-contain" />
            <div className="w-px h-5 bg-gray-200 ml-1"></div>
            <span className="text-sm font-semibold text-[#64748b]">AI Concierge</span>
          </div>
          <IdleIndicator
            isActive={idleActive}
            isInWarning={isInWarning}
            remainingSecs={remainingSecs}
            totalIdleSecs={totalIdleSecs}
          />
        </div>

        {/* ── Bottom Toolbar Center ── */}
        <div className="absolute left-4 right-4 z-20 flex justify-center bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))] pointer-events-none">
          <div
            className={`pointer-events-auto w-max max-w-[calc(100vw-2rem)] ${showThinkingChrome ? "toolbar-thinking-shine shadow-lg shadow-[#2323a8]/25" : ""}`}
            aria-busy={showThinkingChrome}
          >
            {showThinkingChrome && (
              <span className="sr-only" aria-live="polite">
                AI is thinking, please wait
              </span>
            )}
            <div
              className={`flex items-center bg-white/80 backdrop-blur-xl shadow-xl border border-white/60 gap-2 px-3 py-2.5 md:gap-5 md:px-8 md:py-4 ${showThinkingChrome ? "rounded-[calc(2rem-2px)] ring-2 ring-[#2323a8]/35 ring-offset-0 animate-pulse" : "rounded-[2rem]"}`}
            >
              <div className="flex-shrink-0">
                <CallTimer />
              </div>

              <button
                type="button"
                aria-label={isRecording ? "Listening, release to send" : "Push to talk — hold to speak"}
                onMouseDown={() => setIsPttPressed(true)}
                onMouseUp={() => setIsPttPressed(false)}
                onMouseLeave={() => setIsPttPressed(false)}
                onTouchStart={(e) => { e.preventDefault(); setIsPttPressed(true); }}
                onTouchEnd={(e) => { e.preventDefault(); setIsPttPressed(false); }}
                className={`flex items-center justify-center gap-2 md:gap-3 rounded-full px-4 sm:px-6 md:px-8 h-12 md:h-14 font-bold text-sm sm:text-base md:text-[17px] tracking-wide transition-all shadow-xl select-none relative overflow-hidden group shrink min-w-0 ${isPttPressed || isRecording
                    ? "bg-red-500 text-white scale-95"
                    : "bg-gradient-to-r from-[#2323a8] to-[#00b5ad] text-white hover:scale-105 active:scale-95"
                  }`}
              >
                {isRecording ? (
                  <>
                    <div className="flex gap-1.5 items-center justify-center shrink-0">
                      <div className="w-2 h-2 md:w-2.5 md:h-2.5 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2 h-2 md:w-2.5 md:h-2.5 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 md:w-2.5 md:h-2.5 bg-white rounded-full animate-bounce"></div>
                    </div>
                    <span className="truncate max-sm:text-xs">Listening...</span>
                  </>
                ) : (
                  <>
                    <svg className="shrink-0 w-[18px] h-[18px] md:w-[22px] md:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    <span className="max-sm:sr-only sm:inline whitespace-nowrap">Push to Talk</span>
                    <span className="sm:hidden whitespace-nowrap" aria-hidden>
                      Talk
                    </span>
                  </>
                )}

                {!isRecording && !isPttPressed && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 group-hover:animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                  </div>
                )}
              </button>

              <div className="w-px h-8 md:h-10 bg-gray-200 flex-shrink-0 mx-0.5 md:mx-1" />

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
            onClearSpeech={clearSpeech}
            language={lang}
            onClose={() => setIsChatOpen(false)}
            avatarName="Marina Square AI Concierge"
            isPttHoveredOrPressed={isPttPressed}
            onRecordingStatusChange={(recording) => setIsRecording(recording)}
            onThinkingChange={setIsAiThinking}
            speechEndCallbackRef={chatSpeechEndCallbackRef}
          />
        </div>
      </div>

      <IdleWarningModal
        open={idleWarningOpen}
        countdownSeconds={warningCountdown}
        onStayActive={() => { setIdleWarningOpen(false); manualResume(); }}
        onNewSession={() => router.push("/")}
      />
    </div>
  );
}
