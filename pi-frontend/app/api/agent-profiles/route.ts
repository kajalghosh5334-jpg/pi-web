export async function GET() {
  try {
    const res = await fetch("http://127.0.0.1:3000/api/agent-profiles", { cache: "no-store" });
    return Response.json(await res.json().catch(() => ({ profiles: [] })), { status: res.status });
  } catch {
    return Response.json({ error: "Backend not available" }, { status: 500 });
  }
}
