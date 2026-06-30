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
  return NextResponse.json(redactApiKeys(await readModelsJson()));
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    await writeModelsJson(preserveApiKeys(body, await readModelsJson()));
    // Model registry refreshes on each /api/models request (no local cache to invalidate)
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
