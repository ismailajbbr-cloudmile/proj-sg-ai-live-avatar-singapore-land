"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { UserPlus, Copy, Check, KeyRound, Trash2, Users } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminDialog } from "@/components/admin/AdminDialog";

interface User {
    id: string;
    username: string;
    is_admin: boolean;
    created_at: string;
}

interface PasswordModalProps {
    open: boolean;
    title: string;
    password: string;
    onClose: () => void;
}

function PasswordModal({ open, title, password, onClose }: PasswordModalProps) {
    const [copied, setCopied] = useState(false);
    const titleId = useId();

    const handleCopy = () => {
        void navigator.clipboard.writeText(password).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <AdminDialog open={open} onClose={onClose} labelledBy={titleId}>
            <div className="p-8">
                <h3 id={titleId} className="text-lg font-bold text-[#0a2240]">
                    {title}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                    Save this password now — it will not be shown again.
                </p>
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <span className="flex-1 break-all font-mono text-sm text-[#0a2240]">{password}</span>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="flex shrink-0 items-center gap-1 rounded-md border border-[#0a2240]/20 px-3 py-1.5 text-xs font-semibold text-[#0a2240] transition-colors hover:bg-[#0a2240] hover:text-white"
                    >
                        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="mt-6 w-full rounded-full bg-[#0a2240] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0a2240]/90"
                >
                    Done
                </button>
            </div>
        </AdminDialog>
    );
}

interface CreateUserModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

