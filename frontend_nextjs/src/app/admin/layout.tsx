"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Users, BarChart3, LogOut, Menu, X, Home } from "lucide-react";
import { AdminNavLink } from "@/components/admin/AdminNavLink";

const NAV_ITEMS = [
    { href: "/admin/users" as const, label: "User Management", icon: Users },
    { href: "/admin/analytics" as const, label: "Analytics", icon: BarChart3 },
];

function NavSection({
    pathname,
    onNavigate,
}: {
    pathname: string;
    onNavigate?: () => void;
}) {
    return (
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Admin">
            {NAV_ITEMS.map((item) => (
                <AdminNavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    pathname={pathname}
                    onNavigate={onNavigate}
                />
            ))}
        </nav>
    );
}

function SidebarFooter({
    onNavigate,
    onLogout,
}: {
    onNavigate?: () => void;
    onLogout: () => void;
}) {
    return (
        <div className="space-y-1 border-t border-gray-100 p-3">
            <Link
                href="/"
                onClick={onNavigate}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#0a2240]/70 transition-colors hover:bg-[#f0f4f8] hover:text-[#0a2240]"
            >
                <Home className="h-[18px] w-[18px] shrink-0" aria-hidden />
                Back to Kiosk
            </Link>
            <button
                type="button"
                onClick={() => {
                    onNavigate?.();
                    void onLogout();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#0a2240]/70 transition-colors hover:bg-[#f0f4f8] hover:text-[#0a2240]"
            >
                <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden />
                Log out
            </button>
        </div>
    );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [username, setUsername] = useState("");
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    useEffect(() => {
        fetch("/api/auth/me")
            .then((r) => r.json())
            .then((d) => {
                if (!d.is_admin) router.push("/");
                else setUsername(d.username ?? "");
            })
            .catch(() => router.push("/login"));
    }, [router]);

    useEffect(() => {
        const id = requestAnimationFrame(() => setMobileNavOpen(false));
        return () => cancelAnimationFrame(id);
    }, [pathname]);

    useEffect(() => {
        if (!mobileNavOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [mobileNavOpen]);

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
    };

    const closeMobile = () => setMobileNavOpen(false);

    return (
        <div className="flex min-h-screen flex-col bg-[#f8f9fa]">
            <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 shadow-sm md:h-20 md:px-8">
                <div className="flex min-w-0 items-center gap-3 md:gap-4">
                    <button
                        type="button"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#0a2240]/15 text-[#0a2240] transition-colors hover:bg-[#f0f4f8] md:hidden"
                        onClick={() => setMobileNavOpen(true)}
                        aria-expanded={mobileNavOpen}
                        aria-controls="admin-mobile-nav"
                        aria-label="Open menu"
                    >
                        <Menu className="h-5 w-5" aria-hidden />
                    </button>
                    <Link href="/admin/users" className="flex min-w-0 items-center gap-3">
                        <img
                            src="/logo-cloudmile.jpg"
                            alt="CloudMile"
                            className="h-9 w-auto object-contain md:h-12"
                        />
                        <div className="hidden min-w-0 sm:block">
                            <p className="text-sm font-bold leading-tight text-[#0a2240] md:text-base">Admin</p>
                            <p className="truncate text-xs font-medium tracking-wide text-[#64748b]">
                                AI Concierge
                            </p>
                        </div>
                    </Link>
                </div>
                <div className="hidden items-center gap-3 md:flex">
                    <span className="max-w-[200px] truncate text-sm font-medium text-[#0a2240]/80" title={username}>
                        {username}
                    </span>
                    <Link
                        href="/"
                        className="rounded-full border border-[#0a2240]/20 px-4 py-2 text-sm font-medium text-[#0a2240] transition-colors hover:bg-[#0a2240] hover:text-white"
                    >
                        Kiosk
                    </Link>
                    <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className="inline-flex items-center gap-2 rounded-full border border-[#0a2240]/20 px-4 py-2 text-sm font-medium text-[#0a2240] transition-colors hover:bg-[#0a2240] hover:text-white"
                    >
                        <LogOut className="h-4 w-4" aria-hidden />
                        Log out
                    </button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                <aside
                    className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white lg:w-64 md:flex"
                    aria-label="Admin navigation"
                >
                    <div
                        className="h-1 w-full shrink-0 bg-gradient-to-r from-[#2323a8] to-[#00b5ad]"
                        aria-hidden
                    />
                    <NavSection pathname={pathname} />
                    <SidebarFooter onLogout={handleLogout} />
                </aside>

                {mobileNavOpen && (
                    <>
                        <button
                            type="button"
                            className="fixed inset-0 z-40 bg-black/40 md:hidden"
                            aria-label="Close menu"
                            onClick={closeMobile}
                        />
                        <aside
                            id="admin-mobile-nav"
                            className="fixed inset-y-0 left-0 z-50 flex w-[min(288px,88vw)] flex-col border-r border-gray-200 bg-white shadow-xl md:hidden"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Admin menu"
                        >
                            <div className="flex h-16 items-center justify-between border-b border-gray-100 px-3">
                                <span className="truncate text-sm font-semibold text-[#0a2240]">{username}</span>
                                <button
                                    type="button"
                                    className="flex h-10 w-10 items-center justify-center rounded-full text-[#0a2240] hover:bg-[#f0f4f8]"
                                    onClick={closeMobile}
                                    aria-label="Close menu"
                                >
                                    <X className="h-5 w-5" aria-hidden />
                                </button>
                            </div>
                            <div className="h-1 w-full shrink-0 bg-gradient-to-r from-[#2323a8] to-[#00b5ad]" aria-hidden />
                            <NavSection pathname={pathname} onNavigate={closeMobile} />
                            <SidebarFooter onNavigate={closeMobile} onLogout={handleLogout} />
                        </aside>
                    </>
                )}

                <main className="min-w-0 flex-1 overflow-auto">{children}</main>
            </div>
        </div>
    );
}
