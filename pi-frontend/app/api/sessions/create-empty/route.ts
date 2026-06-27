import { NextResponse } from "next/server";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { cacheSessionPath } from "@/lib/session-reader";
import { allowFileRoot } from "@/lib/file-access";

export async function POST(req: Request) {
  try {
    const { cwd, name } = await req.json() as { cwd?: string; name?: string };
    if (!cwd || typeof cwd !== "string") {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    if (!existsSync(cwd)) {
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }

    const sm = SessionManager.create(cwd);
    // Force file creation so the session can be listed/resolved before an agent process exists.
    sm.appendSessionInfo((name || "Multi-Agent Session").slice(0, 80));
    const filePath = sm.getSessionFile();
    // SessionManager intentionally delays writing user-only sessions until an assistant
    // exists. For Multi-Agent we need the session to exist immediately so later append
    // calls can resolve/open it, so flush the header/session_info entries now.
    if (filePath && !existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true });
      const header = sm.getHeader();
      const entries = [header, ...sm.getEntries()].filter(Boolean);
      writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    }
    const sessionId = sm.getHeader()?.id || sm.getSessionId();
    if (filePath) cacheSessionPath(sessionId, filePath);
    allowFileRoot(cwd);

    return NextResponse.json({ ok: true, sessionId, filePath });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
