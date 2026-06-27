export async function POST(req: Request) {
  const id = req.url.split("/subagents/")[1]?.split("/")[0] ?? "";
  const body = await req.json().catch(() => ({}));
  try {
    const target = body.sessionId
      ? `http://127.0.0.1:3000/api/task/${encodeURIComponent(body.sessionId)}/${encodeURIComponent(id)}/switch-model`
      : `http://127.0.0.1:3000/api/agent/${id}/switch-model`;
    await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Backend not available" }, { status: 500 });
  }
}
