"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, UserRound, MessageSquare } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

interface Message {
    id: string;
    role: "user" | "model";
    content: string;
    created_at: string;
}

interface ConversationDetail {
    id: string;
    title: string | null;
    created_at: string;
    messages: Message[];
}

export default function ConversationDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [data, setData] = useState<ConversationDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(`/api/admin/conversations/${id}`)
            .then(async (res) => {
                const json = await res.json();
                if (!res.ok) {
                    setError(json.detail || "Failed to load conversation");
                    return;
                }
                setData(json);
            })
            .catch(() => setError("Failed to load conversation"))
            .finally(() => setIsLoading(false));
    }, [id]);

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString("en-SG", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

    return (
        <div className="p-4 md:p-8">
            <div className="mb-6 md:mb-8">
                <Link
                    href="/admin/analytics"
                    className="mb-4 inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-[#0a2240] hover:text-[#0a2240]"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Back to Analytics
                </Link>
                <AdminPageHeader
                    title={isLoading ? "Loading…" : data?.title || "Untitled Conversation"}
                    description={
                        data ? (
                            <>
                                {data.messages.length} messages · Started {formatDate(data.created_at)}
                            </>
                        ) : undefined
                    }
                />
            </div>

            {error && (
                <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading conversation…</div>
            ) : data && data.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-20 text-gray-400 shadow-sm">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#f0f4f8] text-[#0a2240]">
                        <MessageSquare className="h-7 w-7" aria-hidden />
                    </div>
                    <p className="text-sm font-medium text-gray-600">No messages yet</p>
                </div>
            ) : data ? (
                <div className="mx-auto max-w-4xl space-y-4">
                    {data.messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            {msg.role === "model" && (
                                <div
                                    className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0a2240] text-xs font-bold text-white"
                                    aria-hidden
                                >
                                    <Bot className="h-4 w-4" aria-hidden />
                                </div>
                            )}
                            <div
                                className={`flex max-w-[min(100%,28rem)] flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                            >
                                <div
                                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                                        msg.role === "user"
                                            ? "rounded-tr-sm bg-[#0a2240] text-white"
                                            : "rounded-tl-sm border border-gray-100 bg-white text-[#1e293b] shadow-sm"
                                    }`}
                                >
                                    {msg.content}
                                </div>
                                <p className="mx-1 mt-1 text-[11px] text-gray-400">{formatDate(msg.created_at)}</p>
                            </div>
                            {msg.role === "user" && (
                                <div
                                    className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600"
                                    aria-hidden
                                >
                                    <UserRound className="h-4 w-4" aria-hidden />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
