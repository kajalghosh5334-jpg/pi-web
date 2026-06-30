import { SessionManager, buildSessionContext as piBuildSessionContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionInfo, SessionContext, SessionTreeNode, AssistantMessage, AgentMessage } from "./types";
import type { SessionEntry as PiSessionEntry } from "@earendil-works/pi-coding-agent";
import { normalizeToolCalls } from "./normalize";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

export { getAgentDir };

const SESSION_LIST_TTL_MS = 5_000;
const SESSION_PREVIEW_MAX_CHARS = 180;
const SESSION_LIST_SCAN_LINE_LIMIT = 200;
const RECENT_CONTEXT_MAX_BYTES = 512 * 1024;
const RECENT_CONTEXT_MAX_MESSAGES = 80;

export function getSessionsDir(): string {
  return `${getAgentDir()}/sessions`;
}

export async function listAllSessions(): Promise<SessionInfo[]> {
  const now = Date.now();
  const cached = globalThis.__piSessionListCache;
  if (cached && cached.expiresAt > now) return cached.sessions;

  const sessions = await listAllSessionsFast();
  const pathToId = new Map<string, string>();
  for (const session of sessions) pathToId.set(session.path, session.id);
  const cache = getPathCache();
  for (const session of sessions) {
    cache.set(session.id, session.path);
    session.parentSessionId = session.parentSessionPath ? pathToId.get(session.parentSessionPath) : undefined;
    delete session.parentSessionPath;
  }

  globalThis.__piSessionListCache = {
    expiresAt: now + SESSION_LIST_TTL_MS,
    sessions,
  };
  return sessions;
}

async function listAllSessionsFast(): Promise<Array<SessionInfo & { parentSessionPath?: string }>> {
  const sessionsDir = getSessionsDir();
  const entries = await readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(sessionsDir, entry.name);
    const names = await readdir(dir).catch(() => []);
    for (const name of names) {
      if (name.endsWith(".jsonl")) files.push(join(dir, name));
    }
  }

  const sessions = (await Promise.all(files.map(readSessionInfoFast))).filter((session): session is SessionInfo & { parentSessionPath?: string } => Boolean(session));
  sessions.sort((a, b) => b.modified.localeCompare(a.modified));
  return sessions;
}

async function readSessionInfoFast(filePath: string): Promise<(SessionInfo & { parentSessionPath?: string }) | null> {
  const fileStats = await stat(filePath).catch(() => null);
  if (!fileStats) return null;
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let header: { id?: string; cwd?: string; timestamp?: string; parentSession?: string } | null = null;
  let firstMessage = "";
  let name: string | undefined;
  let messageCount = 0;
  let lastTimestamp = "";
  let scanned = 0;

  try {
    for await (const line of rl) {
      scanned++;
      const entry = parseJsonLine(line);
      if (!entry) continue;
      if (!header) {
        if (entry.type !== "session") return null;
        header = entry;
        lastTimestamp = String(entry.timestamp || "");
        continue;
      }
      if (entry.timestamp) lastTimestamp = String(entry.timestamp);
      if (entry.type === "session_info") name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : undefined;
      if (entry.type === "message") {
        messageCount++;
        if (!firstMessage && entry.message?.role === "user") firstMessage = extractMessageText(entry.message);
      }
      if (scanned >= SESSION_LIST_SCAN_LINE_LIMIT && firstMessage) break;
    }
  } finally {
    rl.close();
  }

  if (!header?.id) return null;
  const created = typeof header.timestamp === "string" ? header.timestamp : fileStats.birthtime.toISOString();
  const modified = lastTimestamp || fileStats.mtime.toISOString();
  return {
    path: filePath,
    id: header.id,
    cwd: typeof header.cwd === "string" ? header.cwd : "",
    name,
    created,
    modified,
    messageCount,
    firstMessage: summarizeSessionPreview(firstMessage || "(no messages)"),
    parentSessionPath: typeof header.parentSession === "string" ? header.parentSession : undefined,
  };
}

type ParsedSessionLine = Record<string, unknown> & {
  type?: string;
  id?: string;
  timestamp?: string;
  cwd?: string;
  parentSession?: string;
  name?: string;
  message?: { role?: string; content?: unknown };
};

function parseJsonLine(line: string): ParsedSessionLine | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function extractMessageText(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => {
    if (block && typeof block === "object" && "text" in block) return String((block as { text?: unknown }).text || "");
    return "";
  }).filter(Boolean).join(" ");
}

function summarizeSessionPreview(firstMessage: string | null | undefined): string {
  const compact = String(firstMessage || "(no messages)")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= SESSION_PREVIEW_MAX_CHARS) return compact;
  return `${compact.slice(0, SESSION_PREVIEW_MAX_CHARS - 1)}…`;
}

// ============================================================================
// Session path cache: sessionId → absolute file path
// Stored in globalThis for hot-reload safety
// ============================================================================
declare global {
  var __piSessionPathCache: Map<string, string> | undefined;
  var __piSessionListCache: { sessions: SessionInfo[]; expiresAt: number } | undefined;
}

function getPathCache(): Map<string, string> {
  if (!globalThis.__piSessionPathCache) globalThis.__piSessionPathCache = new Map();
  return globalThis.__piSessionPathCache;
}

export async function resolveSessionPath(sessionId: string): Promise<string | null> {
  const cached = getPathCache().get(sessionId);
  if (cached) return cached;

  // Cache miss: scan all sessions to populate cache, then retry
  await listAllSessions();
  return getPathCache().get(sessionId) ?? null;
}

export function cacheSessionPath(sessionId: string, filePath: string): void {
  getPathCache().set(sessionId, filePath);
}

export function invalidateSessionPathCache(sessionId: string): void {
  getPathCache().delete(sessionId);
}

export function invalidateSessionListCache(): void {
  globalThis.__piSessionListCache = undefined;
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

export async function buildRecentSessionContext(filePath: string, maxMessages = RECENT_CONTEXT_MAX_MESSAGES): Promise<SessionContext & { leafId: string | null }> {
  const fileStats = await stat(filePath).catch(() => null);
  if (!fileStats || fileStats.size === 0) {
    return { messages: [], entryIds: [], thinkingLevel: "off", model: null, leafId: null };
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
    return { messages: [], entryIds: [], thinkingLevel: "off", model: null, leafId: null };
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

  if (messages.length > maxMessages) {
    return {
      messages: messages.slice(-maxMessages),
      entryIds: entryIds.slice(-maxMessages),
      thinkingLevel,
      model,
      leafId: leaf.id,
    };
  }

  return { messages, entryIds, thinkingLevel, model, leafId: leaf.id };
}

export function getLeafId(entries: SessionEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries[entries.length - 1].id;
}
