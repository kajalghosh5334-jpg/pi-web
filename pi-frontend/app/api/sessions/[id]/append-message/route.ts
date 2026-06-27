import { NextResponse } from "next/server";
import { resolveSessionPath } from "@/lib/session-reader";
import { SessionManager } from "@earendil-works/pi-coding-agent";

function stripThinkingTags(text: string): string {
  return String(text || "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
}

function sanitizeMessage(message: any) {
  if (!message || typeof message !== "object") return message;
  if (typeof message.content === "string") {
    return { ...message, content: stripThinkingTags(message.content) };
  }
  if (Array.isArray(message.content)) {
    return {
      ...message,
      content: message.content
        .filter((block: any) => block?.type !== "thinking")
        .map((block: any) => block?.type === "text" && typeof block.text === "string"
          ? { ...block, text: stripThinkingTags(block.text) }
          : block),
    };
  }
  return message;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "object") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sm = SessionManager.open(filePath);
    const entryId = sm.appendMessage(sanitizeMessage(message));
    return NextResponse.json({ ok: true, entryId });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
