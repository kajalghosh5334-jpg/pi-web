import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { allowFileRoot, normalizeSlashes } from "@/lib/file-access";
import { resolveSessionPath } from "@/lib/session-reader";

interface ArtifactItem {
  path: string;
  name: string;
  kind: "file";
  source: "tool" | "workflow";
  label?: string;
  toolName?: string;
  previewType: "document" | "image" | "audio";
  size: number;
  modified: string;
}

const WORKFLOW_WORKSPACE = process.env.PI_WORKSPACE_DIR || "/tmp/pi-multi-agent";
const TOOL_NAMES = new Set(["write", "edit"]);
const PATH_KEYS = new Set([
  "path",
  "filePath",
  "filepath",
  "artifactPath",
  "outputPath",
  "outputArtifact",
  "nodeOutputArtifact",
  "markdownPath",
  "jsonPath",
]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "oga", "opus", "m4a", "aac", "flac", "weba", "webm"]);
const DOCUMENT_EXTS = new Set(["md", "mdx", "html", "htm", "pdf", "docx", "txt", "rtf"]);
const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".cache", ".pi-sessions"]);
const MAX_DIRECTORY_ARTIFACTS = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanPathValue(value: string): string {
  return value
    .trim()
    .replace(/^file:\/\//, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[),.;:，。；：]+$/g, "");
}

function resolveCandidatePath(value: unknown, cwd: string): string | null {
  if (typeof value !== "string") return null;
  const cleaned = cleanPathValue(value);
  if (!cleaned || cleaned.length > 600 || cleaned.includes("\n")) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) return null;

  const normalized = normalizeSlashes(cleaned);
  if (normalized.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(cleaned) || normalized.startsWith("//")) {
    return normalized;
  }
  if (!cwd) return null;
  return normalizeSlashes(path.resolve(cwd, cleaned));
}

function getPreviewType(filePath: string): ArtifactItem["previewType"] | null {
  const ext = path.basename(filePath).toLowerCase().split(".").pop() || "";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (DOCUMENT_EXTS.has(ext)) return "document";
  return null;
}

function addExistingArtifact(
  items: Map<string, ArtifactItem>,
  candidate: string | null,
  source: ArtifactItem["source"],
  metadata: Partial<ArtifactItem> = {},
) {
  if (!candidate) return;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(candidate);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    collectDirectoryPreviewFiles(items, candidate, source, metadata);
    return;
  }
  if (!stat.isFile()) return;
  if (candidate.endsWith(".jsonl")) return;

  const itemPath = normalizeSlashes(candidate);
  if (itemPath.includes("/.pi-sessions/")) return;
  const previewType = getPreviewType(itemPath);
  if (!previewType) return;

  const parentRoot = normalizeSlashes(path.dirname(itemPath));
  allowFileRoot(parentRoot);

  const existing = items.get(itemPath);
  const item: ArtifactItem = {
    path: itemPath,
    name: path.basename(itemPath) || itemPath,
    kind: "file",
    source,
    previewType,
    size: stat.isFile() ? stat.size : 0,
    modified: stat.mtime.toISOString(),
    ...metadata,
  };
  items.set(itemPath, existing ? { ...existing, ...item } : item);
}

function collectDirectoryPreviewFiles(
  items: Map<string, ArtifactItem>,
  directory: string,
  source: ArtifactItem["source"],
  metadata: Partial<ArtifactItem>,
) {
  const root = normalizeSlashes(directory);
  allowFileRoot(root);
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (stack.length > 0 && items.size < MAX_DIRECTORY_ARTIFACTS) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (items.size >= MAX_DIRECTORY_ARTIFACTS) break;
      if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
      const full = normalizeSlashes(path.join(current.dir, entry.name));
      if (entry.isDirectory()) {
        if (current.depth < 2 && !IGNORED_DIRS.has(entry.name)) {
          stack.push({ dir: full, depth: current.depth + 1 });
        }
        continue;
      }
      if (!entry.isFile() || !getPreviewType(full)) continue;
      addExistingArtifact(items, full, source, metadata);
    }
  }
}

function collectPathsFromValue(
  value: unknown,
  cwd: string,
  items: Map<string, ArtifactItem>,
  source: ArtifactItem["source"],
  depth = 0,
) {
  if (depth > 5) return;
  if (Array.isArray(value)) {
    for (const item of value) collectPathsFromValue(item, cwd, items, source, depth + 1);
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (PATH_KEYS.has(key) || /(?:artifact|output|file).*path$/i.test(key)) {
      addExistingArtifact(items, resolveCandidatePath(child, cwd), source, {
        label: typeof value.id === "string" ? value.id : undefined,
      });
    }
    if (isRecord(child) || Array.isArray(child)) {
      collectPathsFromValue(child, cwd, items, source, depth + 1);
    }
  }
}

function collectToolArtifacts(entries: unknown[], cwd: string, items: Map<string, ArtifactItem>) {
  for (const entry of entries) {
    if (!isRecord(entry) || entry.type !== "message") continue;
    const message = entry.message;
    if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (!isRecord(block) || block.type !== "toolCall") continue;
      const toolName = typeof block.toolName === "string" ? block.toolName : "";
      if (!TOOL_NAMES.has(toolName)) continue;
      const input = isRecord(block.input) ? block.input : {};
      const rawPath = input.path ?? input.file_path;
      addExistingArtifact(items, resolveCandidatePath(rawPath, cwd), "tool", {
        toolName,
        label: toolName === "write" ? "Created by write" : "Changed by edit",
      });
    }
  }
}

function collectWorkflowArtifacts(sessionId: string, cwd: string, items: Map<string, ArtifactItem>) {
  const artifactsDir = path.join(WORKFLOW_WORKSPACE, sessionId, "artifacts");
  const registryPath = path.join(artifactsDir, "registry.json");
  if (!fs.existsSync(registryPath)) return;
  allowFileRoot(normalizeSlashes(artifactsDir));
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as { artifacts?: unknown[] };
    for (const artifact of registry.artifacts || []) {
      if (!isRecord(artifact)) continue;
      addExistingArtifact(items, resolveCandidatePath(artifact.path, cwd), "workflow", {
        label: typeof artifact.id === "string" ? artifact.id : undefined,
      });
    }
  } catch {
    // ignore malformed registry files
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sm = SessionManager.open(filePath);
    const header = sm.getHeader();
    const cwd = normalizeSlashes(header?.cwd || "");
    if (cwd) allowFileRoot(cwd);

    const items = new Map<string, ArtifactItem>();
    const branch = sm.getBranch() as unknown[];
    collectToolArtifacts(branch, cwd, items);
    for (const entry of branch) {
      if (isRecord(entry) && (entry.type === "custom" || entry.type === "custom_message")) {
        collectPathsFromValue(entry, cwd, items, "workflow");
      }
    }
    collectWorkflowArtifacts(id, cwd, items);

    const artifacts = [...items.values()].sort((a, b) => b.modified.localeCompare(a.modified));
    return NextResponse.json({ sessionId: id, cwd, artifacts });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
