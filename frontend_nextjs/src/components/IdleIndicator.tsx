"use client";

interface IdleIndicatorProps {
    isActive: boolean;
    isInWarning: boolean;
    remainingSecs: number;
    totalIdleSecs: number;
}

/** Formats seconds as m:ss */
function fmt(s: number) {
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return `${m}:${ss}`;
}

/**
 * Small session-activity indicator for the chat header.
 * Shows idle timer progress and highlights when the session is about to expire.
 */
export function IdleIndicator({ isActive, isInWarning, remainingSecs, totalIdleSecs }: IdleIndicatorProps) {
    if (!isActive) return null;

    const pct = totalIdleSecs > 0 ? Math.min(100, (remainingSecs / totalIdleSecs) * 100) : 0;

    if (isInWarning) {
        return (
            <div className="flex items-center gap-2 rounded-full bg-amber-50 border border-amber-300 px-3 py-1.5 shadow-sm animate-pulse">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">Session expiring…</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 rounded-full bg-white/80 backdrop-blur-md border border-gray-200 px-3 py-1.5 shadow-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-gray-400 leading-none uppercase tracking-wide">
                    Session
                </span>
                <span className="text-xs font-semibold text-[#0a2240] tabular-nums leading-none">
                    {fmt(remainingSecs)}
                </span>
            </div>
            {/* Drain bar */}
            <div className="w-12 h-1 rounded-full bg-gray-100 overflow-hidden">
                <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-1000 ease-linear"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}
