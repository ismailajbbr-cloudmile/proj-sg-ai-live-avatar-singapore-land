const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

export async function GET(req: Request) {
    const cookie = req.headers.get("cookie") ?? "";
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page") ?? "1";
    const page_size = searchParams.get("page_size") ?? "20";
    const upstream = await fetch(`${BACKEND}/analytics?page=${page}&page_size=${page_size}`, { headers: { "Cookie": cookie } });
    const text = await upstream.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { detail: text }; }
    return new Response(JSON.stringify(data), { status: upstream.status, headers: { "Content-Type": "application/json" } });
}
