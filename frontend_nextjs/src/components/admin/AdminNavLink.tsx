import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
    href: string;
    label: string;
    icon: LucideIcon;
    pathname: string;
    onNavigate?: () => void;
};

function isActive(href: string, pathname: string): boolean {
    if (href === "/admin/analytics") {
        return pathname === "/admin/analytics" || pathname.startsWith("/admin/conversations");
    }
    return pathname === href;
}

export function AdminNavLink({ href, label, icon: Icon, pathname, onNavigate }: Props) {
    const active = isActive(href, pathname);
    return (
        <Link
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                    ? "bg-[#0a2240] text-white shadow-sm"
                    : "text-[#0a2240]/70 hover:bg-[#f0f4f8] hover:text-[#0a2240]"
            }`}
        >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {label}
        </Link>
    );
}
