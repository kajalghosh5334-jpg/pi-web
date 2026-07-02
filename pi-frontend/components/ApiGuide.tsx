"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ApiFormat = "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";
type ModelRole = "weak" | "strong";

interface ModelEntry {
  id: string;
  name?: string;
  api?: ApiFormat;
  role?: ModelRole;
  capabilities?: string[];
  routingNotes?: string;
  profileHints?: string[];
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: string[];
  output?: string[];
  contextWindow?: number;
  maxTokens?: number;
  compat?: Record<string, unknown>;
}

interface ProviderEntry {
  name?: string;
  baseUrl?: string;
  api?: ApiFormat;
  apiKey?: string;
  apiKeyConfigured?: boolean;
  headers?: Record<string, string>;
  authHeader?: boolean;
  compat?: Record<string, unknown>;
  modelOverrides?: Record<string, unknown>;
  models?: ModelEntry[];
}

interface ModelsJson {
  providers?: Record<string, ProviderEntry>;
  modelSetup?: {
    guideModel?: string;
    testSuiteVersion?: string;
    capabilityProfiles?: Record<string, unknown>;
  };
}

interface CatalogModel {
  id: string;
  name?: string;
  contextWindow?: number;
}

type Message = {
  id: string;
  role: "guide" | "user";
  text: string;
};

type DiscoveryCandidate = {
  providerName: string;
  providerLabel: string;
  baseUrl: string;
  api: ApiFormat;
  modelId?: string;
  confidence: number;
  evidence: string[];
  sourceUrl: string;
  localConfig?: Partial<ProviderEntry>;
  defaultModels?: ModelEntry[];
};

type Preset = {
  id: string;
  name: string;
  baseUrl: string;
  api: ApiFormat;
  aliases: string[];
  localConfig?: Partial<ProviderEntry>;
  defaultModels?: ModelEntry[];
};

type DirectorySource = {
  id: string;
  name: string;
  aliases: string[];
};

const PRESETS: Preset[] = [
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", api: "openai-completions", aliases: ["openrouter", "open router"] },
  { id: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", api: "openai-completions", aliases: ["siliconflow", "silicon flow", "硅基流动"] },
  { id: "aihubmix", name: "AiHubMix", baseUrl: "https://aihubmix.com/v1", api: "openai-completions", aliases: ["aihubmix", "ai hub mix"] },
  { id: "10vip", name: "10VIP", baseUrl: "https://10vip.vip/v1", api: "openai-responses", aliases: ["10vip", "10 vip", "10vip.vip", "砖石api", "钻石api"] },
  {
    id: "stepfun",
    name: "StepFun Step Plan",
    baseUrl: "https://api.stepfun.com/step_plan/v1",
    api: "openai-completions",
    aliases: ["stepfun", "step fun", "step", "阶跃星辰", "阶跃", "step plan"],
    localConfig: {
      name: "StepFun Step Plan",
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        maxTokensField: "max_tokens",
        supportsStrictMode: false,
        supportsLongCacheRetention: false,
      },
    },
    defaultModels: [
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
    ],
  },
  { id: "together", name: "Together", baseUrl: "https://api.together.xyz/v1", api: "openai-completions", aliases: ["together", "together ai"] },
  { id: "custom-openai-compatible", name: "OpenAI-compatible", baseUrl: "", api: "openai-completions", aliases: ["openai compatible", "openai-compatible", "自定义"] },
];

const DIRECTORY_SOURCES: DirectorySource[] = [
  { id: "freellm", name: "freellm.net", aliases: ["freellm", "free llm", "freellm.net"] },
];

const CAPABILITY_TEST_SUITE_VERSION = "model-capability-v1";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function modelKey(providerName: string, modelId: string): string {
  return `${providerName}/${modelId}`;
}

function detectPreset(text: string): Preset | null {
  const lower = text.toLowerCase();
  return PRESETS.find((preset) => preset.aliases.some((alias) => lower.includes(alias))) ?? null;
}

function detectDirectorySource(text: string): DirectorySource | null {
  const lower = text.toLowerCase();
  return DIRECTORY_SOURCES.find((source) => source.aliases.some((alias) => lower.includes(alias))) ?? null;
}

