import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ApiFormat = "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";

interface Candidate {
  providerName: string;
  providerLabel: string;
  baseUrl: string;
  api: ApiFormat;
  modelId?: string;
  confidence: number;
  evidence: string[];
  sourceUrl: string;
  localConfig?: Record<string, unknown>;
  defaultModels?: Array<Record<string, unknown>>;
}

const FREELLM_README = "https://raw.githubusercontent.com/open-free-llm-api/awesome-freellm-apis/main/README.md";
const FREELLM_CONFIG = "https://freellm.net/config/";
const STEPFUN_DOCS = "https://platform.stepfun.com/docs/llm/text";
const TENVIP_DOCS = "https://10vip.vip/docs/";

const STEPFUN_LOCAL_CONFIG = {
  name: "StepFun Step Plan",
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    maxTokensField: "max_tokens",
    supportsStrictMode: false,
    supportsLongCacheRetention: false,
  },
};

const STEPFUN_DEFAULT_MODELS = [
  {
    id: "step-3.7-flash",
    name: "step-3.7-flash",
    reasoning: true,
    capabilities: ["reasoning", "coding", "vision", "long-context"],
    input: ["text", "image"],
    contextWindow: 128000,
    maxTokens: 16384,
    thinkingLevelMap: { off: null, low: "low", medium: "medium", high: "high", xhigh: null },
    routingNotes: "StepFun 官方推荐验证模型，适合 agent、代码和多模态推理。",
  },
  {
    id: "step-3.5-flash-2603",
    name: "step-3.5-flash-2603",
    reasoning: true,
    capabilities: ["reasoning", "coding", "summarization", "classification"],
    contextWindow: 128000,
    maxTokens: 16384,
    thinkingLevelMap: { off: null, low: "low", medium: "medium", high: "high", xhigh: null },
    routingNotes: "StepFun 高频 Agent 场景优化模型，适合作为低成本 worker。",
  },
  {
    id: "step-3.5-flash",
    name: "step-3.5-flash",
    reasoning: true,
    capabilities: ["reasoning", "coding", "summarization", "classification"],
    contextWindow: 128000,
    maxTokens: 16384,
    thinkingLevelMap: { off: null, low: "low", medium: "medium", high: "high", xhigh: null },
    routingNotes: "StepFun 高速推理模型，适合代码和通用 Agent 子任务。",
  },
  {
    id: "step-router-v1",
    name: "step-router-v1",
    reasoning: true,
    capabilities: ["reasoning", "coding"],
    contextWindow: 128000,
    maxTokens: 8192,
    thinkingLevelMap: { off: null, low: "low", medium: "medium", high: "high", xhigh: null },
    routingNotes: "StepFun 智能路由模型，会在不同推理引擎间自动切换。",
  },
];

