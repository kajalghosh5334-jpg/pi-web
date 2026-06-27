export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const body = await req.json().catch(() => ({}));
  const { sessionId } = await params;
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/orchestrate/${encodeURIComponent(sessionId)}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return Response.json(data ?? {}, { status: res.status });
  } catch (error) {
    console.error("[api/orchestrate/confirm] backend fetch failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Backend not available" }, { status: 500 });
  }
}
