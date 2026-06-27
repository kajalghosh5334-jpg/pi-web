import { readFile, stat } from "fs/promises";
import { createAgentSessionServices, getAgentDir, type SettingsManager } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";

export const dynamic = "force-dynamic";

const modelNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

async function readConfiguredModels(agentDir: string): Promise<Set<string>> {
  try {
    const raw = await readFile(`${agentDir}/models.json`, "utf-8");
    const json = JSON.parse(raw) as { providers?: Record<string, { models?: Array<{ id?: string }> }> };
    const configured = new Set<string>();
    for (const [provider, cfg] of Object.entries(json.providers || {})) {
      for (const model of cfg.models || []) {
        if (model.id) configured.add(`${provider}:${model.id}`);
      }
    }
    return configured;
  } catch {
    return new Set();
  }
}

function compareModelEntries(
  a: { id: string; name: string; provider: string },
  b: { id: string; name: string; provider: string }
): number {
  return modelNameCollator.compare(a.name || a.id, b.name || b.id)
    || modelNameCollator.compare(a.provider, b.provider)
    || modelNameCollator.compare(a.id, b.id);
}

export async function GET(req: Request) {
  const nameMap = new Map<string, string>();
  let modelList: { id: string; name: string; provider: string }[] = [];
  let defaultModel: { provider: string; modelId: string } | null = null;
  const thinkingLevels: Record<string, string[]> = {};
  const thinkingLevelMaps: Record<string, Record<string, string | null>> = {};
  const cwd = new URL(req.url).searchParams.get("cwd") || process.cwd();

  let cwdStat;
  try {
    cwdStat = await stat(cwd);
  } catch {
    return Response.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
  }
  if (!cwdStat.isDirectory()) {
    return Response.json({ error: `Not a directory: ${cwd}` }, { status: 400 });
  }

  try {
    const agentDir = getAgentDir();
    const services = await createAgentSessionServices({ cwd, agentDir });
    const registry = services.modelRegistry;
    const available = registry.getAvailable();
    const configured = await readConfiguredModels(agentDir);
    const filteredAvailable = available.filter((m: { id: string; provider: string }) => {
      if (configured.size === 0) return true;
      return configured.has(`${m.provider}:${m.id}`);
    });
    modelList = filteredAvailable.map((m: { id: string; name: string; provider: string }) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
    })).sort(compareModelEntries);
    for (const m of filteredAvailable) {
      const key = `${m.provider}:${m.id}`;
      nameMap.set(key, m.name);
      thinkingLevels[key] = getSupportedThinkingLevels(m);
      if (m.thinkingLevelMap) thinkingLevelMaps[key] = m.thinkingLevelMap;
    }

    const settings: SettingsManager = services.settingsManager;
    const provider = settings.getDefaultProvider();
    const modelId = settings.getDefaultModel();
    if (provider && modelId && filteredAvailable.some((m) => m.provider === provider && m.id === modelId)) {
      defaultModel = { provider, modelId };
    }
  } catch { /* return empty */ }

  return Response.json({ models: Object.fromEntries(nameMap), modelList, defaultModel, thinkingLevels, thinkingLevelMaps });
}
