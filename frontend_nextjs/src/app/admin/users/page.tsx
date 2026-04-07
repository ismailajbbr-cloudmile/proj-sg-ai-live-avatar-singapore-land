"use client";
import { useState, useEffect, useCallback } from "react";

interface User {
    id: string;
    username: string;
    is_admin: boolean;
    created_at: string;
}

interface PasswordModalProps {
    title: string;
    password: string;
    onClose: () => void;
}

function PasswordModal({ title, password, onClose }: PasswordModalProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(password).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">
                <h3 className="text-lg font-bold text-[#0a2240] mb-2">{title}</h3>
                <p className="text-sm text-gray-500 mb-4">
                    Save this password now — it will not be shown again.
                </p>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-6">
                    <span className="flex-1 font-mono text-sm text-[#0a2240] break-all">{password}</span>
                    <button
                        onClick={handleCopy}
                        className="flex-shrink-0 text-xs font-semibold text-[#0a2240] border border-[#0a2240]/20 rounded-md px-3 py-1.5 hover:bg-[#0a2240] hover:text-white transition-colors"
                    >
                        {copied ? "Copied!" : "Copy"}
                    </button>
                </div>
                <button
                    onClick={onClose}
                    className="w-full rounded-full bg-[#0a2240] text-white py-3 text-sm font-semibold hover:bg-[#0a2240]/90 transition-colors"
                >
                    Done
                </button>
            </div>
        </div>
    );
}

interface CreateUserModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
    const [username, setUsername] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;
        setIsLoading(true);
        setError("");
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username.trim(), is_admin: isAdmin }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.detail || data.error || "Failed to create user");
                return;
            }
            setGeneratedPassword(data.password || data.generated_password || "");
            onSuccess();
        } catch {
            setError("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    if (generatedPassword !== null) {
        return (
            <PasswordModal
                title={`User "${username}" created`}
                password={generatedPassword}
                onClose={onClose}
            />
        );
    }

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">
                <h3 className="text-lg font-bold text-[#0a2240] mb-6">Create New User</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[#0a2240] mb-1.5">
                            Username
                        </label>
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username"
                            className="block w-full rounded-lg border border-gray-300 py-2.5 px-4 text-sm text-gray-900 focus:ring-2 focus:ring-[#0a2240] focus:border-transparent outline-none transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="is_admin"
                            checked={isAdmin}
                            onChange={(e) => setIsAdmin(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-[#0a2240] focus:ring-[#0a2240]"
                        />
                        <label htmlFor="is_admin" className="text-sm font-medium text-gray-700">
                            Grant admin privileges
                        </label>
                    </div>
                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-full border border-gray-200 text-gray-600 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !username.trim()}
                            className="flex-1 rounded-full bg-[#0a2240] text-white py-2.5 text-sm font-semibold hover:bg-[#0a2240]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? "Creating..." : "Create User"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [resetPasswordModal, setResetPasswordModal] = useState<{ password: string; username: string } | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [resettingId, setResettingId] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        setError("");
        try {
            const res = await fetch("/api/admin/users");
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.detail || "Failed to load users");
                return;
            }
            const data = await res.json();
            setUsers(Array.isArray(data) ? data : data.users ?? []);
        } catch {
            setError("Failed to load users");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleDelete = async (user: User) => {
        if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
        setDeletingId(user.id);
        try {
            const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
            if (res.ok) {
                setUsers((prev) => prev.filter((u) => u.id !== user.id));
            } else {
                alert("Failed to delete user");
            }
        } catch {
            alert("An error occurred while deleting the user");
        } finally {
            setDeletingId(null);
        }
    };

    const handleResetPassword = async (user: User) => {
        if (!confirm(`Reset password for "${user.username}"?`)) return;
        setResettingId(user.id);
        try {
            const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                setResetPasswordModal({
                    password: data.password || data.new_password || "",
                    username: user.username,
                });
            } else {
                alert(data.detail || "Failed to reset password");
            }
        } catch {
            alert("An error occurred while resetting the password");
        } finally {
            setResettingId(null);
        }
    };

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

    return (
        <div className="p-8">
            {/* Page header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-[#0a2240]">User Management</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {isLoading ? "Loading..." : `${users.length} user${users.length !== 1 ? "s" : ""} total`}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 rounded-full bg-[#0a2240] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#0a2240]/90 transition-colors shadow-sm"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Create User
                </button>
            </div>

            {/* Error state */}
            {error && (
                <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                    <button onClick={fetchUsers} className="ml-3 underline font-medium">Retry</button>
                </div>
            )}

            {/* Users table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                        Loading users...
                    </div>
                ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <div className="text-4xl mb-3">👥</div>
                        <p className="text-sm font-medium">No users yet</p>
                        <p className="text-xs mt-1">Create your first user to get started</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100">
                                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-4">Username</th>
                                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-4">Role</th>
                                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-4">Created</th>
                                <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-8 h-8 rounded-full bg-[#0a2240] text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                                            >
                                                {user.username.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-sm font-medium text-[#0a2240]">{user.username}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            user.is_admin
                                                ? "bg-[#0a2240]/10 text-[#0a2240]"
                                                : "bg-gray-100 text-gray-600"
                                        }`}>
                                            {user.is_admin ? "Admin" : "User"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {formatDate(user.created_at)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                            {user.is_admin ? (
                                                <span className="text-xs text-gray-400 italic">Protected</span>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => handleResetPassword(user)}
                                                        disabled={resettingId === user.id}
                                                        className="text-xs font-medium text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-[#0a2240] hover:text-[#0a2240] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {resettingId === user.id ? "Resetting..." : "Reset Password"}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(user)}
                                                        disabled={deletingId === user.id}
                                                        className="text-xs font-medium text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {deletingId === user.id ? "Deleting..." : "Delete"}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modals */}
            {showCreateModal && (
                <CreateUserModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={fetchUsers}
                />
            )}
            {resetPasswordModal && (
                <PasswordModal
                    title={`New password for "${resetPasswordModal.username}"`}
                    password={resetPasswordModal.password}
                    onClose={() => setResetPasswordModal(null)}
                />
            )}
        </div>
    );
}
