import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const dynamic = "force-dynamic";

function getLedgerPath(): string {
  return join(getAgentDir(), "model-capability-ledger.jsonl");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 200), 1000);
    const modelKey = url.searchParams.get("modelKey");
    const path = getLedgerPath();
    const events = existsSync(path)
      ? readFileSync(path, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((event) => !modelKey || event.modelKey === modelKey)
        .slice(-limit)
      : [];
    return NextResponse.json({ ok: true, path, events });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
