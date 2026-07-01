import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

export const dynamic = "force-dynamic";

async function getModelsPath(): Promise<string> {
  const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
  return join(getAgentDir(), "models.json");
}

async function readModelsJson(): Promise<Record<string, unknown>> {
  const path = await getModelsPath();
  if (!existsSync(path)) return { providers: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return { providers: {} };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const AUTO_MODEL_CAPABILITY_IDS = new Set(["reasoning", "vision", "image-generation", "long-context"]);

function deriveModelCapabilities(model: Record<string, unknown>): string[] {
  const capabilities: string[] = [];
  if (model.reasoning === true) capabilities.push("reasoning");
  if (Array.isArray(model.input) && model.input.includes("image")) capabilities.push("vision");
  if (Array.isArray(model.output) && model.output.includes("image")) capabilities.push("image-generation");
  if (typeof model.contextWindow === "number" && model.contextWindow >= 128000) capabilities.push("long-context");
  return capabilities;
}

function normalizeModelCapabilities(data: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(data.providers)) return data;
  const providers = Object.fromEntries(Object.entries(data.providers).map(([providerName, provider]) => {
    if (!isRecord(provider) || !Array.isArray(provider.models)) return [providerName, provider];
    const models = provider.models.map((model) => {
      if (!isRecord(model)) return model;
      const manual = Array.isArray(model.capabilities)
        ? model.capabilities.filter((capability): capability is string => typeof capability === "string" && !AUTO_MODEL_CAPABILITY_IDS.has(capability))
        : [];
      const capabilities = Array.from(new Set([...manual, ...deriveModelCapabilities(model)]));
      return {
        ...model,
        ...(capabilities.length ? { capabilities } : { capabilities: undefined }),
      };
    });
    return [providerName, { ...provider, models }];
  }));
  return { ...data, providers };
}

function redactApiKeys(data: Record<string, unknown>): Record<string, unknown> {
  const providers = isRecord(data.providers) ? data.providers : {};
  const redactedProviders = Object.fromEntries(Object.entries(providers).map(([name, provider]) => {
    if (!isRecord(provider)) return [name, provider];
    const next = { ...provider };
    const apiKey = typeof provider.apiKey === "string" ? provider.apiKey.trim() : "";
    delete next.apiKey;
    next.apiKeyConfigured = Boolean(apiKey);
    return [name, next];
  }));
  return { ...data, providers: redactedProviders };
}

function preserveApiKeys(incoming: Record<string, unknown>, existing: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(incoming.providers)) return incoming;
  const existingProviders = isRecord(existing.providers) ? existing.providers : {};
  const providers = Object.fromEntries(Object.entries(incoming.providers).map(([name, provider]) => {
    if (!isRecord(provider)) return [name, provider];
    const next = { ...provider };
    const incomingApiKey = typeof provider.apiKey === "string" ? provider.apiKey.trim() : "";
    const existingProvider = existingProviders[name];
    const existingApiKey = isRecord(existingProvider) && typeof existingProvider.apiKey === "string"
      ? existingProvider.apiKey
      : "";
    delete next.apiKeyConfigured;
    if (incomingApiKey) {
      next.apiKey = provider.apiKey;
    } else if (existingApiKey) {
      next.apiKey = existingApiKey;
    } else {
      delete next.apiKey;
    }
    return [name, next];
  }));
  return { ...incoming, providers };
}

async function writeModelsJson(data: Record<string, unknown>): Promise<void> {
  const path = await getModelsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

export async function GET() {
  const raw = await readModelsJson();
  const normalized = normalizeModelCapabilities(raw);
  return NextResponse.json(redactApiKeys(normalized));
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    await writeModelsJson(normalizeModelCapabilities(preserveApiKeys(body, await readModelsJson())));
    // Model registry refreshes on each /api/models request (no local cache to invalidate)
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
