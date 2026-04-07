"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

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
    const router = useRouter();
    const [data, setData] = useState<ConversationDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(`/api/admin/conversations/${id}`)
            .then(async (res) => {
                const json = await res.json();
                if (!res.ok) { setError(json.detail || "Failed to load conversation"); return; }
                setData(json);
            })
            .catch(() => setError("Failed to load conversation"))
            .finally(() => setIsLoading(false));
    }, [id]);

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString("en-SG", {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit",
        });

    return (
        <div className="p-8 max-w-4xl">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#0a2240] transition-colors"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-[#0a2240]">
                        {isLoading ? "Loading..." : (data?.title || "Untitled Conversation")}
                    </h1>
                    {data && (
                        <p className="text-sm text-gray-500 mt-0.5">
                            {data.messages.length} messages &bull; Started {formatDate(data.created_at)}
                        </p>
                    )}
                </div>
            </div>

            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                    Loading conversation...
                </div>
            ) : data && data.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <div className="text-4xl mb-3">💬</div>
                    <p className="text-sm font-medium">No messages yet</p>
                </div>
            ) : data ? (
                <div className="space-y-4">
                    {data.messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            {msg.role === "model" && (
                                <div className="w-8 h-8 rounded-full bg-[#0a2240] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-1">
                                    AI
                                </div>
                            )}
                            <div className={`max-w-[70%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                                <div
                                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                                        msg.role === "user"
                                            ? "bg-[#0a2240] text-white rounded-tr-sm"
                                            : "bg-white border border-gray-100 text-[#1e293b] rounded-tl-sm shadow-sm"
                                    }`}
                                >
                                    {msg.content}
                                </div>
                                <p className="text-[11px] text-gray-400 mt-1 mx-1">
                                    {formatDate(msg.created_at)}
                                </p>
                            </div>
                            {msg.role === "user" && (
                                <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-1">
                                    U
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