function CreateUserModal({ open, onClose, onSuccess }: CreateUserModalProps) {
    const [username, setUsername] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const titleId = useId();

    useEffect(() => {
        if (!open) return;
        setUsername("");
        setIsAdmin(false);
        setError("");
        setGeneratedPassword(null);
        setIsLoading(false);
    }, [open]);

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

    const handleClose = () => {
        setUsername("");
        setIsAdmin(false);
        setError("");
        setGeneratedPassword(null);
        onClose();
    };

    if (generatedPassword !== null) {
        return (
            <PasswordModal
                open={open}
                title={`User "${username}" created`}
                password={generatedPassword}
                onClose={handleClose}
            />
        );
    }

    return (
        <AdminDialog open={open} onClose={handleClose} labelledBy={titleId}>
            <div className="p-8">
                <h3 id={titleId} className="text-lg font-bold text-[#0a2240]">
                    Create New User
                </h3>
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <label htmlFor="new-username" className="mb-1.5 block text-sm font-medium text-[#0a2240]">
                            Username
                        </label>
                        <input
                            id="new-username"
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username"
                            autoComplete="off"
                            className="block w-full rounded-lg border border-gray-300 py-2.5 px-4 text-sm text-gray-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#0a2240]"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="is_admin"
                            checked={isAdmin}
                            onChange={(e) => setIsAdmin(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-[#0a2240] focus:ring-[#0a2240]"
                        />
                        <label htmlFor="is_admin" className="text-sm font-medium text-gray-700">
                            Grant admin privileges
                        </label>
                    </div>
                    {error && (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
                            {error}
                        </p>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="flex-1 rounded-full border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !username.trim()}
                            className="flex-1 rounded-full bg-[#0a2240] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0a2240]/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isLoading ? "Creating…" : "Create User"}
                        </button>
                    </div>
                </form>
            </div>
        </AdminDialog>
    );
}

type ConfirmKind = "delete" | "reset";

interface ConfirmState {
    kind: ConfirmKind;
    user: User;
}

function ConfirmActionDialog({
    open,
    state,
    onCancel,
    onConfirm,
    isBusy,
}: {
    open: boolean;
    state: ConfirmState | null;
    onCancel: () => void;
    onConfirm: () => void;
    isBusy: boolean;
}) {
    const titleId = useId();
    if (!state) return null;

    const title = state.kind === "delete" ? "Delete user?" : "Reset password?";
    const body =
        state.kind === "delete"
            ? `Delete user "${state.user.username}"? This cannot be undone.`
            : `Generate a new password for "${state.user.username}"? The old password will stop working.`;

    return (
        <AdminDialog open={open} onClose={onCancel} labelledBy={titleId} closeOnBackdrop>
            <div className="p-8">
                <h3 id={titleId} className="text-lg font-bold text-[#0a2240]">
                    {title}
                </h3>
                <p className="mt-2 text-sm text-gray-600">{body}</p>
                <div className="mt-6 flex gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isBusy}
                        className="flex-1 rounded-full border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isBusy}
                        className={`flex-1 rounded-full py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            state.kind === "delete"
                                ? "bg-red-600 hover:bg-red-700"
                                : "bg-[#0a2240] hover:bg-[#0a2240]/90"
                        }`}
                    >
                        {isBusy
                            ? state.kind === "delete"
                                ? "Deleting…"
                                : "Resetting…"
                            : state.kind === "delete"
                              ? "Delete"
                              : "Reset password"}
                    </button>
                </div>
            </div>
        </AdminDialog>
    );
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [resetPasswordModal, setResetPasswordModal] = useState<{ password: string; username: string } | null>(
        null,
    );
    const [actionError, setActionError] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);
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
            setUsers(Array.isArray(data) ? data : (data.users ?? []));
        } catch {
            setError("Failed to load users");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchUsers();
    }, [fetchUsers]);

    const runDelete = async () => {
        if (!confirm || confirm.kind !== "delete") return;
        const user = confirm.user;
        setDeletingId(user.id);
        setActionError(null);
        try {
            const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
            if (res.ok) {
                setUsers((prev) => prev.filter((u) => u.id !== user.id));
                setConfirm(null);
            } else {
                const data = await res.json().catch(() => ({}));
                setActionError(data.detail || "Failed to delete user");
            }
        } catch {
            setActionError("An error occurred while deleting the user");
        } finally {
            setDeletingId(null);
        }
    };

    const runResetPassword = async () => {
        if (!confirm || confirm.kind !== "reset") return;
        const user = confirm.user;
        setResettingId(user.id);
        setActionError(null);
        try {
            const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                setResetPasswordModal({
                    password: data.password || data.new_password || "",
                    username: user.username,
                });
                setConfirm(null);
            } else {
                setActionError(data.detail || "Failed to reset password");
            }
        } catch {
            setActionError("An error occurred while resetting the password");
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

    const busy = deletingId !== null || resettingId !== null;

    return (
        <div className="p-4 md:p-8">
            <AdminPageHeader
                title="User Management"
                description={
                    isLoading ? "Loading…" : `${users.length} user${users.length !== 1 ? "s" : ""} total`
                }
                actions={
                    <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2323a8]/25 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
                        style={{
                            background: "linear-gradient(135deg, #2323a8 0%, #00b5ad 100%)",
                        }}
                    >
                        <UserPlus className="h-4 w-4" aria-hidden />
                        Create User
                    </button>
                }
            />

            {actionError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                    {actionError}
                    <button type="button" onClick={() => setActionError(null)} className="ml-3 font-medium underline">
                        Dismiss
                    </button>
                </div>
            )}

            {error && (
                <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                    <button type="button" onClick={() => void fetchUsers()} className="ml-3 font-medium underline">
                        Retry
                    </button>
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading users…</div>
                ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#f0f4f8] text-[#0a2240]">
                            <Users className="h-7 w-7" aria-hidden />
                        </div>
                        <p className="text-sm font-medium text-gray-600">No users yet</p>
                        <p className="mt-1 text-xs text-gray-400">Create your first user to get started</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px]">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    <th
                                        scope="col"
                                        className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                    >
                                        Username
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                    >
                                        Role
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                    >
                                        Created
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6"
                                    >
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {users.map((user) => (
                                    <tr key={user.id} className="transition-colors hover:bg-gray-50/50">
                                        <td className="px-4 py-4 md:px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0a2240] text-xs font-bold text-white">
                                                    {user.username.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-sm font-medium text-[#0a2240]">{user.username}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 md:px-6">
                                            <span
                                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                    user.is_admin
                                                        ? "bg-[#0a2240]/10 text-[#0a2240]"
                                                        : "bg-gray-100 text-gray-600"
                                                }`}
                                            >
                                                {user.is_admin ? "Admin" : "User"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-gray-500 md:px-6">{formatDate(user.created_at)}</td>
                                        <td className="px-4 py-4 md:px-6">
                                            <div className="flex items-center justify-end gap-2">
                                                {user.is_admin ? (
                                                    <span className="text-xs italic text-gray-400">Protected</span>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirm({ kind: "reset", user })}
                                                            disabled={resettingId === user.id || deletingId === user.id}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-[#0a2240] hover:text-[#0a2240] disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            <KeyRound className="h-3.5 w-3.5" aria-hidden />
                                                            {resettingId === user.id ? "Resetting…" : "Reset"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirm({ kind: "delete", user })}
                                                            disabled={deletingId === user.id || resettingId === user.id}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:border-red-500 hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                                            {deletingId === user.id ? "Deleting…" : "Delete"}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <CreateUserModal
                open={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSuccess={fetchUsers}
            />
            {resetPasswordModal && (
                <PasswordModal
                    open
                    title={`New password for "${resetPasswordModal.username}"`}
                    password={resetPasswordModal.password}
                    onClose={() => setResetPasswordModal(null)}
                />
            )}
            <ConfirmActionDialog
                open={confirm !== null}
                state={confirm}
                onCancel={() => !busy && setConfirm(null)}
                onConfirm={() => {
                    if (confirm?.kind === "delete") void runDelete();
                    else if (confirm?.kind === "reset") void runResetPassword();
                }}
                isBusy={busy}
            />
        </div>
    );
}
