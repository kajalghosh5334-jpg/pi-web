import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

interface ModelInput {
  id: string;
  provider: string;
  name?: string;
}

interface ModelEntry {
  id?: string;
  baseUrl?: string;
  api?: string;
  compat?: Record<string, unknown>;
}

interface ProviderEntry {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  authHeader?: boolean;
  compat?: Record<string, unknown>;
  models?: ModelEntry[];
}

interface ModelsJson {
  providers?: Record<string, ProviderEntry>;
}

type HealthStatus = "available" | "slow" | "unavailable";

const SLOW_THRESHOLD_MS = 2000;
const CATALOG_TIMEOUT_MS = 1600;
const MAX_MODELS = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function readModelsConfig(): Promise<ModelsJson> {
  const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
  const path = join(getAgentDir(), "models.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ModelsJson;
  } catch {
    return {};
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

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!isRecord(headers)) return {};
  return Object.fromEntries(Object.entries(headers)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0));
}

function authHeaders(provider: ProviderEntry, api: string): Record<string, string> {
  const headers = normalizeHeaders(provider.headers);
  const key = resolveApiKey(provider.apiKey);
  if (!key) return headers;

  const hasAuth = Object.keys(headers).some((name) => name.toLowerCase() === "authorization");
  const hasApiKey = Object.keys(headers).some((name) => ["x-api-key", "x-goog-api-key"].includes(name.toLowerCase()));
  if (api === "anthropic-messages") {
    if (!hasApiKey) headers["x-api-key"] = key;
    if (!headers["anthropic-version"] && !headers["Anthropic-Version"]) headers["anthropic-version"] = "2023-06-01";
    return headers;
  }
  if (api === "google-generative-ai") {
    if (!hasApiKey) headers["x-goog-api-key"] = key;
    return headers;
  }
  if (provider.authHeader !== false && !hasAuth) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function contentHeaders(provider: ProviderEntry, api: string): Record<string, string> {
  return {
    ...authHeaders(provider, api),
    "Content-Type": "application/json",
  };
}

function errorText(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<{ res?: Response; text?: string; timedOut: boolean; durationMs: number; error?: string }> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    const text = await res.text().catch(() => "");
    return { res, text, timedOut: false, durationMs: Date.now() - startedAt };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return { timedOut, durationMs: Date.now() - startedAt, error: timedOut ? undefined : error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCatalogIds(payload: unknown): Set<string> {
  const root = payload as { data?: unknown; models?: unknown };
  const items = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.models)
      ? root.models
      : Array.isArray(payload)
        ? payload
        : [];
  const ids = new Set<string>();
  for (const item of items) {
    if (typeof item === "string") {
      ids.add(item);
      continue;
    }
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string"
      ? item.id
      : typeof item.name === "string"
        ? item.name
        : "";
    if (id) ids.add(id);
  }
  return ids;
}

async function fetchProviderCatalog(provider: ProviderEntry, api: string): Promise<{ ids?: Set<string>; durationMs: number; error?: string }> {
  if (!provider.baseUrl || api === "google-generative-ai") return { durationMs: 0, error: "catalog not supported" };
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const result = await fetchWithTimeout(`${baseUrl}/models`, { headers: authHeaders(provider, api) }, CATALOG_TIMEOUT_MS);
  if (result.timedOut) return { durationMs: result.durationMs, error: `catalog exceeded ${CATALOG_TIMEOUT_MS}ms` };
  if (!result.res) return { durationMs: result.durationMs, error: result.error ?? "catalog request failed" };
  if (!result.res.ok) return { durationMs: result.durationMs, error: errorText(result.text ?? "", `catalog HTTP ${result.res.status}`) };
  try {
    return { ids: normalizeCatalogIds(JSON.parse(result.text ?? "{}")), durationMs: result.durationMs };
  } catch {
    return { durationMs: result.durationMs, error: "catalog returned invalid JSON" };
  }
}

function effectiveModelConfig(provider: ProviderEntry, modelId: string): { model?: ModelEntry; api: string; baseUrl: string; compat: Record<string, unknown> } {
  const model = provider.models?.find((item) => item.id === modelId);
  const api = model?.api || provider.api || "openai-completions";
  const baseUrl = normalizeBaseUrl(model?.baseUrl || provider.baseUrl || "");
  return { model, api, baseUrl, compat: { ...(provider.compat ?? {}), ...(model?.compat ?? {}) } };
}

function generationRequest(provider: ProviderEntry, modelId: string): { url: string; init: RequestInit; api: string; error?: string } {
  const { api, baseUrl, compat } = effectiveModelConfig(provider, modelId);
  if (!baseUrl) return { url: "", init: {}, api, error: "missing baseUrl" };
  if (api === "openai-responses") {
    return {
      url: `${baseUrl}/responses`,
      api,
      init: {
        method: "POST",
        headers: contentHeaders(provider, api),
        body: JSON.stringify({
          model: modelId,
          input: "Reply exactly OK.",
          stream: false,
          max_output_tokens: 8,
        }),
      },
    };
  }
  if (api === "openai-completions") {
    const maxTokensField = typeof compat.maxTokensField === "string" ? compat.maxTokensField : "max_tokens";
    return {
      url: `${baseUrl}/chat/completions`,
      api,
      init: {
        method: "POST",
        headers: contentHeaders(provider, api),
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Reply exactly OK." }],
          stream: false,
          [maxTokensField]: 8,
        }),
      },
    };
  }
  if (api === "anthropic-messages") {
    return {
      url: `${baseUrl}/messages`,
      api,
      init: {
        method: "POST",
        headers: contentHeaders(provider, api),
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Reply exactly OK." }],
          max_tokens: 8,
        }),
      },
    };
  }
  return { url: "", init: {}, api, error: `unsupported API: ${api}` };
}

