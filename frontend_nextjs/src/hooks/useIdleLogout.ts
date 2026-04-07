"use client";
import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export function useIdleLogout(timeoutMinutes: number | null) {
    const router = useRouter();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const logout = useCallback(async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch {}
        router.push("/login");
    }, [router]);

    const reset = useCallback(() => {
        if (timeoutMinutes === null || timeoutMinutes <= 0) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(logout, timeoutMinutes * 60 * 1000);
    }, [timeoutMinutes, logout]);

    useEffect(() => {
        if (timeoutMinutes === null || timeoutMinutes <= 0) return;
        const events = ["mousedown", "mousemove", "keydown", "touchstart", "click"];
        events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
        reset(); // start timer immediately
        return () => {
            events.forEach((e) => window.removeEventListener(e, reset));
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [timeoutMinutes, reset]);
}
