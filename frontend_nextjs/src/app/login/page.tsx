"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            if (res.ok) {
                // Successful login automatically sets the HTTP-only cookie.
                // Check if user is admin and redirect accordingly.
                try {
                    const meRes = await fetch("/api/auth/me");
                    if (meRes.ok) {
                        const meData = await meRes.json();
                        if (meData.is_admin === true) {
                            router.push("/admin");
                            return;
                        }
                    }
                } catch {
                    // If /me check fails, fall through to default redirect
                }
                router.push("/");
                router.refresh(); // Ensure strict middleware recalculation
            } else {
                const data = await res.json();
                setError(data.message || "Login failed. Please try again.");
            }
        } catch (err) {
            setError("An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-screen w-full bg-[#f8f9fa] flex-col justify-center py-12 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
                <img src="/logo-marinasquare.png" alt="Marina Square" className="h-16 object-contain mb-6" />
                <h2 className="mt-2 text-center text-2xl font-bold leading-9 tracking-tight text-[#0a2240]">
                    Sign in to your account
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    AI Concierge Admin Access
                </p>
            </div>

            <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
                <div className="bg-white px-6 py-12 shadow-xl sm:rounded-2xl sm:px-12 border border-[#f1f5f9]">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label className="block text-sm font-medium leading-6 text-[#0a2240]">
                                Username
                            </label>
                            <div className="mt-2">
                                <input
                                    type="text"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#0a2240] sm:text-sm sm:leading-6 bg-gray-50/50 transition-all outline-none"
                                    placeholder="Enter your username"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium leading-6 text-[#0a2240]">
                                Password
                            </label>
                            <div className="mt-2">
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#0a2240] sm:text-sm sm:leading-6 bg-gray-50/50 transition-all outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-md bg-red-50 p-4 border border-red-200">
                                <div className="flex">
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-red-800">{error}</h3>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="flex w-full justify-center rounded-full bg-[#0a2240] px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0a2240]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a2240] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? "Signing in..." : "Sign in"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-8 left-0 right-0 text-center">
                <p className="text-xs text-gray-500">
                    Powered by CloudMile &copy; {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
