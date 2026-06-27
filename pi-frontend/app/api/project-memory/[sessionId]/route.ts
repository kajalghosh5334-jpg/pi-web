export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/project-memory/${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Backend not available" }, { status: 500 });
  }
}
