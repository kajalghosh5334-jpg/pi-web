export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("http://127.0.0.1:3000/api/agent-profiles", { cache: "no-store", signal: controller.signal });
    const data = await res.json().catch(() => ({ error: "Invalid backend response" }));
    return Response.json(data, { status: res.status });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.name === "AbortError" ? "Backend timed out" : "Backend not available" }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
