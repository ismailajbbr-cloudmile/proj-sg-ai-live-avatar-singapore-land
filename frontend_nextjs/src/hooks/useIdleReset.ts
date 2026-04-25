"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export function useIdleReset(
    timeoutMinutes: number | null,
    options?: {
        warningSeconds?: number;
        onWarning?: () => void;
    },
) {
    const router = useRouter();
    const stage1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stage2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inWarningRef = useRef(false);
    const lastActivityRef = useRef<number>(0);

    const [isInWarning, setIsInWarning] = useState(false);
    const [remainingSecs, setRemainingSecs] = useState(0);

    const onWarningRef = useRef(options?.onWarning);
    useEffect(() => { onWarningRef.current = options?.onWarning; });

    const warningSecs = options?.warningSeconds ?? 30;

    /** Clears existing timers and starts stage-1 (and stage-2) fresh. */
    const startTimers = useCallback(() => {
        if (!timeoutMinutes || timeoutMinutes <= 0) return;
        if (stage1Ref.current) clearTimeout(stage1Ref.current);
        if (stage2Ref.current) clearTimeout(stage2Ref.current);
        lastActivityRef.current = Date.now();

        const totalMs = timeoutMinutes * 60 * 1000;
        const warningMs = warningSecs * 1000;

        if (totalMs > warningMs) {
            stage1Ref.current = setTimeout(() => {
                inWarningRef.current = true;
                setIsInWarning(true);
                onWarningRef.current?.();
                stage2Ref.current = setTimeout(() => {
                    router.push("/");
                }, warningMs);
            }, totalMs - warningMs);
        } else {
            stage1Ref.current = setTimeout(() => {
                router.push("/");
            }, totalMs);
        }
    }, [timeoutMinutes, warningSecs, router]);

    /**
     * Activity reset — ignored while the warning modal is shown.
     * This prevents button mousedown/click bubbling from dismissing the modal.
     */
    const reset = useCallback(() => {
        if (!timeoutMinutes || timeoutMinutes <= 0) return;
        if (inWarningRef.current) return;
        startTimers();
    }, [timeoutMinutes, startTimers]);

    /**
     * Call this when the user explicitly chooses to stay (clicks "I'm Still Here").
     * Unlike `reset`, this works during the warning stage and clears it.
     */
    const manualResume = useCallback(() => {
        if (!timeoutMinutes || timeoutMinutes <= 0) return;
        inWarningRef.current = false;
        setIsInWarning(false);
        startTimers();
    }, [timeoutMinutes, startTimers]);

    // 1-second tick for progress display
    useEffect(() => {
        if (!timeoutMinutes || timeoutMinutes <= 0) return;
        const stage1Secs = timeoutMinutes * 60 - warningSecs;
        const tick = () => {
            if (inWarningRef.current) { setRemainingSecs(0); return; }
            const elapsed = (Date.now() - lastActivityRef.current) / 1000;
            setRemainingSecs(Math.max(0, Math.round(stage1Secs - elapsed)));
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [timeoutMinutes, warningSecs]);

    // Register activity listeners
    useEffect(() => {
        if (!timeoutMinutes || timeoutMinutes <= 0) return;
        const events = ["mousedown", "keydown", "touchstart", "click"];
        events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
        startTimers();
        return () => {
            events.forEach((e) => window.removeEventListener(e, reset));
            if (stage1Ref.current) clearTimeout(stage1Ref.current);
            if (stage2Ref.current) clearTimeout(stage2Ref.current);
        };
    }, [timeoutMinutes, reset, startTimers]);

    const isActive = !!timeoutMinutes && timeoutMinutes > 0;
    const totalIdleSecs = isActive ? timeoutMinutes * 60 - warningSecs : 0;

    return { isActive, isInWarning, remainingSecs, totalIdleSecs, manualResume };
}