const PROVIDER_ALIASES: Record<string, { label: string; providerName: string; baseUrl: string; api: ApiFormat; aliases: string[]; localConfig?: Record<string, unknown>; defaultModels?: Array<Record<string, unknown>>; sourceUrl?: string }> = {
  openrouter: {
    label: "OpenRouter",
    providerName: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    api: "openai-completions",
    aliases: ["openrouter", "open router"],
  },
  "nvidia-nim": {
    label: "NVIDIA NIM",
    providerName: "nvidia-nim",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    api: "openai-completions",
    aliases: ["nvidia", "nvidia nim", "nim", "integrate.api.nvidia.com"],
  },
  groq: {
    label: "Groq",
    providerName: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    api: "openai-completions",
    aliases: ["groq", "api.groq.com"],
  },
  "google-gemini": {
    label: "Google Gemini",
    providerName: "google-gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    api: "google-generative-ai",
    aliases: ["gemini", "google ai studio", "aistudio", "generativelanguage.googleapis.com"],
  },
  "mistral-ai": {
    label: "Mistral AI",
    providerName: "mistral-ai",
    baseUrl: "https://api.mistral.ai/v1",
    api: "openai-completions",
    aliases: ["mistral", "mistral ai"],
  },
  cohere: {
    label: "Cohere",
    providerName: "cohere",
    baseUrl: "https://api.cohere.com/v2",
    api: "openai-completions",
    aliases: ["cohere"],
  },
  cerebras: {
    label: "Cerebras",
    providerName: "cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    api: "openai-completions",
    aliases: ["cerebras"],
  },
  "siliconflow": {
    label: "SiliconFlow",
    providerName: "siliconflow",
    baseUrl: "https://api.siliconflow.cn/v1",
    api: "openai-completions",
    aliases: ["siliconflow", "silicon flow", "硅基流动"],
  },
  "10vip": {
    label: "10VIP",
    providerName: "10vip",
    baseUrl: "https://10vip.vip/v1",
    api: "openai-responses",
    aliases: ["10vip", "10 vip", "10vip.vip", "砖石api", "钻石api"],
    sourceUrl: TENVIP_DOCS,
  },
  stepfun: {
    label: "StepFun Step Plan",
    providerName: "stepfun",
    baseUrl: "https://api.stepfun.com/step_plan/v1",
    api: "openai-completions",
    aliases: ["stepfun", "step fun", "step", "step plan", "阶跃星辰", "阶跃"],
    localConfig: STEPFUN_LOCAL_CONFIG,
    defaultModels: STEPFUN_DEFAULT_MODELS,
    sourceUrl: STEPFUN_DOCS,
  },
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5./:-]+/g, " ").replace(/\s+/g, " ").trim();
}

function compactModelId(value: string): string {
  return normalizeText(value).replace(/[:/_.-]+/g, "-").replace(/\s+/g, "-");
}

