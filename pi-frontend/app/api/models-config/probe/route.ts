import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import { getAgentDir, AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { completeSimple, type AssistantMessage } from "@earendil-works/pi-ai/compat";

export const dynamic = "force-dynamic";

const TEST_SUITE_VERSION = "model-capability-v1";
const PROBE_TIMEOUT_MS = 25_000;
const JUDGE_TIMEOUT_MS = 45_000;

type CapabilityResult = "capable" | "partial" | "not_capable" | "not_applicable" | "pending" | "inconclusive";
type CapabilityProfileStatus = "testing" | "completed" | "partial" | "pending_judgement" | "inconclusive";

interface ModelEntry {
  id: string;
  name?: string;
  role?: "weak" | "strong";
  capabilities?: string[];
  routingNotes?: string;
  profileHints?: string[];
  reasoning?: boolean;
  input?: string[];
  output?: string[];
}

interface ProviderEntry {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
  models?: ModelEntry[];
}

interface ModelsJson {
  providers?: Record<string, ProviderEntry>;
  modelSetup?: {
    guideModel?: string;
    testSuiteVersion?: string;
    capabilityProfiles?: Record<string, CapabilityProfile>;
  };
}

interface ProbeCase {
  id: string;
  dimension: string;
  prompt: string;
  requires?: "image-input" | "image-output";
}

interface ProbeRunResult {
  id: string;
  status: "passed" | "failed";
  prompt: string;
  output?: string;
  error?: string;
  comment?: string;
}

interface CapabilityDimension {
  result: CapabilityResult;
  confidence?: "low" | "medium" | "high";
  notes?: string;
  tests?: ProbeRunResult[];
}

interface CapabilityProfile {
  modelKey: string;
  status: CapabilityProfileStatus;
  testSuiteVersion: string;
  updatedAt?: string;
  summary?: string;
  suggestedRoles?: string[];
  dimensions: Record<string, CapabilityDimension>;
}

const PROBE_CASES: ProbeCase[] = [
  { id: "coding-basic", dimension: "coding", prompt: "Write a TypeScript function named uniqueSortedNumbers that receives number[] and returns a sorted array with duplicates removed. Return code only." },
  { id: "reasoning-basic", dimension: "reasoning", prompt: "A project has three tasks: A takes 2h, B takes 3h and depends on A, C takes 1h and also depends on A. With two workers, what is the minimum completion time? Explain briefly." },
  { id: "writing-basic", dimension: "writing", prompt: "Rewrite this product note into concise professional Chinese: 我们这个东西挺好用，可以帮团队少踩坑，速度也更快。" },
  { id: "summarization-basic", dimension: "summarization", prompt: "Summarize in one sentence: A model capability profile should record what a model can do, confidence, evidence, and suggested roles for future task routing." },
  { id: "classification-basic", dimension: "classification", prompt: "Classify this task as one of coding, writing, summarization, image-generation, reasoning: 'Generate a landing page React component and fix the responsive layout.' Return the label only." },
  { id: "long-context-basic", dimension: "long-context", prompt: "You are evaluating long-context behavior. State whether a model should be tested with long documents before being trusted for repository-scale reasoning. Answer in one sentence." },
  { id: "vision-declared", dimension: "vision", prompt: "Declared vision support check.", requires: "image-input" },
  { id: "image-generation-declared", dimension: "image-generation", prompt: "Declared image generation support check.", requires: "image-output" },
];

function getModelsPath(): string {
  return join(getAgentDir(), "models.json");
}

function getLedgerPath(): string {
  return join(getAgentDir(), "model-capability-ledger.jsonl");
}

function readModelsJson(): ModelsJson {
  const path = getModelsPath();
  if (!existsSync(path)) return { providers: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ModelsJson;
  } catch {
    return { providers: {} };
  }
}

function writeModelsJson(data: ModelsJson): void {
  const path = getModelsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

function appendLedger(event: Record<string, unknown>): void {
  const path = getLedgerPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ id: randomUUID(), ts: Date.now(), isoTime: new Date().toISOString(), ...event })}\n`, { flag: "a" });
}

function modelKey(providerName: string, modelId: string): string {
  return `${providerName}/${modelId}`;
}

function findModelConfig(config: ModelsJson, key: string): { providerName: string; provider: ProviderEntry; model: ModelEntry; index: number } | null {
  for (const [providerName, provider] of Object.entries(config.providers ?? {})) {
    const index = (provider.models ?? []).findIndex((model) => modelKey(providerName, model.id) === key);
    if (index >= 0) return { providerName, provider, model: provider.models![index], index };
  }
  return null;
}

function assistantText(message: AssistantMessage): string {
  return message.content.filter((block) => block.type === "text").map((block) => block.text).join("").trim();
}

function inferDeclaredDimension(model: ModelEntry, dimension: string): CapabilityDimension | null {
  const caps = new Set(model.capabilities ?? []);
  if (model.reasoning) caps.add("reasoning");
  if (model.input?.includes("image")) caps.add("vision");
  if (model.output?.includes("image")) caps.add("image-generation");
  if (caps.has(dimension)) {
    return {
      result: "capable",
      confidence: "medium",
      notes: "由模型配置中的能力标签声明，未消耗测试调用。",
      tests: [{ id: `${dimension}-declared`, status: "passed", prompt: "Declared capability check.", comment: "declared in model config" }],
    };
  }
  if (dimension === "vision" || dimension === "image-generation") {
    return {
      result: "not_applicable",
      confidence: "medium",
      notes: "模型配置未声明该模态能力。",
      tests: [{ id: `${dimension}-declared`, status: "failed", prompt: "Declared capability check.", comment: "not declared" }],
    };
  }
  return null;
}

async function runProbeCase(registry: ModelRegistry, providerName: string, provider: ProviderEntry, model: ModelEntry, probe: ProbeCase): Promise<ProbeRunResult> {
  const declared = inferDeclaredDimension(model, probe.dimension);
  if (probe.requires && declared) {
    return {
      id: probe.id,
      status: declared.result === "capable" ? "passed" : "failed",
      prompt: probe.prompt,
      comment: declared.notes,
    };
  }

  const candidate = registry.find(providerName, model.id);
  if (!candidate) return { id: probe.id, status: "failed", prompt: probe.prompt, error: `Model not found: ${providerName}/${model.id}` };
  const auth = await registry.getApiKeyAndHeaders(candidate);
  if (!auth.ok || !auth.apiKey) return { id: probe.id, status: "failed", prompt: probe.prompt, error: auth.ok ? `No API key found for ${providerName}` : auth.error };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const message = await completeSimple(candidate, {
      messages: [{ role: "user", content: probe.prompt, timestamp: Date.now() }],
    }, {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: 512,
      timeoutMs: PROBE_TIMEOUT_MS,
      maxRetries: 0,
      cacheRetention: "none",
      signal: controller.signal,
    });
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      return { id: probe.id, status: "failed", prompt: probe.prompt, error: message.errorMessage ?? "Model probe failed" };
    }
    const output = assistantText(message);
    return { id: probe.id, status: output ? "passed" : "failed", prompt: probe.prompt, output: output.slice(0, 4000), comment: output ? undefined : "empty output" };
  } catch (error) {
    return { id: probe.id, status: "failed", prompt: probe.prompt, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPendingProfile(key: string, grouped: Record<string, ProbeRunResult[]>): CapabilityProfile {
  return {
    modelKey: key,
    status: "pending_judgement",
    testSuiteVersion: TEST_SUITE_VERSION,
    updatedAt: new Date().toISOString(),
    summary: "能力测试已执行，但当前没有可用向导强模型，等待补判。",
    suggestedRoles: [],
    dimensions: Object.fromEntries(Object.entries(grouped).map(([dimension, tests]) => [dimension, {
      result: tests.every((test) => test.status === "failed") ? "inconclusive" : "pending",
      confidence: "low",
      notes: tests.every((test) => test.status === "failed") ? "该维度测试全部失败，暂无法判定。" : "等待向导模型读取测试输出后判定。",
      tests,
    } satisfies CapabilityDimension])),
  };
}

function fallbackJudgeProfile(key: string, grouped: Record<string, ProbeRunResult[]>): CapabilityProfile {
  const dimensions = Object.fromEntries(Object.entries(grouped).map(([dimension, tests]) => {
    const passed = tests.filter((test) => test.status === "passed").length;
    const failed = tests.length - passed;
    const result: CapabilityResult = passed === 0
      ? "inconclusive"
      : failed > 0
        ? "partial"
        : "capable";
    return [dimension, {
      result,
      confidence: passed > 0 ? "medium" : "low",
      notes: passed === 0 ? "该维度所有测试失败，无法可靠判定。" : `该维度 ${passed}/${tests.length} 个测试有可用输出。`,
      tests,
    } satisfies CapabilityDimension];
  }));
  const suggestedRoles = Object.entries(dimensions).filter(([, item]) => item.result === "capable" || item.result === "partial").map(([dimension]) => dimension);
  return {
    modelKey: key,
    status: "completed",
    testSuiteVersion: TEST_SUITE_VERSION,
    updatedAt: new Date().toISOString(),
    summary: suggestedRoles.length ? `建议用于：${suggestedRoles.join(", ")}` : "没有得到足够证据建议该模型承担特定角色。",
    suggestedRoles,
    dimensions,
  };
}

async function judgeWithGuide(config: ModelsJson, registry: ModelRegistry, key: string, grouped: Record<string, ProbeRunResult[]>): Promise<CapabilityProfile | null> {
  const guideKey = config.modelSetup?.guideModel;
  if (!guideKey) return null;
  const guide = findModelConfig(config, guideKey);
  if (!guide) return null;
  const guideModel = registry.find(guide.providerName, guide.model.id);
  if (!guideModel) return null;
  const auth = await registry.getApiKeyAndHeaders(guideModel);
  if (!auth.ok || !auth.apiKey) return null;

  const prompt = `You are the guide model judging a target model capability probe.
