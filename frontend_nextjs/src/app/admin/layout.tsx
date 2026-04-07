"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [username, setUsername] = useState("");

    useEffect(() => {
        fetch("/api/auth/me").then(r => r.json()).then(d => {
            if (!d.is_admin) router.push("/");
            else setUsername(d.username);
        }).catch(() => router.push("/login"));
    }, []);

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
    };

    const navItems = [
        { href: "/admin/users", label: "User Management", icon: "👥" },
        { href: "/admin/analytics", label: "Analytics", icon: "📊" },
    ];

    return (
        <div className="flex h-screen bg-[#f8f9fa]">
            {/* Sidebar */}
            <div className="w-64 bg-[#0a2240] text-white flex flex-col">
                <div className="p-6 border-b border-white/10">
                    <div className="text-lg font-bold">Admin Panel</div>
                    <div className="text-sm text-white/60 mt-1">{username}</div>
                </div>
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map(item => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                                pathname === item.href
                                    ? "bg-white/20 text-white"
                                    : "text-white/70 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            <span>{item.icon}</span>
                            {item.label}
                        </Link>
                    ))}
                </nav>
                <div className="p-4 border-t border-white/10 space-y-2">
                    <Link
                        href="/"
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                    >
                        ← Back to Kiosk
                    </Link>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors text-left"
                    >
                        🚪 Logout
                    </button>
                </div>
            </div>
            {/* Main content */}
            <div className="flex-1 overflow-auto">{children}</div>
        </div>
    );
}
