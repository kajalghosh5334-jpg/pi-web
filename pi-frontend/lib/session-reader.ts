import { SessionManager, buildSessionContext as piBuildSessionContext } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionContext, SessionTreeNode, AssistantMessage, AgentMessage } from "./types";
import type { SessionEntry as PiSessionEntry } from "@earendil-works/pi-coding-agent";
import { normalizeToolCalls } from "./normalize";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
export {
  cacheSessionPath,
  getAgentDir,
  getSessionsDir,
  invalidateSessionListCache,
  invalidateSessionPathCache,
  listAllSessions,
  resolveSessionPath,
} from "./session-list";

const RECENT_CONTEXT_MAX_BYTES = 512 * 1024;
const RECENT_CONTEXT_MAX_MESSAGES = 10;

function parseJsonLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getSessionEntries(filePath: string): SessionEntry[] {
  const entries = SessionManager.open(filePath).getEntries();
  return entries as unknown as SessionEntry[];
}

export function buildTree(entries: SessionEntry[]): SessionTreeNode[] {
  const nodeMap = new Map<string, SessionTreeNode>();
  const labelsById = new Map<string, string>();

  for (const entry of entries) {
    if (entry.type === "label") {
      const l = entry as { type: "label"; targetId: string; label?: string };
      if (l.label) labelsById.set(l.targetId, l.label);
      else labelsById.delete(l.targetId);
    }
  }

  const roots: SessionTreeNode[] = [];
  for (const entry of entries) {
    nodeMap.set(entry.id, { entry, children: [], label: labelsById.get(entry.id) });
  }
  for (const entry of entries) {
    const node = nodeMap.get(entry.id)!;
    if (!entry.parentId) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(entry.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }

  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    node.children.sort((a, b) => new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime());
    stack.push(...node.children);
  }
  return roots;
}

