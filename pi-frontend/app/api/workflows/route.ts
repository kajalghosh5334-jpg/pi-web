export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("http://127.0.0.1:3000/api/workflows", { cache: "no-store", signal: controller.signal });
    return Response.json(await res.json().catch(() => ({ workflows: [] })), { status: res.status });
  } catch {
    return Response.json({ workflows: [], error: "Backend not available" }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("http://127.0.0.1:3000/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return Response.json(await res.json().catch(() => ({ ok: res.ok })), { status: res.status });
  } catch {
    return Response.json({ error: "Backend not available" }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
