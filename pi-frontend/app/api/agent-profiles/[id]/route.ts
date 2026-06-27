export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/agent-profiles/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return Response.json(await res.json().catch(() => ({ ok: res.ok })), { status: res.status });
  } catch {
    return Response.json({ error: "Backend not available" }, { status: 500 });
  }
}
