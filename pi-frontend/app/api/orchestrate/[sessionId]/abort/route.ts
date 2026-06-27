import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const res = await fetch(`http://127.0.0.1:3000/api/orchestrate/${encodeURIComponent(sessionId)}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: "Backend not available", details: String(error) }, { status: 503 });
  }
}