function extractUrl(text: string): string {
  return text.match(/https?:\/\/[^\s"'<>]+/)?.[0]?.replace(/[),.，。]+$/, "") ?? "";
}

function extractApiKey(text: string): string {
  const tokens = text.match(/[A-Za-z0-9][A-Za-z0-9._-]{23,}/g) ?? [];
  const key = tokens.find((token) => /^(?:sk-|sk_|key-|api-|AIza|or-)/i.test(token))
    ?? tokens.find((token) => token.length >= 32);
  return key ?? "";
}

function removeApiKey(text: string, apiKeyValue: string): string {
  return apiKeyValue ? text.replace(apiKeyValue, " ").replace(/\s+/g, " ").trim() : text.trim();
}

function looksLikeApiKey(text: string): boolean {
  return Boolean(extractApiKey(text.trim()));
}

function shouldAutoUseCandidate(candidates: DiscoveryCandidate[]): boolean {
  const [first, second] = candidates;
  if (!first) return false;
  if (first.confidence >= 0.9 && (!second || first.confidence - second.confidence >= 0.08)) return true;
  return first.confidence >= 0.82 && (!second || first.confidence - second.confidence >= 0.1);
}

function isReasoningModel(id: string): boolean {
  return /reason|thinking|r1|qwq|o1|o3|o4|deepseek-reasoner|opus|glm|qwen|step-3|step-router/i.test(id);
}

function isUnsupportedChatCatalogModel(model: CatalogModel): boolean {
  const lower = `${model.id} ${model.name ?? ""}`.toLowerCase();
  return /audio|asr|tts|speech|realtime|embedding|rerank|image-edit|image_edit/.test(lower);
}

function isStrongModelName(id: string): boolean {
  return /\b(?:gpt-|chatgpt|o1|o3|o4|claude|opus|sonnet)\b/i.test(id) || /^(?:gpt|o[134])[-\d]/i.test(id);
}

function classifyModel(model: CatalogModel): ModelEntry {
  const id = model.id;
  const lower = `${model.id} ${model.name ?? ""}`.toLowerCase();
  const capabilities = new Set<string>();
  const routingNotes: string[] = [];
  let role: ModelRole | undefined;
  let reasoning = false;
  let input: string[] | undefined;
  let output: string[] | undefined;

  if (/mini|flash|lite|fast|haiku|small|turbo|cheap/.test(lower)) {
    capabilities.add("classification");
    capabilities.add("summarization");
    routingNotes.push("默认作为低成本 worker，用于分类、摘要、改写、轻量任务。");
  }

  if (isStrongModelName(lower)) {
    role = "strong";
    routingNotes.push("检测到 GPT/Claude 系列，默认作为 strong guide 候选。");
  }

  if (isReasoningModel(lower)) {
    reasoning = true;
    capabilities.add("reasoning");
    routingNotes.push("检测到 reasoning/thinking 命名特征，用于复杂推理和规划。");
  }

  if (/code|coder|coding|kimi|qwen.*coder|deepseek.*coder|claude|sonnet/.test(lower)) {
    capabilities.add("coding");
    routingNotes.push("命名显示代码能力，可参与实现、修复、审查类任务。");
  }

  if (/vision|vl|gpt-4o|gemini|qwen.*vl|image input/.test(lower)) {
    capabilities.add("vision");
    input = ["text", "image"];
    routingNotes.push("检测到视觉/图像输入特征。");
  }

  if (/flux|sdxl|dall|imagen|midjourney|image generation|绘图|生图/.test(lower)) {
    capabilities.add("image-generation");
    output = ["image"];
    routingNotes.push("检测到生图模型特征，只进入 image-generation 路由。");
  }

  if (/write|writer|文案|写作|copy/.test(lower)) capabilities.add("writing");
  if (/summary|summar|摘要|总结/.test(lower)) capabilities.add("summarization");
  if (/classif|router|route|分类|路由/.test(lower)) capabilities.add("classification");
  if ((model.contextWindow ?? 0) >= 128000 || /long|128k|200k|1m/.test(lower)) capabilities.add("long-context");

  return {
    id,
    name: model.name && model.name !== id ? model.name : undefined,
    contextWindow: model.contextWindow,
    role,
    reasoning: reasoning || undefined,
    capabilities: capabilities.size ? [...capabilities] : undefined,
    input,
    output,
    routingNotes: routingNotes.join(" "),
  };
}

function summarizeConfig(providerName: string, models: ModelEntry[]): string {
  const strong = models.filter((model) => model.role === "strong").slice(0, 4);
  const worker = models.filter((model) => model.role !== "strong").slice(0, 4);
  const reasoning = models.filter((model) => model.reasoning || model.capabilities?.includes("reasoning")).slice(0, 4);
  const image = models.filter((model) => model.capabilities?.includes("image-generation")).slice(0, 3);
  const vision = models.filter((model) => model.capabilities?.includes("vision")).slice(0, 3);

  return [
    `已完成 ${providerName} 的模型分类草案。`,
    "",
    `Strong guide: ${strong.map((model) => model.id).join(", ") || "未识别"}`,
    `Worker pool: ${worker.map((model) => model.id).join(", ") || "未识别"}`,
    `Reasoning: ${reasoning.map((model) => model.id).join(", ") || "未识别"}`,
    `Vision: ${vision.map((model) => model.id).join(", ") || "未识别"}`,
    `Image Gen: ${image.map((model) => model.id).join(", ") || "未识别"}`,
    "",
    "我只写入当前项目支持的字段：strong(S)、reasoning、capabilities、input/output、routingNotes；未标 S 的模型默认进入 worker pool。",
  ].join("\n");
}

function buildPendingProfile(key: string): Record<string, unknown> {
  return {
    modelKey: key,
    status: "pending_judgement",
    testSuiteVersion: CAPABILITY_TEST_SUITE_VERSION,
    updatedAt: new Date().toISOString(),
    summary: "API Guide 已按公开命名规则生成初始分类，等待 Guide AI 后续补充 profile evidence。",
    suggestedRoles: [],
    dimensions: {},
  };
}

interface ApiGuideProps {
  panel?: boolean;
  onClose?: () => void;
  onOpenModels?: () => void;
  onApplied?: () => void;
}

export function ApiGuide({ panel = false, onClose, onOpenModels, onApplied }: ApiGuideProps = {}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: "guide",
      text: "你要接入哪个 API、聚合站或模型平台？可以直接说 OpenRouter、SiliconFlow，也可以贴官网/API 文档/Base URL。",
    },
  ]);
  const [input, setInput] = useState("");
  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [api, setApi] = useState<ApiFormat>("openai-completions");
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryCandidates, setDiscoveryCandidates] = useState<DiscoveryCandidate[]>([]);
  const [discoveredModelHint, setDiscoveredModelHint] = useState("");
  const [providerLocalConfig, setProviderLocalConfig] = useState<Partial<ProviderEntry>>({});
  const [fallbackModels, setFallbackModels] = useState<ModelEntry[]>([]);
  const [saved, setSaved] = useState(false);
  const [autoAnalyzeKey, setAutoAnalyzeKey] = useState("");
  const canAnalyze = providerName.trim() && baseUrl.trim() && apiKey.trim() && !busy && !discoveryBusy;

  const providerSummary = useMemo(() => {
    return [
      providerName ? `Provider: ${providerName}` : null,
      baseUrl ? `Base URL: ${baseUrl}` : null,
      apiKey ? "API Key: provided" : null,
      `API format: ${api}`,
      Object.keys(providerLocalConfig).length ? "local config: yes" : null,
    ].filter(Boolean).join(" · ");
  }, [api, apiKey, baseUrl, providerLocalConfig, providerName]);

  const push = useCallback((role: Message["role"], text: string) => {
    setMessages((prev) => [...prev, { id: uid(), role, text }]);
  }, []);

  const applyCandidate = useCallback((candidate: DiscoveryCandidate, hasAnyApiKey = Boolean(apiKey)) => {
    setProviderName(candidate.providerName);
    setBaseUrl(candidate.baseUrl);
    setApi(candidate.api);
    setProviderLocalConfig(candidate.localConfig ?? {});
    setFallbackModels(candidate.defaultModels ?? []);
    setDiscoveredModelHint(candidate.modelId ?? "");
    setDiscoveryCandidates([]);
    push("guide", [
      `我采用 ${candidate.providerLabel} 的配置：${candidate.baseUrl}`,
      candidate.modelId ? `匹配到模型线索：${candidate.modelId}` : null,
      candidate.localConfig ? "这个 Provider 需要写入本地 provider 配置字段，我会在保存时一起写入 models.json。" : null,
      hasAnyApiKey ? "API Key 已收到，我会读取 /models 并生成分类。" : "接下来请提供 API Key，我会读取 /models 并生成分类。",
    ].filter(Boolean).join("\n"));
  }, [apiKey, push]);

  const discoverConfig = useCallback(async (query: string, hasAnyApiKey = Boolean(apiKey)) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      push("guide", "收到 API Key。但我还缺少模型名、平台名、官网链接或 API 文档链接，才能搜索真实 Base URL。");
      return;
    }

    setDiscoveryBusy(true);
    setDiscoveryCandidates([]);
    push("guide", "我会先搜索公开配置资料，判断它对应的 Provider、Base URL 和 API 格式。这个步骤不会把 API Key 发出去。");
    try {
      const res = await fetch("/api/models-config/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cleanQuery }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; candidates?: DiscoveryCandidate[]; needsMoreInfo?: boolean; sources?: string[] };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const candidates = data.candidates ?? [];
      if (!candidates.length || data.needsMoreInfo) {
        push("guide", "我没有找到足够确定的 Provider/Base URL。请再给我具体模型名、聚合站名称、模型页面链接，或官方 API 配置说明链接。");
        return;
      }
      if (shouldAutoUseCandidate(candidates)) {
        applyCandidate(candidates[0], hasAnyApiKey);
        return;
      }
      setDiscoveryCandidates(candidates);
      push("guide", `我找到了 ${candidates.length} 个可能配置。请选择最接近你手里 API Key 的那一个；选中后我会继续读取 /models 并分类。`);
    } catch (error) {
      push("guide", `搜索配置失败：${error instanceof Error ? error.message : String(error)}\n你可以直接贴 Base URL 或官方 API 文档链接，我会继续判断。`);
    } finally {
      setDiscoveryBusy(false);
    }
  }, [apiKey, applyCandidate, push]);

  const ingestText = useCallback((text: string) => {
    const preset = detectPreset(text);
    const directorySource = detectDirectorySource(text);
    const url = extractUrl(text);
    const extractedApiKey = extractApiKey(text);
    const queryWithoutKey = removeApiKey(text, extractedApiKey);
    const trimmed = text.trim();

    if (extractedApiKey) setApiKey(extractedApiKey);

    if (preset) {
      const hasAnyApiKey = Boolean(apiKey || extractedApiKey);
      setProviderName(preset.id === "custom-openai-compatible" ? "custom-openai-compatible" : preset.id);
      if (preset.baseUrl) setBaseUrl(preset.baseUrl);
      setApi(preset.api);
      setProviderLocalConfig(preset.localConfig ?? {});
      setFallbackModels(preset.defaultModels ?? []);
      push("guide", preset.baseUrl
        ? `我识别到 ${preset.name}，已采用 ${preset.api} 和默认 Base URL。${preset.localConfig ? "保存时还会写入这个平台需要的本地兼容配置。" : ""}${hasAnyApiKey ? "API Key 也已收到，我会读取 /models 并生成分类。" : "现在请提供 API Key；如果你走自定义代理，也可以再贴新的 Base URL。"}`
        : `我按 OpenAI-compatible 处理。请贴 Base URL；${hasAnyApiKey ? "API Key 已收到。" : "如果已经有 API Key，也可以一起发。"}`);
      return;
    }

    if (directorySource) {
      if (!providerName) setProviderName(directorySource.id);
      void discoverConfig(queryWithoutKey || directorySource.name, Boolean(apiKey || extractedApiKey));
      return;
    }

    if (url) {
      setBaseUrl(url.replace(/\/models$/, ""));
      setDiscoveryCandidates([]);
      setProviderLocalConfig({});
      setFallbackModels([]);
      if (!providerName || DIRECTORY_SOURCES.some((source) => source.id === providerName)) {
        setProviderName(new URL(url).hostname.split(".")[0] || "custom-provider");
      }
      push("guide", (apiKey || extractedApiKey)
        ? "收到 Base URL。Provider、Base URL 和 API Key 已足够，我可以开始读取 /models 并生成 strong/weak 分类。"
        : "收到 Base URL。接下来请提供 API Key，我会读取 /models 并按当前项目字段生成配置草案。");
      return;
    }

    if (extractedApiKey) {
      if (providerName && baseUrl) {
        push("guide", "收到 API Key。信息已完整，我可以开始读取模型列表并生成配置草案。");
      } else {
        void discoverConfig(queryWithoutKey, true);
      }
      return;
    }

    if (!providerName) {
      void discoverConfig(trimmed, false);
      return;
    }

    push("guide", "收到。我会把这段作为配置备注参考。当前还需要 Provider、Base URL、API Key 三项齐全后才能生成模型配置。");
  }, [apiKey, baseUrl, discoverConfig, providerName, push]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || busy || discoveryBusy) return;
    push("user", looksLikeApiKey(text) ? "API Key provided" : text);
    setInput("");
    ingestText(text);
  }, [busy, discoveryBusy, ingestText, input, push]);

  const analyze = useCallback(async () => {
    if (!canAnalyze) return;
    setBusy(true);
    setSaved(false);
    push("guide", "我开始读取 /models，并按当前项目的 weak/strong、reasoning、capabilities 字段生成配置草案。");
    try {
      const catalogRes = await fetch("/api/models-config/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: providerName.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          headers: providerLocalConfig.headers,
          authHeader: providerLocalConfig.authHeader,
        }),
      });
      const catalog = await catalogRes.json() as { ok?: boolean; models?: CatalogModel[]; error?: string };
      if (!catalogRes.ok || !catalog.ok) {
        if (fallbackModels.length) {
          setModels(fallbackModels);
          push("guide", [
            `读取 /models 未成功：${catalog.error ?? `HTTP ${catalogRes.status}`}`,
            "我会先按公开文档里的推荐模型写入本地配置，后续你可以在 Models 面板继续刷新或微调。",
            summarizeConfig(providerName.trim(), fallbackModels),
          ].join("\n"));
          return;
        }
        throw new Error(catalog.error ?? `HTTP ${catalogRes.status}`);
      }

      const sortedCatalogModels = (catalog.models ?? [])
        .filter((model) => model.id.trim())
        .filter((model) => !isUnsupportedChatCatalogModel(model))
        .sort((a, b) => {
          if (!discoveredModelHint) return 0;
          const hint = discoveredModelHint.toLowerCase();
          const aHit = a.id.toLowerCase().includes(hint) || hint.includes(a.id.toLowerCase());
          const bHit = b.id.toLowerCase().includes(hint) || hint.includes(b.id.toLowerCase());
          return Number(bHit) - Number(aHit);
        });
      const nextModels = sortedCatalogModels.slice(0, 32).map(classifyModel);
      if (!nextModels.length) {
        if (fallbackModels.length) {
          setModels(fallbackModels);
          push("guide", summarizeConfig(providerName.trim(), fallbackModels));
          return;
        }
        throw new Error("No models were returned from this endpoint.");
      }

      setModels(nextModels);
      push("guide", summarizeConfig(providerName.trim(), nextModels));
    } catch (error) {
      push("guide", `读取失败：${error instanceof Error ? error.message : String(error)}\n请检查 Base URL 是否指向 /v1 风格根地址、API Key 是否可用，或贴 API 文档链接让我重新判断。`);
    } finally {
      setBusy(false);
    }
  }, [apiKey, baseUrl, canAnalyze, discoveredModelHint, fallbackModels, providerLocalConfig, providerName, push]);

  useEffect(() => {
    if (!providerName.trim() || !baseUrl.trim() || !apiKey.trim() || busy || discoveryBusy || models.length) return;
    const key = `${providerName.trim()}|${baseUrl.trim()}|${apiKey.trim().slice(-8)}`;
    if (autoAnalyzeKey === key) return;
    setAutoAnalyzeKey(key);
    void analyze();
  }, [analyze, apiKey, autoAnalyzeKey, baseUrl, busy, discoveryBusy, models.length, providerName]);

  const applyConfig = useCallback(async () => {
    if (!models.length || busy) return;
    setBusy(true);
    setSaved(false);
    try {
      const provider = providerName.trim();
      const guide = models.find((model) => model.role === "strong");
      const existingRes = await fetch("/api/models-config", { cache: "no-store" });
      const existing = existingRes.ok ? await existingRes.json() as ModelsJson : {};
      const capabilityProfiles = Object.fromEntries(models.map((model) => [
        modelKey(provider, model.id),
        buildPendingProfile(modelKey(provider, model.id)),
      ]));
      const config: ModelsJson = {
        providers: {
          ...(existing.providers ?? {}),
          [provider]: {
            ...(existing.providers?.[provider] ?? {}),
            ...providerLocalConfig,
            baseUrl: baseUrl.trim(),
            api,
            apiKey: apiKey.trim(),
            models,
          },
        },
        modelSetup: {
          ...(existing.modelSetup ?? {}),
          guideModel: guide ? modelKey(provider, guide.id) : existing.modelSetup?.guideModel,
          testSuiteVersion: CAPABILITY_TEST_SUITE_VERSION,
          capabilityProfiles: {
            ...(existing.modelSetup?.capabilityProfiles ?? {}),
            ...capabilityProfiles,
          },
        },
      };

      const res = await fetch("/api/models-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      setSaved(true);
      onApplied?.();
      push("guide", "配置已写入 ~/.pi/agent/models.json。后续 session 页面会重新读取可用模型，workflow 会读取 workerModels / strongModels / imageModels，并按节点类型与能力标签选择模型。");
    } catch (error) {
      push("guide", `保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [api, apiKey, baseUrl, busy, models, onApplied, providerLocalConfig, providerName, push]);

  return (
    <div
      style={panel
        ? { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }
        : { height: "100dvh" }}
      onClick={(event) => {
        if (panel && event.target === event.currentTarget) onClose?.();
      }}
    >
    <div
      style={panel
        ? { width: "min(760px, calc(100vw - 36px))", height: "min(70vh, 680px)", display: "grid", gridTemplateRows: "auto 1fr auto", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "0 18px 60px rgba(0,0,0,0.22)", overflow: "hidden" }
        : { height: "100dvh", display: "grid", gridTemplateRows: "auto 1fr auto", background: "var(--bg)", color: "var(--text)" }}
    >
      <header style={{ borderBottom: "1px solid var(--border)", padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 750 }}>API</div>
          <div style={{ marginTop: 3, fontSize: 12, color: "var(--text-muted)" }}>对话式配置 models.json，只使用当前项目支持的 strong/weak 和能力字段。</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onOpenModels && (
            <button
              type="button"
              onClick={onOpenModels}
              style={{ height: 30, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg-panel)", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, fontWeight: 650 }}
            >
              Models
            </button>
          )}
          {panel ? (
            <button type="button" onClick={onClose} style={{ width: 30, height: 30, border: "none", borderRadius: 7, background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
          ) : (
            <Link href="/" style={{ color: "var(--text-muted)", fontSize: 12, textDecoration: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px" }}>Back</Link>
          )}
        </div>
      </header>

      <section style={{ overflow: "auto", padding: panel ? "16px 18px" : "20px 22px", display: "grid", alignContent: "start", gap: 14 }}>
        {messages.map((message) => (
          <div key={message.id} style={{ justifySelf: message.role === "user" ? "end" : "start", maxWidth: "min(760px, 88%)" }}>
            <div style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 12px",
              background: message.role === "user" ? "color-mix(in srgb, var(--accent) 12%, var(--bg-panel))" : "var(--bg-panel)",
              color: message.role === "user" ? "var(--text)" : "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}>
              {message.text}
            </div>
          </div>
        ))}

        {providerSummary && (
          <div style={{ justifySelf: "start", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
            {providerSummary}
          </div>
        )}

        {discoveryCandidates.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Provider candidates</div>
            {discoveryCandidates.map((candidate) => (
              <div key={`${candidate.providerName}-${candidate.baseUrl}-${candidate.modelId ?? ""}`} style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)", padding: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                <div style={{ minWidth: 0, display: "grid", gap: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 750, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{candidate.providerLabel}</span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{Math.round(candidate.confidence * 100)}%</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{candidate.baseUrl}</div>
                  {candidate.localConfig ? (
                    <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>writes: {Object.keys(candidate.localConfig).join(", ")}</div>
                  ) : null}
                  {candidate.modelId ? (
                    <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>model hint: {candidate.modelId}</div>
                  ) : null}
                  <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45 }}>
                    {(candidate.evidence ?? []).slice(0, 2).join(" ")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => applyCandidate(candidate, Boolean(apiKey))}
                  disabled={busy || discoveryBusy}
                  style={{ height: 30, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 7, background: busy || discoveryBusy ? "var(--bg)" : "var(--bg)", color: busy || discoveryBusy ? "var(--text-dim)" : "var(--text)", cursor: busy || discoveryBusy ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}
                >
                  Use this
                </button>
              </div>
            ))}
          </div>
        )}

        {models.length > 0 && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-panel)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 90px minmax(260px, 1.4fr)", gap: 0, padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span>Model</span>
              <span>Tier</span>
              <span>Capabilities</span>
            </div>
            {models.slice(0, 16).map((model) => (
              <div key={model.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 90px minmax(260px, 1.4fr)", gap: 0, minHeight: 42, alignItems: "center", padding: "7px 10px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                <span style={{ fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.id}</span>
                <span style={{ color: model.role === "strong" ? "#0f766e" : "var(--text-dim)", fontWeight: 700 }}>{model.role === "strong" ? "S" : "worker"}</span>
                <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[...(model.capabilities ?? []), model.reasoning ? "reasoning=true" : ""].filter(Boolean).join(", ") || "-"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer style={{ borderTop: "1px solid var(--border)", padding: panel ? "10px 18px" : "12px 22px", display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "end" }}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
          }}
          placeholder="输入平台名、API 文档链接、Base URL 或 API Key..."
          style={{ minHeight: 44, maxHeight: 120, resize: "vertical", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg-panel)", color: "var(--text)", padding: "9px 10px", outline: "none", fontSize: 13, lineHeight: 1.45 }}
        />
        <button type="button" onClick={submit} disabled={!input.trim() || busy || discoveryBusy} style={{ height: 36, padding: "0 14px", border: "1px solid var(--border)", borderRadius: 7, background: input.trim() && !busy && !discoveryBusy ? "var(--bg-panel)" : "var(--bg)", color: input.trim() && !busy && !discoveryBusy ? "var(--text)" : "var(--text-dim)", cursor: input.trim() && !busy && !discoveryBusy ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700 }}>
          Send
        </button>
        {models.length ? (
          <button type="button" onClick={applyConfig} disabled={busy || saved} style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 7, background: saved ? "#16a34a" : "var(--accent)", color: "#fff", cursor: busy || saved ? "default" : "pointer", fontSize: 13, fontWeight: 750 }}>
            {saved ? "Applied" : "Apply config"}
          </button>
        ) : (
          <button type="button" onClick={analyze} disabled={!canAnalyze} style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 7, background: canAnalyze ? "var(--accent)" : "var(--bg-panel)", color: canAnalyze ? "#fff" : "var(--text-dim)", cursor: canAnalyze ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 750 }}>
            {discoveryBusy ? "Searching..." : busy ? "Analyzing..." : "Analyze now"}
          </button>
        )}
      </footer>
    </div>
    </div>
  );
}
