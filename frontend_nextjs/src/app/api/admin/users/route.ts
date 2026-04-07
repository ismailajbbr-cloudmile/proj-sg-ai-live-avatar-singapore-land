const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

async function proxyJson(upstream: Response): Promise<Response> {
    const text = await upstream.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { detail: text }; }
    return new Response(JSON.stringify(data), { status: upstream.status, headers: { "Content-Type": "application/json" } });
}

export async function GET(req: Request) {
    const cookie = req.headers.get("cookie") ?? "";
    const upstream = await fetch(`${BACKEND}/users/`, { headers: { "Cookie": cookie } });
    return proxyJson(upstream);
}

export async function POST(req: Request) {
    const cookie = req.headers.get("cookie") ?? "";
    const body = await req.text();
    const upstream = await fetch(`${BACKEND}/users/`, { method: "POST", headers: { "Content-Type": "application/json", "Cookie": cookie }, body });
    return proxyJson(upstream);
}
