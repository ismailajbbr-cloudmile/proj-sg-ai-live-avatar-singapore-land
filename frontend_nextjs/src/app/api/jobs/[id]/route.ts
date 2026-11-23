export const dynamic = "force-dynamic";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const cookie = req.headers.get("cookie") ?? "";
    let upstream: Response;
    try {
        upstream = await fetch(`${BACKEND}/jobs/${encodeURIComponent(id)}`, {
            headers: { "Cookie": cookie },
            cache: "no-store",
        });
    } catch {
        return new Response(JSON.stringify({ detail: "Backend unreachable" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
        });
    }
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { "Content-Type": "application/json" } });
}
