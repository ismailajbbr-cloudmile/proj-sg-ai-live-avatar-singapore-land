"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
    open: boolean;
    onClose: () => void;
    labelledBy: string;
    children: ReactNode;
    className?: string;
    /** When true, clicking the backdrop calls onClose */
    closeOnBackdrop?: boolean;
};

export function AdminDialog({
    open,
    onClose,
    labelledBy,
    children,
    className = "",
    closeOnBackdrop = false,
}: Props) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const panel = panelRef.current;
        if (!panel) return;

        const prevActive = document.activeElement as HTMLElement | null;
        const focusable = panel.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const list = [...focusable].filter((el) => !el.hasAttribute("disabled"));
        list[0]?.focus();

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key !== "Tab" || list.length === 0) return;
            const first = list[0];
            const last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            prevActive?.focus?.();
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/40"
                aria-hidden
                onClick={closeOnBackdrop ? onClose : undefined}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                className={`relative w-full max-w-md rounded-2xl bg-white shadow-2xl ${className}`}
            >
                {children}
            </div>
        </div>
    );
}
