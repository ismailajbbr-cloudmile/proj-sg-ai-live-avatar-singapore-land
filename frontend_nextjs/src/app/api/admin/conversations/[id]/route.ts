const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const cookie = req.headers.get("cookie") ?? "";
    const upstream = await fetch(`${BACKEND}/conversations/${id}`, { headers: { "Cookie": cookie } });
    const text = await upstream.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { detail: text }; }
    return new Response(JSON.stringify(data), { status: upstream.status, headers: { "Content-Type": "application/json" } });
}
