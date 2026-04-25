"use client";

import { AdminDialog } from "@/components/admin/AdminDialog";

const WARNING_SECONDS = 30;

interface IdleWarningModalProps {
    open: boolean;
    /** Current countdown value (counts down from WARNING_SECONDS to 0) */
    countdownSeconds: number;
    onStayActive: () => void;
    onNewSession: () => void;
}

export function IdleWarningModal({ open, countdownSeconds, onStayActive, onNewSession }: IdleWarningModalProps) {
    const progressPct = Math.max(0, (countdownSeconds / WARNING_SECONDS) * 100);

    return (
        <AdminDialog open={open} onClose={onStayActive} labelledBy="idle-warning-title">
            <div className="p-6 flex flex-col gap-5">
                {/* Icon + heading */}
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 border border-amber-200">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    </div>
                    <h2 id="idle-warning-title" className="text-xl font-bold text-[#0a2240]">
                        Still there?
                    </h2>
                    <p className="text-sm text-gray-500">
                        This session will end in{" "}
                        <span className="font-semibold text-[#0a2240] tabular-nums">{countdownSeconds}</span>{" "}
                        second{countdownSeconds !== 1 ? "s" : ""} due to inactivity.
                    </p>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-amber-400 transition-all duration-1000 ease-linear"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2.5">
                    <button
                        type="button"
                        onClick={onStayActive}
                        className="w-full rounded-xl bg-[#0a2240] py-3 text-sm font-semibold text-white hover:bg-[#0d2d54] active:scale-[0.98] transition-all"
                    >
                        I&apos;m Still Here
                    </button>
                    <button
                        type="button"
                        onClick={onNewSession}
                        className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition-all"
                    >
                        Start New Session
                    </button>
                </div>
            </div>
        </AdminDialog>
    );
}
