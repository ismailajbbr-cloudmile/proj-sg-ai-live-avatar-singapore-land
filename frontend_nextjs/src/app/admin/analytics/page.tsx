"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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
    icon: string;
    color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
            <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ backgroundColor: `${color}15` }}
            >
                {icon}
            </div>
            <div>
                <p className="text-2xl font-bold text-[#0a2240]">{value}</p>
                <p className="text-sm text-gray-500 mt-0.5">{label}</p>
            </div>
        </div>
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
        fetchAnalytics(page);
        // Auto-refresh every 30 seconds
        const interval = setInterval(() => fetchAnalytics(page), 30_000);
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

    const formatLastRefreshed = (date: Date) => {
        return date.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    };

    return (
        <div className="p-8">
            {/* Page header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-[#0a2240]">Analytics</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {lastRefreshed ? `Last updated at ${formatLastRefreshed(lastRefreshed)}` : "Loading..."}
                    </p>
                </div>
                <button
                    onClick={fetchAnalytics}
                    disabled={isLoading}
                    className="flex items-center gap-2 rounded-full border border-gray-200 text-gray-600 px-4 py-2 text-sm font-medium hover:border-[#0a2240] hover:text-[#0a2240] transition-colors disabled:opacity-50"
                >
                    <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={isLoading ? "animate-spin" : ""}
                    >
                        <path d="M21 2v6h-6" />
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                        <path d="M3 22v-6h6" />
                        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                    Refresh
                </button>
            </div>

            {/* Error state */}
            {error && (
                <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                    <button onClick={fetchAnalytics} className="ml-3 underline font-medium">Retry</button>
                </div>
            )}

            {isLoading && !data ? (
                <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                    Loading analytics...
                </div>
            ) : data ? (
                <div className="space-y-8">
                    {/* Stat cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        <StatCard label="Total Users" value={data.total_users} icon="👥" color="#0a2240" />
                        <StatCard label="Total Conversations" value={data.total_conversations} icon="💬" color="#2323a8" />
                        <StatCard label="Total Messages" value={data.total_messages} icon="✉️" color="#00b5ad" />
                        <StatCard label="Conversations Today" value={data.conversations_today} icon="📅" color="#e8197a" />
                    </div>

                    {/* Recent conversations table */}
                    {data.recent_conversations && data.recent_conversations.length > 0 && (() => {
                        const totalPages = Math.ceil(data.total_conversations / PAGE_SIZE);
                        return (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                <h2 className="text-base font-bold text-[#0a2240]">All Conversations</h2>
                                <span className="text-xs text-gray-400">{data.total_conversations} total</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-50">
                                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">ID</th>
                                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Title</th>
                                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">User</th>
                                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Messages</th>
                                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Created</th>
                                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Last Updated</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {data.recent_conversations.map((conv) => (
                                            <tr key={conv.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-3.5 text-xs text-gray-400 font-mono whitespace-nowrap">
                                                    <span title={conv.id}>{conv.id.slice(0, 8)}…</span>
                                                </td>
                                                <td className="px-6 py-3.5 text-sm text-[#0a2240] font-medium max-w-xs">
                                                    <Link
                                                        href={`/admin/conversations/${conv.id}`}
                                                        className="truncate block hover:underline"
                                                        title={conv.title}
                                                    >
                                                        {conv.title || "Untitled Conversation"}
                                                    </Link>
                                                </td>
                                                <td className="px-6 py-3.5 text-sm text-gray-600 whitespace-nowrap">{conv.username}</td>
                                                <td className="px-6 py-3.5 text-sm text-gray-500 text-center">
                                                    {conv.message_count ?? "—"}
                                                </td>
                                                <td className="px-6 py-3.5 text-sm text-gray-500 whitespace-nowrap" title={formatDate(conv.created_at)}>
                                                    {timeAgo(conv.created_at)}
                                                </td>
                                                <td className="px-6 py-3.5 text-sm text-gray-500 whitespace-nowrap" title={conv.updated_at ? formatDate(conv.updated_at) : undefined}>
                                                    {conv.updated_at ? timeAgo(conv.updated_at) : "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                        Page {page} of {totalPages}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-[#0a2240] hover:text-[#0a2240] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            ← Prev
                                        </button>
                                        <button
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page >= totalPages}
                                            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-[#0a2240] hover:text-[#0a2240] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Next →
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        );
                    })()}

                    {/* Top users table */}
                    {data.top_users && data.top_users.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h2 className="text-base font-bold text-[#0a2240]">Top Users by Conversations</h2>
                            </div>
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-50">
                                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Rank</th>
                                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Username</th>
                                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Conversations</th>
                                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Messages</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {data.top_users.map((user, index) => (
                                        <tr key={user.username} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-3.5 text-sm text-gray-400 font-medium">
                                                {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                                            </td>
                                            <td className="px-6 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-[#0a2240] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                                        {user.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm font-medium text-[#0a2240]">{user.username}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 text-sm text-gray-600 font-medium">
                                                {user.conversation_count}
                                            </td>
                                            <td className="px-6 py-3.5 text-sm text-gray-500">
                                                {user.message_count ?? "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Empty state for tables */}
                    {(!data.recent_conversations || data.recent_conversations.length === 0) &&
                     (!data.top_users || data.top_users.length === 0) && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-20 text-gray-400">
                            <div className="text-4xl mb-3">📊</div>
                            <p className="text-sm font-medium">No conversation data yet</p>
                            <p className="text-xs mt-1">Data will appear here once users start chatting</p>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}
