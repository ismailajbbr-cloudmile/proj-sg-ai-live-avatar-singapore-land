"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KIOSK_CHAT_ENTRY_KEY } from "@/lib/kioskChatGate";
import {
  DEFAULT_LOCALE,
  SELECTED_LANG_KEY,
  type Locale,
  getLocaleStrings,
} from "@/lib/locale";
import Avatar from "@/components/Avatar";

// Page Name: Lobby
// Route: /
// Description: Pre-call lobby screen — CloudMile theme

function RotatingPrompt({ prompts }: { prompts: string[] }) {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % prompts.length);
        setFade(true);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, [prompts.length]);

  return (
    <span
      className={`inline-block transition-all duration-400 ${fade ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
    >
      &ldquo;{prompts[index]}&rdquo;
    </span>
  );
}

export default function LobbyPage() {
  const router = useRouter();
  const [selectedLang, setSelectedLang] = useState<Locale>(DEFAULT_LOCALE);
  const [isStarting, setIsStarting] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const strings = getLocaleStrings(selectedLang);

  useEffect(() => {
    sessionStorage.removeItem(KIOSK_CHAT_ENTRY_KEY);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (r.status === 401) {
          router.replace("/login");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d?.is_admin === true) setIsAdmin(true);
      })
      .catch(() => {});

  }, [router]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startSession = () => {
    sessionStorage.setItem(SELECTED_LANG_KEY, selectedLang);
    sessionStorage.setItem(KIOSK_CHAT_ENTRY_KEY, "1");
    router.push("/chat");
  };

  const handleStartChat = async () => {
    setIsStarting(true);
    setPermError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      streamRef.current = stream;
      startSession();
    } catch (err: unknown) {
      console.warn("Media permission error:", err instanceof Error ? err.message : err);
      setPermError(strings.lobby.permError);
      sessionStorage.setItem(SELECTED_LANG_KEY, selectedLang);
      sessionStorage.setItem(KIOSK_CHAT_ENTRY_KEY, "1");
      setTimeout(() => router.push("/chat"), 1800);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="relative flex h-screen w-full justify-center overflow-hidden bg-[#f8f9fa]">

      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/marina-square-hero.jpg')" }}
      />
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm" />

      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 h-20 bg-white shadow-sm flex items-center justify-between px-8 z-10 w-full">
        <img src="/logo-cloudmile.jpg" alt="CloudMile" className="h-12 object-contain" />
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-sm font-medium text-[#0a2240] border border-[#0a2240]/20 rounded-full px-4 py-2 hover:bg-[#0a2240] hover:text-white transition-colors"
            >
              Admin Panel
            </Link>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="text-sm font-medium text-[#0a2240] border border-[#0a2240]/20 rounded-full px-4 py-2 hover:bg-[#0a2240] hover:text-white transition-colors"
          >
            Log out
          </button>
          <div className="text-[#0a2240] font-medium tracking-wide">
            AI Concierge Kiosk
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative w-full max-w-5xl flex flex-col items-center justify-center pt-24 pb-8 px-4 h-full">

        {/* Avatar preview card */}
        <div className="relative w-full overflow-hidden rounded-2xl flex-1 max-h-[60vh]">
          <Suspense fallback={null}>
            <Avatar />
          </Suspense>
        </div>

        {/* Welcome text + rotating prompts */}
        <div className="mt-4 text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold text-[#0a2240]">
            {strings.lobby.title}
          </h1>
          <p className="text-sm md:text-base text-[#0a2240]/60">
            {strings.lobby.subtitle}
          </p>
          <div className="h-8 flex items-center justify-center">
            <p className="text-sm md:text-base font-medium text-[#2323a8] italic">
              <RotatingPrompt prompts={strings.lobby.prompts} />
            </p>
          </div>
        </div>

        {/* Error hint */}
        {permError && (
          <p className="mt-3 text-sm font-medium text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
            {permError}
          </p>
        )}

        {/* Language picker + start button */}
        <div className="mt-4 mb-4 flex flex-col items-center gap-3">
          <div
            className="flex items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm"
            role="group"
            aria-label="Language selection"
          >
            <button
              type="button"
              onClick={() => setSelectedLang("en-US")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                selectedLang === "en-US"
                  ? "bg-[#0a2240] text-white shadow-sm"
                  : "text-[#0a2240]/70 hover:text-[#0a2240]"
              }`}
            >
              {strings.lobby.languageEnglish}
            </button>
            <button
              type="button"
              onClick={() => setSelectedLang("zh-CN")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                selectedLang === "zh-CN"
                  ? "bg-[#0a2240] text-white shadow-sm"
                  : "text-[#0a2240]/70 hover:text-[#0a2240]"
              }`}
            >
              {strings.lobby.languageChinese}
            </button>
          </div>

          <div className="flex items-center bg-white p-3 rounded-full shadow-lg border border-gray-100">
            <button
              onClick={() => void handleStartChat()}
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
              {isStarting ? strings.lobby.connecting : strings.lobby.startButton}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
