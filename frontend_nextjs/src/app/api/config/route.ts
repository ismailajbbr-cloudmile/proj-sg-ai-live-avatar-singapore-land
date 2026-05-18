const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

export async function GET() {
    try {
        const upstream = await fetch(`${BACKEND}/config`);
        const data = await upstream.json();
        return new Response(JSON.stringify(data), {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
        });
    } catch {
        return new Response(JSON.stringify({ session_idle_timeout_minutes: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
}
