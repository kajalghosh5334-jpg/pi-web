import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

interface CatalogModel {
  id: string;
  name?: string;
  contextWindow?: number;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readSavedProviderApiKey(providerName: string): Promise<string> {
  if (!providerName) return "";
  const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
  const path = join(getAgentDir(), "models.json");
  if (!existsSync(path)) return "";
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as { providers?: unknown };
    const providers = isRecord(data.providers) ? data.providers : {};
    const provider = providers[providerName];
    return isRecord(provider) && typeof provider.apiKey === "string" ? provider.apiKey : "";
  } catch {
    return "";
  }
}

function resolveApiKey(apiKey?: string): string {
  const value = apiKey?.trim();
  if (!value) return "";
  if (value.startsWith("!")) {
    return execSync(value.slice(1), { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  }
  if (/^[A-Z0-9_]+$/.test(value)) return process.env[value] ?? "";
  return value;
}

function normalizeHeaderValues(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  return Object.fromEntries(Object.entries(headers as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim())));
}

function authHeaders(apiKey?: string, extraHeaders?: unknown, authHeader?: unknown): Record<string, string> {
  const headers = normalizeHeaderValues(extraHeaders);
  const resolved = resolveApiKey(apiKey);
  const shouldSetAuthHeader = authHeader !== false;
  if (resolved && shouldSetAuthHeader && !headers.Authorization && !headers.authorization) headers.Authorization = `Bearer ${resolved}`;
  return headers;
}

function normalizeModels(payload: unknown): CatalogModel[] {
  const root = payload as { data?: unknown; models?: unknown };
  const items = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.models)
      ? root.models
      : Array.isArray(payload)
        ? payload
        : [];

  const models: CatalogModel[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      models.push({ id: item });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string"
      ? record.id
      : typeof record.name === "string"
        ? record.name
        : "";
    if (!id) continue;
    const contextWindow = typeof record.context_length === "number"
      ? record.context_length
      : typeof record.contextWindow === "number"
        ? record.contextWindow
        : undefined;
    models.push({
      id,
      name: typeof record.name === "string" ? record.name : id,
      contextWindow,
    });
  }
  return models;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { providerName?: unknown; baseUrl?: unknown; apiKey?: unknown; headers?: unknown; authHeader?: unknown };
    const providerName = typeof body.providerName === "string" ? body.providerName.trim() : "";
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    const apiKey = typeof body.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim()
      : await readSavedProviderApiKey(providerName);
    if (!baseUrl) return NextResponse.json({ ok: false, error: "baseUrl is required" }, { status: 400 });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
        headers: authHeaders(apiKey, body.headers, body.authHeader),
        cache: "no-store",
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: text || `HTTP ${res.status}` }, { status: res.status });
      }
      const data = JSON.parse(text);
      return NextResponse.json({ ok: true, models: normalizeModels(data).slice(0, 2000) });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
