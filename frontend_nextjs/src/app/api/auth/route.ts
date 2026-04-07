const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

export async function POST(req: Request) {
    const body = await req.text();
    const upstream = await fetch(`${BACKEND}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });
    const data = await upstream.json();
    const res = new Response(JSON.stringify(data), {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
    });
    // Forward Set-Cookie from FastAPI to the browser — not automatic in Next.js
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) res.headers.set("set-cookie", setCookie);
    return res;
}
