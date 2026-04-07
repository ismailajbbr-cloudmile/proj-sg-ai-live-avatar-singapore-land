const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

export async function POST(req: Request) {
    const cookie = req.headers.get("cookie") ?? "";
    const upstream = await fetch(`${BACKEND}/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookie },
    });
    const data = await upstream.json();
    const res = new Response(JSON.stringify(data), {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
    });
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) res.headers.set("set-cookie", setCookie);
    return res;
}
