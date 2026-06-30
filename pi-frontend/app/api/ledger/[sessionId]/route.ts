export async function GET(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit") || "200";
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/ledger/${encodeURIComponent(sessionId)}?limit=${encodeURIComponent(limit)}`);
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Backend not available" }, { status: 500 });
  }
}
