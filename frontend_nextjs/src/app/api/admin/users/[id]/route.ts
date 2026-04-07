const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://backend:8000";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const cookie = req.headers.get("cookie") ?? "";
    const upstream = await fetch(`${BACKEND}/users/${id}`, { method: "DELETE", headers: { "Cookie": cookie } });
    return new Response(null, { status: upstream.status });
}
