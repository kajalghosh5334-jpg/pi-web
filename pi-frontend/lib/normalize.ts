import type { AgentMessage, AssistantMessage, TextContent, ToolCallContent } from "./types";

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function normalizeToolCallBlock(block: unknown): ToolCallContent | null {
  if (!isObject(block) || block.type !== "toolCall") return null;
  return {
    type: "toolCall",
    toolCallId: typeof block.toolCallId === "string" ? block.toolCallId : (typeof block.id === "string" ? block.id : ""),
    toolName: typeof block.toolName === "string" ? block.toolName : (typeof block.name === "string" ? block.name : ""),
    input: typeof block.input === "object" && block.input !== null && !Array.isArray(block.input)
      ? block.input as Record<string, unknown>
      : (typeof block.arguments === "object" && block.arguments !== null && !Array.isArray(block.arguments)
        ? block.arguments as Record<string, unknown>
        : {}),
  };
}

function normalizeTextBlock(block: unknown): TextContent | null {
  if (!isObject(block) || block.type !== "text") return null;
  const text = typeof block.text === "string" ? block.text : "";
  const signature = block.textSignature;
  return {
    type: "text",
    text,
    ...(typeof signature === "string" || isObject(signature) ? { textSignature: signature as TextContent["textSignature"] } : {}),
  };
}

export function normalizeToolCalls(msg: AgentMessage): AgentMessage {
  if (msg.role !== "assistant") return msg;
  const content = (msg as AssistantMessage).content;
  if (!Array.isArray(content)) return msg;
  const normalized = content.map((block) => {
    const toolCall = normalizeToolCallBlock(block);
    if (toolCall) return toolCall;
    return normalizeTextBlock(block) ?? block;
  });
  return { ...msg, content: normalized } as AgentMessage;
}

export function parseTextSignature(signature?: TextContent["textSignature"]): { id?: string; phase?: "commentary" | "final_answer" } | null {
  if (!signature) return null;
  if (typeof signature === "object") {
    return {
      id: typeof signature.id === "string" ? signature.id : undefined,
      phase: signature.phase === "commentary" || signature.phase === "final_answer" ? signature.phase : undefined,
    };
  }
  if (!signature.startsWith("{")) return { id: signature };
  try {
    const parsed = JSON.parse(signature) as { id?: unknown; phase?: unknown };
    return {
      id: typeof parsed.id === "string" ? parsed.id : undefined,
      phase: parsed.phase === "commentary" || parsed.phase === "final_answer" ? parsed.phase : undefined,
    };
  } catch {
    return null;
  }
}

export function isCommentaryTextBlock(block: TextContent): boolean {
  return parseTextSignature(block.textSignature)?.phase === "commentary";
}
