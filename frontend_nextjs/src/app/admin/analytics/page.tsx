"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
    Users,
    MessageSquare,
    Mails,
    CalendarDays,
    RefreshCw,
    BarChart3,
    ChevronLeft,
    ChevronRight,
    type LucideIcon,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

interface AnalyticsData {
    total_users: number;
    total_conversations: number;
    total_messages: number;
    conversations_today: number;
    recent_conversations: RecentConversation[];
    top_users: TopUser[];
    conversations_page: number;
    conversations_page_size: number;
}

interface RecentConversation {
    id: string;
    title: string;
    username: string;
    created_at: string;
    updated_at?: string;
    message_count?: number;
}

interface TopUser {
    username: string;
    conversation_count: number;
    message_count?: number;
}

interface StatCardProps {
    label: string;
    value: number | string;
    icon: LucideIcon;
    color: string;
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
    return (
        <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${color}18`, color }}
            >
                <Icon className="h-6 w-6" aria-hidden />
            </div>
            <div>
                <p className="text-2xl font-bold text-[#0a2240]">{value}</p>
                <p className="mt-0.5 text-sm text-gray-500">{label}</p>
            </div>
        </div>
    );
}

function RankCell({ index }: { index: number }) {
    if (index === 0) {
        return (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600">
                <span className="sr-only">Rank 1</span>
                <span aria-hidden>1</span>
            </span>
        );
    }
    if (index === 1) {
        return (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500">
                <span className="sr-only">Rank 2</span>
                <span aria-hidden>2</span>
            </span>
        );
    }
    if (index === 2) {
        return (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-800/80">
                <span className="sr-only">Rank 3</span>
                <span aria-hidden>3</span>
            </span>
        );
    }
    return (
        <span className="text-sm font-medium text-gray-400">
            <span className="sr-only">Rank </span>#{index + 1}
        </span>
    );
}

const PAGE_SIZE = 20;

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [page, setPage] = useState(1);

    const fetchAnalytics = useCallback(async (p: number = page) => {
        setError("");
        try {
            const res = await fetch(`/api/admin/analytics?page=${p}&page_size=${PAGE_SIZE}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                setError(errData.detail || "Failed to load analytics");
                return;
            }
            const json = await res.json();
            setData(json);
            setLastRefreshed(new Date());
        } catch {
            setError("Failed to load analytics");
        } finally {
            setIsLoading(false);
        }
    }, [page]);

    useEffect(() => {
        void fetchAnalytics(page);
        const interval = setInterval(() => void fetchAnalytics(page), 30_000);
        return () => clearInterval(interval);
    }, [fetchAnalytics, page]);

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleString("en-SG", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return iso;
        }
    };

    const timeAgo = (iso: string) => {
        try {
            const diffMs = Date.now() - new Date(iso).getTime();
            const mins = Math.floor(diffMs / 60_000);
            if (mins < 1) return "just now";
            if (mins < 60) return `${mins} min ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs} hr ago`;
            const days = Math.floor(hrs / 24);
            return `${days} day${days !== 1 ? "s" : ""} ago`;
        } catch {
            return iso;
        }
    };

    const duration = (start: string, end?: string) => {
        try {
            const ms = new Date(end ?? start).getTime() - new Date(start).getTime();
            if (ms < 1000) return "< 1s";
            const secs = Math.floor(ms / 1000);
            if (secs < 60) return `${secs}s`;
            const mins = Math.floor(secs / 60);
            if (mins < 60) return `${mins} min`;
            const hrs = Math.floor(mins / 60);
            const remMins = mins % 60;
            return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
        } catch {
            return "—";
        }
    };

    const formatLastRefreshed = (date: Date) => {
        return date.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };

    return (
        <div className="p-4 md:p-8">
            <AdminPageHeader
                title="Analytics"
                description={
                    lastRefreshed ? `Last updated at ${formatLastRefreshed(lastRefreshed)}` : "Loading…"
                }
                actions={
                    <button
                        type="button"
                        onClick={() => void fetchAnalytics()}
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-[#0a2240] hover:text-[#0a2240] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} aria-hidden />
                        Refresh
                    </button>
                }
            />

            {error && (
                <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                    <button type="button" onClick={() => void fetchAnalytics()} className="ml-3 font-medium underline">
                        Retry
                    </button>
                </div>
            )}

            {isLoading && !data ? (
                <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading analytics…</div>
            ) : data ? (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard label="Total Users" value={data.total_users} icon={Users} color="#0a2240" />
                        <StatCard
                            label="Total Conversations"
                            value={data.total_conversations}
                            icon={MessageSquare}
                            color="#2323a8"
                        />
                        <StatCard label="Total Messages" value={data.total_messages} icon={Mails} color="#00b5ad" />
                        <StatCard
                            label="Conversations Today"
                            value={data.conversations_today}
                            icon={CalendarDays}
                            color="#e8197a"
                        />
                    </div>

                    {data.recent_conversations && data.recent_conversations.length > 0 && (() => {
                        const totalPages = Math.ceil(data.total_conversations / PAGE_SIZE);
                        return (
                            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 md:px-6">
                                    <h2 className="text-base font-bold text-[#0a2240]">All Conversations</h2>
                                    <span className="text-xs text-gray-400">{data.total_conversations} total</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[720px]">
                                        <thead>
                                            <tr className="border-b border-gray-50">
                                                <th
                                                    scope="col"
                                                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                                >
                                                    ID
                                                </th>
                                                <th
                                                    scope="col"
                                                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                                >
                                                    Title
                                                </th>
                                                <th
                                                    scope="col"
                                                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                                >
                                                    User
                                                </th>
                                                <th
                                                    scope="col"
                                                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                                >
                                                    Messages
                                                </th>
                                                <th
                                                    scope="col"
                                                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                                >
                                                    Created
                                                </th>
                                                <th
                                                    scope="col"
                                                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                                >
                                                    Last Updated
                                                </th>
                                                <th
                                                    scope="col"
                                                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                                >
                                                    Duration
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {data.recent_conversations.map((conv) => (
                                                <tr key={conv.id} className="transition-colors hover:bg-gray-50/50">
                                                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-gray-400 md:px-6">
                                                        <span title={conv.id}>{conv.id.slice(0, 8)}…</span>
                                                    </td>
                                                    <td className="max-w-xs px-4 py-3.5 text-sm font-medium text-[#0a2240] md:px-6">
                                                        <Link
                                                            href={`/admin/conversations/${conv.id}`}
                                                            className="block truncate hover:underline"
                                                            title={conv.title}
                                                        >
                                                            {conv.title || "Untitled Conversation"}
                                                        </Link>
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600 md:px-6">
                                                        {conv.username}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center text-sm text-gray-500 md:px-6">
                                                        {conv.message_count ?? "—"}
                                                    </td>
                                                    <td
                                                        className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-500 md:px-6"
                                                        title={formatDate(conv.created_at)}
                                                    >
                                                        {timeAgo(conv.created_at)}
                                                    </td>
                                                    <td
                                                        className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-500 md:px-6"
                                                        title={conv.updated_at ? formatDate(conv.updated_at) : undefined}
                                                    >
                                                        {conv.updated_at ? timeAgo(conv.updated_at) : "—"}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-500 md:px-6">
                                                        {conv.updated_at ? duration(conv.created_at, conv.updated_at) : "—"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-4 md:px-6">
                                        <span className="text-xs text-gray-500">
                                            Page {page} of {totalPages}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                                disabled={page === 1}
                                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-[#0a2240] hover:text-[#0a2240] disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                                                Prev
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                                disabled={page >= totalPages}
                                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-[#0a2240] hover:text-[#0a2240] disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                Next
                                                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {data.top_users && data.top_users.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                            <div className="border-b border-gray-100 px-4 py-4 md:px-6">
                                <h2 className="text-base font-bold text-[#0a2240]">Top Users by Conversations</h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[480px]">
                                    <thead>
                                        <tr className="border-b border-gray-50">
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                            >
                                                Rank
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                            >
                                                Username
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                            >
                                                Conversations
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                            >
                                                Messages
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {data.top_users.map((user, index) => (
                                            <tr key={user.username} className="transition-colors hover:bg-gray-50/50">
                                                <td className="px-4 py-3.5 md:px-6">
                                                    <RankCell index={index} />
                                                </td>
                                                <td className="px-4 py-3.5 md:px-6">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0a2240] text-xs font-bold text-white">
                                                            {user.username.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="text-sm font-medium text-[#0a2240]">
                                                            {user.username}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5 text-sm font-medium text-gray-600 md:px-6">
                                                    {user.conversation_count}
                                                </td>
                                                <td className="px-4 py-3.5 text-sm text-gray-500 md:px-6">
                                                    {user.message_count ?? "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {(!data.recent_conversations || data.recent_conversations.length === 0) &&
                        (!data.top_users || data.top_users.length === 0) && (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-20 shadow-sm text-gray-400">
                                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#f0f4f8] text-[#0a2240]">
                                    <BarChart3 className="h-7 w-7" aria-hidden />
                                </div>
                                <p className="text-sm font-medium text-gray-600">No conversation data yet</p>
                                <p className="mt-1 text-xs text-gray-400">Data will appear here once users start chatting</p>
                            </div>
                        )}
                </div>
            ) : null}
        </div>
    );
}