export function buildSessionContext(entries: SessionEntry[], leafId?: string | null): SessionContext {
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) byId.set(e.id, e);

  const piEntries = entries as unknown as PiSessionEntry[];
  const piCtx = piBuildSessionContext(piEntries, leafId, byId as unknown as Map<string, PiSessionEntry>);

  // Build entryIds: parallel array to messages[], mapping each message back to its entry id.
  // Needed for fork and navigate_tree calls from the UI.
  let targetLeaf: SessionEntry | undefined;
  if (leafId === null) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }
  if (leafId) targetLeaf = byId.get(leafId);
  if (!targetLeaf) targetLeaf = entries[entries.length - 1];
  if (!targetLeaf) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }

  // Walk path from target leaf to root
  const path: SessionEntry[] = [];
  let cur: SessionEntry | undefined = targetLeaf;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  // Find the last compaction on path (mirrors pi's buildSessionContext logic)
  let compactionId: string | undefined;
  let firstKeptEntryId: string | undefined;
  for (const e of path) {
    if (e.type === "compaction") {
      compactionId = e.id;
      firstKeptEntryId = (e as { firstKeptEntryId: string }).firstKeptEntryId;
    }
  }

  const entryIds: string[] = [];
  if (compactionId) {
    // The first message in piCtx.messages is the synthetic compaction summary — map to compaction entry id
    entryIds.push(compactionId);
    const compactionIdx = path.findIndex((e) => e.id === compactionId);
    const firstKeptIdx = firstKeptEntryId
      ? path.findIndex((e, i) => i < compactionIdx && e.id === firstKeptEntryId)
      : -1;
    const startIdx = firstKeptIdx >= 0 ? firstKeptIdx : compactionIdx;
    for (let i = startIdx; i < compactionIdx; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
    for (let i = compactionIdx + 1; i < path.length; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
  } else {
    for (const e of path) {
      if (e.type === "message") entryIds.push(e.id);
    }
  }

  // pi injects compaction summary as {role:"compactionSummary", summary, tokensBefore}.
  // Convert to {role:"user"} so MessageView can render it the same as before.
  const messages = (piCtx.messages as AssistantMessage[]).map((msg) => {
    const raw = msg as unknown as Record<string, unknown>;
    if (raw.role === "compactionSummary") {
      return {
        role: "user" as const,
        content: `*The conversation history before this point was compacted into the following summary:*\n\n${raw.summary ?? ""}`,
        timestamp: raw.timestamp as number | undefined,
      };
    }
    return normalizeToolCalls(msg);
  });

  return {
    messages,
    entryIds,
    thinkingLevel: piCtx.thinkingLevel,
    model: piCtx.model,
  };
}

export async function buildRecentSessionContext(filePath: string, maxMessages = RECENT_CONTEXT_MAX_MESSAGES): Promise<SessionContext & { leafId: string | null; partial: boolean }> {
  const fileStats = await stat(filePath).catch(() => null);
  if (!fileStats || fileStats.size === 0) {
    return { messages: [], entryIds: [], thinkingLevel: "off", model: null, leafId: null, partial: false };
  }

  const start = Math.max(0, fileStats.size - RECENT_CONTEXT_MAX_BYTES);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath, { start });
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  const text = Buffer.concat(chunks).toString("utf8");
  const rawLines = text.split("\n");
  const lines = start > 0 ? rawLines.slice(1) : rawLines;
  const entries: SessionEntry[] = [];
  for (const line of lines) {
    const parsed = parseJsonLine(line);
    if (!parsed || parsed.type === "session" || typeof parsed.id !== "string") continue;
    entries.push(parsed as unknown as SessionEntry);
  }

  if (entries.length === 0) {
    return { messages: [], entryIds: [], thinkingLevel: "off", model: null, leafId: null, partial: false };
  }

  const byId = new Map<string, SessionEntry>();
  for (const entry of entries) byId.set(entry.id, entry);

  const leaf = [...entries].reverse().find((entry) => entry.type !== "label" && entry.type !== "session_info") ?? entries[entries.length - 1];
  const path: SessionEntry[] = [];
  let current: SessionEntry | undefined = leaf;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  let thinkingLevel = "off";
  let model: { provider: string; modelId: string } | null = null;
  const messages: AgentMessage[] = [];
  const entryIds: string[] = [];

  for (const entry of path) {
    if (entry.type === "thinking_level_change") {
      thinkingLevel = entry.thinkingLevel;
    } else if (entry.type === "model_change") {
      model = { provider: entry.provider, modelId: entry.modelId };
    } else if (entry.type === "message") {
      const message = normalizeToolCalls(entry.message);
      if (message.role === "assistant") model = { provider: message.provider, modelId: message.model };
      messages.push(message);
      entryIds.push(entry.id);
    } else if (entry.type === "custom_message") {
      messages.push({
        role: "custom",
        customType: entry.customType,
        content: entry.content,
        display: entry.display,
        details: entry.details,
        timestamp: Date.parse(entry.timestamp),
      });
      entryIds.push(entry.id);
    } else if (entry.type === "branch_summary" && entry.summary) {
      messages.push({
        role: "custom",
        customType: "branch_summary",
        content: entry.summary,
        display: true,
        details: { fromId: entry.fromId },
        timestamp: Date.parse(entry.timestamp),
      });
      entryIds.push(entry.id);
    } else if (entry.type === "compaction") {
      messages.push({
        role: "user",
        content: `*The conversation history before this point was compacted into the following summary:*\n\n${entry.summary}`,
        timestamp: Date.parse(entry.timestamp),
      });
      entryIds.push(entry.id);
    }
  }

  const partial = messages.length > maxMessages || Boolean(path[0]?.parentId);

  if (messages.length > maxMessages) {
    return {
      messages: messages.slice(-maxMessages),
      entryIds: entryIds.slice(-maxMessages),
      thinkingLevel,
      model,
      leafId: leaf.id,
      partial,
    };
  }

  return { messages, entryIds, thinkingLevel, model, leafId: leaf.id, partial };
}

export function getLeafId(entries: SessionEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries[entries.length - 1].id;
}
