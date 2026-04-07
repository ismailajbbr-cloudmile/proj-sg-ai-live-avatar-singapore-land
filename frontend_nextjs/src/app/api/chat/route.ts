export const dynamic = "force-dynamic";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

export async function POST(req: Request) {
    const cookie = req.headers.get("cookie") ?? "";
    const body = await req.text();
    let upstream: Response;
    try {
        upstream = await fetch(`${BACKEND}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Cookie": cookie },
            body,
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ detail: "Backend unreachable" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
        });
    }
    if (!upstream.ok) {
        const text = await upstream.text();
        return new Response(text, {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
        });
    }
    return new Response(upstream.body, {
        status: upstream.status,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}
