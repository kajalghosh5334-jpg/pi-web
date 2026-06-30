import { NextResponse } from "next/server";
import { invalidateSessionListCache, resolveSessionPath } from "@/lib/session-reader";
import { SessionManager } from "@earendil-works/pi-coding-agent";

type PersistedMessage = Parameters<SessionManager["appendMessage"]>[0];

function stripThinkingTags(text: string): string {
  return String(text || "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
}

type MessageBlock = {
  type?: string;
  text?: string;
  [key: string]: unknown;
};

type SanitizableMessage = Record<string, unknown> & {
  content?: string | MessageBlock[];
};

function sanitizeMessage(message: SanitizableMessage): PersistedMessage {
  if (!message || typeof message !== "object") return message;
  if (typeof message.content === "string") {
    return { ...message, content: stripThinkingTags(message.content) } as PersistedMessage;
  }
  if (Array.isArray(message.content)) {
    return {
      ...message,
      content: message.content
        .filter((block) => block?.type !== "thinking")
        .map((block) => block?.type === "text" && typeof block.text === "string"
          ? { ...block, text: stripThinkingTags(block.text) }
          : block),
    } as unknown as PersistedMessage;
  }
  return message as unknown as PersistedMessage;
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
    const entryId = sm.appendMessage(sanitizeMessage(message as SanitizableMessage));
    invalidateSessionListCache();
    return NextResponse.json({ ok: true, entryId });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
