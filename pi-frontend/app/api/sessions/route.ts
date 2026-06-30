import { NextResponse } from "next/server";

const SESSION_ROUTE_TIMEOUT_MS = 20_000;

function timeoutResult(): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Session list timed out")), SESSION_ROUTE_TIMEOUT_MS);
  });
}

export async function GET() {
  try {
    const sessions = await Promise.race([
      import("@/lib/session-reader").then((mod) => mod.listAllSessions()),
      timeoutResult(),
    ]);
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      { sessions: [], error: String(error) },
      { status: 200 }
    );
  }
}
