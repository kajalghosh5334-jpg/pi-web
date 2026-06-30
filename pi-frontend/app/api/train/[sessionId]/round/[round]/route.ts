export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string; round: string }> }) {
  const { sessionId, round } = await params;
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/train/${encodeURIComponent(sessionId)}/round/${encodeURIComponent(round)}`);
    const data = await res.json().catch(() => ({ ok: res.ok }));
    return Response.json(data, { status: res.status });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Backend not available" }, { status: 500 });
  }
}
