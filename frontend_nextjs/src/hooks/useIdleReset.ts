"use client";
import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Kiosk session reset — navigates to the lobby after `timeoutMinutes` of
 * inactivity WITHOUT logging out. This lets the next visitor start fresh
 * while keeping the admin auth cookie alive.
 */
export function useIdleReset(timeoutMinutes: number | null) {
    const router = useRouter();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const reset = useCallback(() => {
        if (!timeoutMinutes || timeoutMinutes <= 0) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            router.push("/");
        }, timeoutMinutes * 60 * 1000);
    }, [timeoutMinutes, router]);

    useEffect(() => {
        if (!timeoutMinutes || timeoutMinutes <= 0) return;
        const events = ["mousedown", "mousemove", "keydown", "touchstart", "click"];
        events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
        reset();
        return () => {
            events.forEach((e) => window.removeEventListener(e, reset));
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [timeoutMinutes, reset]);
}
