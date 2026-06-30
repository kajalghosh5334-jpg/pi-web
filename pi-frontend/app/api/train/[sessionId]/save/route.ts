export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/train/${encodeURIComponent(sessionId)}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    return Response.json(data, { status: res.status });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return Response.json({ error: "Train request timed out" }, { status: 504 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Backend not available" }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