Return JSON only with this schema:
{"summary":"string","suggestedRoles":["coding"],"dimensions":{"coding":{"result":"capable|partial|not_capable|not_applicable|inconclusive","confidence":"low|medium|high","notes":"short evidence"}}}

Target model: ${key}
Probe results:
${JSON.stringify(grouped, null, 2)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  try {
    const message = await completeSimple(guideModel, {
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    }, {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: 1600,
      timeoutMs: JUDGE_TIMEOUT_MS,
      maxRetries: 0,
      cacheRetention: "none",
      signal: controller.signal,
    });
    const text = assistantText(message);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; suggestedRoles?: string[]; dimensions?: Record<string, { result?: CapabilityResult; confidence?: "low" | "medium" | "high"; notes?: string }> };
    const fallback = fallbackJudgeProfile(key, grouped);
    return {
      ...fallback,
      summary: parsed.summary || fallback.summary,
      suggestedRoles: Array.isArray(parsed.suggestedRoles) ? parsed.suggestedRoles : fallback.suggestedRoles,
      dimensions: Object.fromEntries(Object.entries(fallback.dimensions).map(([dimension, item]) => {
        const judged = parsed.dimensions?.[dimension];
        return [dimension, {
          ...item,
          result: judged?.result || item.result,
          confidence: judged?.confidence || item.confidence,
          notes: judged?.notes || item.notes,
        }];
      })),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { modelKey?: unknown; dimensions?: unknown };
    const key = typeof body.modelKey === "string" ? body.modelKey : "";
    if (!key) return NextResponse.json({ ok: false, error: "modelKey is required" }, { status: 400 });

    const config = readModelsJson();
    const target = findModelConfig(config, key);
    if (!target) return NextResponse.json({ ok: false, error: `Model not found: ${key}` }, { status: 404 });

    appendLedger({ type: "capability_probe_started", modelKey: key, status: "running", testSuiteVersion: TEST_SUITE_VERSION });

    const registry = ModelRegistry.create(AuthStorage.create(), getModelsPath());
    const requestedDimensions = Array.isArray(body.dimensions) ? new Set(body.dimensions.filter((item): item is string => typeof item === "string")) : null;
    const cases = PROBE_CASES.filter((probe) => !requestedDimensions || requestedDimensions.has(probe.dimension));
    const grouped: Record<string, ProbeRunResult[]> = {};

    for (const probe of cases) {
      appendLedger({ type: "capability_probe_case_started", modelKey: key, taskId: probe.id, stage: probe.dimension, status: "running" });
      const result = await runProbeCase(registry, target.providerName, target.provider, target.model, probe);
      grouped[probe.dimension] = [...(grouped[probe.dimension] ?? []), result];
      appendLedger({ type: "capability_probe_case_finished", modelKey: key, taskId: probe.id, stage: probe.dimension, status: result.status, payload: { error: result.error, comment: result.comment } });
    }

    const judged = await judgeWithGuide(config, registry, key, grouped);
    const rawProfile = judged ?? (config.modelSetup?.guideModel ? fallbackJudgeProfile(key, grouped) : buildPendingProfile(key, grouped));
    const previousProfile = config.modelSetup?.capabilityProfiles?.[key];
    const profile = requestedDimensions && previousProfile
      ? {
        ...previousProfile,
        ...rawProfile,
        dimensions: {
          ...(previousProfile.dimensions ?? {}),
          ...(rawProfile.dimensions ?? {}),
        },
        updatedAt: rawProfile.updatedAt,
      }
      : rawProfile;
    const nextConfig: ModelsJson = {
      ...config,
      modelSetup: {
        ...(config.modelSetup ?? {}),
        testSuiteVersion: TEST_SUITE_VERSION,
        capabilityProfiles: {
          ...(config.modelSetup?.capabilityProfiles ?? {}),
          [key]: profile,
        },
      },
    };
    writeModelsJson(nextConfig);
    appendLedger({ type: "capability_probe_finished", modelKey: key, status: profile.status, payload: { summary: profile.summary, suggestedRoles: profile.suggestedRoles } });

    return NextResponse.json({ ok: true, profile, config: nextConfig });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
