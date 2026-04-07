const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

export async function GET(req: Request) {
    const cookie = req.headers.get("cookie") ?? "";
    const upstream = await fetch(`${BACKEND}/auth/me`, {
        headers: { "Cookie": cookie },
    });
    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
    });
}
