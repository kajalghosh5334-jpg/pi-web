import type { SessionInfo } from "./types";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const SESSION_LIST_TTL_MS = 30_000;
const SESSION_PREVIEW_MAX_CHARS = 180;
const SESSION_LIST_SCAN_LINE_LIMIT = 200;
const SESSION_INDEX_VERSION = 1;

interface IndexedSessionInfo extends SessionInfo {
  parentSessionPath?: string;
}

interface SessionIndexEntry {
  mtimeMs: number;
  size: number;
  session: IndexedSessionInfo;
}

interface SessionIndex {
  version: number;
  files: Record<string, SessionIndexEntry>;
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

export async function getAgentDir(): Promise<string> {
  const mod = await import("@earendil-works/pi-coding-agent");
  return mod.getAgentDir();
}

export async function getSessionsDir(): Promise<string> {
  return `${await getAgentDir()}/sessions`;
}

function getSessionIndexPath(agentDir: string): string {
  return join(agentDir, "session-list-index.json");
}

export async function listAllSessions(options: { allowStale?: boolean } = {}): Promise<SessionInfo[]> {
  const now = Date.now();
  const cached = globalThis.__piSessionListCache;
  if (cached && cached.expiresAt > now) return cached.sessions;
  if (cached && options.allowStale) {
    void refreshSessionList().catch((error) => {
      console.warn("[session-list] background session refresh failed:", error);
    });
    return cached.sessions;
  }

  return refreshSessionList();
}

async function refreshSessionList(): Promise<SessionInfo[]> {
  if (globalThis.__piSessionListRefreshPromise) return globalThis.__piSessionListRefreshPromise;
  globalThis.__piSessionListRefreshPromise = refreshSessionListNow().finally(() => {
    globalThis.__piSessionListRefreshPromise = undefined;
  });
  return globalThis.__piSessionListRefreshPromise;
}

async function refreshSessionListNow(): Promise<SessionInfo[]> {
  const now = Date.now();
  const sessions = await listAllSessionsFast();
  const pathToId = new Map<string, string>();
  for (const session of sessions) pathToId.set(session.path, session.id);
  const cache = getPathCache();
  const publicSessions: SessionInfo[] = [];
  for (const session of sessions) {
    cache.set(session.id, session.path);
    const { parentSessionPath, ...publicSession } = session;
    publicSessions.push({
      ...publicSession,
      parentSessionId: parentSessionPath ? pathToId.get(parentSessionPath) : undefined,
    });
  }

  globalThis.__piSessionListCache = {
    expiresAt: now + SESSION_LIST_TTL_MS,
    sessions: publicSessions,
  };
  return publicSessions;
}

async function listAllSessionsFast(): Promise<IndexedSessionInfo[]> {
  const agentDir = await getAgentDir();
  const sessionsDir = `${agentDir}/sessions`;
  const files = await discoverSessionFiles(sessionsDir);
  const index = await readSessionIndex(getSessionIndexPath(agentDir));
  const nextIndex: SessionIndex = { version: SESSION_INDEX_VERSION, files: {} };

  const sessions = (await Promise.all(files.map(async (filePath) => {
    const fileStats = await stat(filePath).catch(() => null);
    if (!fileStats) return null;
    const indexed = index.files[filePath];
    if (indexed && indexed.mtimeMs === fileStats.mtimeMs && indexed.size === fileStats.size) {
      nextIndex.files[filePath] = indexed;
      return indexed.session;
    }

    const session = await readSessionInfoFast(filePath, fileStats.birthtime.toISOString(), fileStats.mtime.toISOString());
    if (session) {
      nextIndex.files[filePath] = {
        mtimeMs: fileStats.mtimeMs,
        size: fileStats.size,
        session,
      };
    }
    return session;
  }))).filter((session): session is IndexedSessionInfo => Boolean(session));

  sessions.sort((a, b) => b.modified.localeCompare(a.modified));
  void writeSessionIndex(getSessionIndexPath(agentDir), nextIndex);
  return sessions;
}

async function discoverSessionFiles(sessionsDir: string): Promise<string[]> {
  const entries = await readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) return;
    const dir = join(sessionsDir, entry.name);
    const names = await readdir(dir).catch(() => []);
    for (const name of names) {
      if (name.endsWith(".jsonl")) files.push(join(dir, name));
    }
  }));
  return files;
}

async function readSessionIndex(indexPath: string): Promise<SessionIndex> {
  if (globalThis.__piSessionListDiskIndex) return globalThis.__piSessionListDiskIndex;
  try {
    const index = JSON.parse(await readFile(indexPath, "utf8")) as SessionIndex;
    if (index.version === SESSION_INDEX_VERSION && index.files && typeof index.files === "object") {
      globalThis.__piSessionListDiskIndex = index;
      return index;
    }
  } catch {
    // Missing or corrupt indexes are rebuilt from session files.
  }
  const empty = { version: SESSION_INDEX_VERSION, files: {} };
  globalThis.__piSessionListDiskIndex = empty;
  return empty;
}

async function writeSessionIndex(indexPath: string, index: SessionIndex): Promise<void> {
  globalThis.__piSessionListDiskIndex = index;
  try {
    await mkdir(dirname(indexPath), { recursive: true });
    await writeFile(indexPath, JSON.stringify(index), "utf8");
  } catch (error) {
    console.warn("[session-list] failed to write session index:", error);
  }
}

async function readSessionInfoFast(filePath: string, fallbackCreated: string, fallbackModified: string): Promise<IndexedSessionInfo | null> {
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
  return {
    path: filePath,
    id: header.id,
    cwd: typeof header.cwd === "string" ? header.cwd : "",
    name,
    created: typeof header.timestamp === "string" ? header.timestamp : fallbackCreated,
    modified: lastTimestamp || fallbackModified,
    messageCount,
    firstMessage: summarizeSessionPreview(firstMessage || "(no messages)"),
    parentSessionPath: typeof header.parentSession === "string" ? header.parentSession : undefined,
  };
}

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

declare global {
  var __piSessionPathCache: Map<string, string> | undefined;
  var __piSessionListCache: { sessions: SessionInfo[]; expiresAt: number } | undefined;
  var __piSessionListRefreshPromise: Promise<SessionInfo[]> | undefined;
  var __piSessionListDiskIndex: SessionIndex | undefined;
}

function getPathCache(): Map<string, string> {
  if (!globalThis.__piSessionPathCache) globalThis.__piSessionPathCache = new Map();
  return globalThis.__piSessionPathCache;
}

export async function resolveSessionPath(sessionId: string): Promise<string | null> {
  const cached = getPathCache().get(sessionId);
  if (cached) return cached;

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
  globalThis.__piSessionListDiskIndex = undefined;
}