async function checkModel(providerName: string, modelId: string, provider: ProviderEntry, catalog?: { ids?: Set<string>; durationMs: number; error?: string }) {
  if (catalog?.ids?.has(modelId)) {
    return { id: modelId, provider: providerName, ok: true, status: "available" as const, durationMs: catalog.durationMs, source: "catalog" };
  }

  const request = generationRequest(provider, modelId);
  if (request.error) {
    return { id: modelId, provider: providerName, ok: false, status: "unavailable" as const, error: request.error, durationMs: 0, source: "config" };
  }

  const result = await fetchWithTimeout(request.url, request.init, SLOW_THRESHOLD_MS);
  if (result.timedOut) {
    return {
      id: modelId,
      provider: providerName,
      ok: false,
      status: "slow" as const,
      error: `generation exceeded ${SLOW_THRESHOLD_MS}ms`,
      durationMs: result.durationMs,
      source: "generation",
    };
  }
  if (!result.res) {
    return {
      id: modelId,
      provider: providerName,
      ok: false,
      status: "unavailable" as const,
      error: result.error ?? catalog?.error ?? "request failed",
      durationMs: result.durationMs,
      source: "generation",
    };
  }
  if (result.res.ok) {
    return { id: modelId, provider: providerName, ok: true, status: "available" as const, durationMs: result.durationMs, source: "generation" };
  }
  return {
    id: modelId,
    provider: providerName,
    ok: false,
    status: "unavailable" as const,
    error: errorText(result.text ?? "", `HTTP ${result.res.status}`),
    durationMs: result.durationMs,
    source: "generation",
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const models = Array.isArray(body.models) ? body.models.slice(0, MAX_MODELS) as ModelInput[] : [];
  if (!models.length) return Response.json({ results: [] });

  const config = await readModelsConfig();
  const providers = isRecord(config.providers) ? config.providers : {};
  const grouped = new Map<string, ModelInput[]>();
  for (const model of models) {
    if (!model.provider || !model.id) continue;
    grouped.set(model.provider, [...(grouped.get(model.provider) ?? []), model]);
  }

  const results: Array<{
    id: string;
    provider: string;
    ok: boolean;
    status: HealthStatus;
    error?: string;
    durationMs: number;
    source?: string;
  }> = [];

  await Promise.all([...grouped.entries()].map(async ([providerName, providerModels]) => {
    const provider = providers[providerName];
    if (!provider) {
      results.push(...providerModels.map((model) => ({
        id: model.id,
        provider: providerName,
        ok: false,
        status: "unavailable" as const,
        error: "provider is not configured",
        durationMs: 0,
        source: "config",
      })));
      return;
    }
    const providerApi = provider.api || "openai-completions";
    const catalog = await fetchProviderCatalog(provider, providerApi);
    const checked = await Promise.all(providerModels.map((model) => checkModel(providerName, model.id, provider, catalog)));
    results.push(...checked);
  }));

  return Response.json({ results, checkedAt: Date.now() });
}
