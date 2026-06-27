export async function POST(req: Request) {
  const taskId = req.url.split("/subagents/")[1]?.split("/")[0] ?? "";
  const body = await req.json().catch(() => ({}));
  if (!body.sessionId) return Response.json({ error: "sessionId required" }, { status: 400 });
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/task/${encodeURIComponent(body.sessionId)}/${encodeURIComponent(taskId)}/rerun`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return Response.json(await res.json().catch(() => ({ ok: res.ok })), { status: res.status });
  } catch {
    return Response.json({ error: "Backend not available" }, { status: 500 });
  }
}
