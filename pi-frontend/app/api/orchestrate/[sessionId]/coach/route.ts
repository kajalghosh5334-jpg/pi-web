export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const body = await req.json();
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/orchestrate/${encodeURIComponent(sessionId)}/coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Backend not available" }, { status: 500 });
  }
}