function markdownCells(line: string): string[] {
  if (!line.trim().startsWith("|")) return [];
  return line.split("|").slice(1, -1).map((cell) => cell.replace(/<[^>]+>/g, " ").replace(/`/g, "").trim());
}

function freellmProviderMatches(providerKey: string, line: string, modelUrlProvider?: string): boolean {
  if (modelUrlProvider === providerKey) return true;
  const provider = PROVIDER_ALIASES[providerKey];
  const firstCell = normalizeText(markdownCells(line)[0] ?? "");
  if (!provider || !firstCell) return false;
  return provider.aliases.some((alias) => firstCell === normalizeText(alias)) || firstCell === normalizeText(provider.label);
}

function uniqueCandidates(candidates: Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${candidate.providerName}|${candidate.baseUrl}|${candidate.modelId ?? ""}`;
    const previous = best.get(key);
    if (!previous || candidate.confidence > previous.confidence) best.set(key, candidate);
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

function providerCandidate(providerKey: string, confidence: number, evidence: string[], modelId?: string): Candidate | null {
  const provider = PROVIDER_ALIASES[providerKey];
  if (!provider) return null;
  return {
    providerName: provider.providerName,
    providerLabel: provider.label,
    baseUrl: provider.baseUrl,
    api: provider.api,
    modelId,
    confidence,
    evidence,
    sourceUrl: provider.sourceUrl ?? FREELLM_README,
    localConfig: provider.localConfig,
    defaultModels: provider.defaultModels,
  };
}

function candidatesFromKnownProviders(query: string): Candidate[] {
  const normalized = normalizeText(query);
  const candidates: Candidate[] = [];
  for (const [key, provider] of Object.entries(PROVIDER_ALIASES)) {
    const aliasHit = provider.aliases.some((alias) => normalized.includes(normalizeText(alias)));
    if (!aliasHit) continue;
    const candidate = providerCandidate(key, 0.82, [`识别到 provider 线索：${provider.label}`]);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "pi-api-guide-discovery" },
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function candidatesFromFreellmReadme(readme: string, query: string): Candidate[] {
  if (!readme) return [];
  const normalizedQuery = normalizeText(query);
  if (["freellm", "free llm", "freellm.net"].includes(normalizedQuery)) return [];
  if (Object.values(PROVIDER_ALIASES).some((provider) => provider.aliases.some((alias) => normalizedQuery === normalizeText(alias)))) return [];
  const compactQuery = compactModelId(query);
  const lines = readme.split(/\r?\n/);
  const candidates: Candidate[] = [];

  for (const line of lines) {
    const normalizedLine = normalizeText(line);
    const compactLine = compactModelId(line);
    const modelUrlMatch = line.match(/freellm\.net\/models\/([^/)]+)\/([^/)"\s]+)/i);
    const modelFromUrl = modelUrlMatch?.[2]?.replace(/-/g, "/");
    const queryHit = normalizedQuery.length >= 3 && normalizedLine.includes(normalizedQuery);
    const compactHit = compactQuery.length >= 3 && compactLine.includes(compactQuery);
    const urlModelHit = Boolean(modelFromUrl && compactQuery.length >= 3 && compactModelId(modelFromUrl).includes(compactQuery));
    if (!queryHit && !compactHit && !urlModelHit) continue;

    for (const providerKey of Object.keys(PROVIDER_ALIASES)) {
      const providerHit = freellmProviderMatches(providerKey, line, modelUrlMatch?.[1]);
      if (!providerHit) continue;
      const tickedValue = line.match(/`([^`]+)`/)?.[1];
      const modelId = tickedValue && !/^https?:\/\//i.test(tickedValue) ? tickedValue : modelFromUrl;
      const exactModelHit = Boolean(modelId && compactModelId(modelId).includes(compactQuery));
      const confidence = Math.min(0.96, 0.72 + (exactModelHit ? 0.16 : 0) + (queryHit || compactHit ? 0.08 : 0));
      const candidate = providerCandidate(providerKey, confidence, [`FreeLLM 公开索引匹配：${line.replace(/\s+/g, " ").slice(0, 220)}`], modelId);
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
}

function candidatesFromConfigPage(html: string, query: string): Candidate[] {
  if (!html) return [];
  const normalized = normalizeText(query);
  if (!normalized || normalized === "freellm" || normalized === "free llm") return [];
  const candidates: Candidate[] = [];
  for (const [providerKey, provider] of Object.entries(PROVIDER_ALIASES)) {
    const providerHit = provider.aliases.some((alias) => normalized.includes(normalizeText(alias)));
    const urlHit = html.includes(provider.baseUrl);
    if (!providerHit || !urlHit) continue;
    const candidate = providerCandidate(providerKey, 0.78, [`freellm.net/config 提供 ${provider.label} Base URL：${provider.baseUrl}`]);
    if (candidate) candidates.push({ ...candidate, sourceUrl: FREELLM_CONFIG });
  }
  return candidates;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { query?: unknown; providerHint?: unknown; modelHint?: unknown };
    const rawParts = [body.query, body.providerHint, body.modelHint]
      .filter((part): part is string => typeof part === "string")
      .map((part) => part.trim())
      .filter(Boolean);
    const query = rawParts.join(" ").trim();
    if (!query) {
      return NextResponse.json({ ok: false, error: "model or provider hint is required", candidates: [] }, { status: 400 });
    }

    const direct = candidatesFromKnownProviders(query);
    const [readme, configHtml] = await Promise.all([fetchText(FREELLM_README), fetchText(FREELLM_CONFIG)]);
    const freellm = candidatesFromFreellmReadme(readme, query);
    const config = candidatesFromConfigPage(configHtml, query);
    const candidates = uniqueCandidates([...freellm, ...direct, ...config]);

    const needsMoreInfo = candidates.length === 0 || (normalizeText(query).replace(/\s+/g, "") === "freellm");
    return NextResponse.json({
      ok: true,
      candidates,
      needsMoreInfo,
      sources: [FREELLM_README, FREELLM_CONFIG],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), candidates: [] }, { status: 500 });
  }
}
