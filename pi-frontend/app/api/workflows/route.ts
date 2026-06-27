export async function GET() {
  try {
    const res = await fetch("http://127.0.0.1:3000/api/workflows", { cache: "no-store" });
    return Response.json(await res.json().catch(() => ({ workflows: [] })), { status: res.status });
  } catch {
    return Response.json({ error: "Backend not available" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch("http://127.0.0.1:3000/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return Response.json(await res.json().catch(() => ({ ok: res.ok })), { status: res.status });
  } catch {
    return Response.json({ error: "Backend not available" }, { status: 500 });
  }
}
