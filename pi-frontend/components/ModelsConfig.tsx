"use client";

import { useState, useEffect, useCallback, useRef } from "react";
// Color icons (have their own fill colors — no background needed)
import AnthropicIcon from "@lobehub/icons/es/Anthropic/components/Mono";
import OpenAIIcon from "@lobehub/icons/es/OpenAI/components/Mono";
import GoogleColorIcon from "@lobehub/icons/es/Google/components/Color";
import DeepSeekColorIcon from "@lobehub/icons/es/DeepSeek/components/Color";
import GroqIcon from "@lobehub/icons/es/Groq/components/Mono";
import MistralColorIcon from "@lobehub/icons/es/Mistral/components/Color";
import MoonshotIcon from "@lobehub/icons/es/Moonshot/components/Mono";
import MinimaxColorIcon from "@lobehub/icons/es/Minimax/components/Color";
import FireworksColorIcon from "@lobehub/icons/es/Fireworks/components/Color";
import HuggingFaceColorIcon from "@lobehub/icons/es/HuggingFace/components/Color";
import CerebrasColorIcon from "@lobehub/icons/es/Cerebras/components/Color";
import OpenRouterIcon from "@lobehub/icons/es/OpenRouter/components/Mono";
import XAIIcon from "@lobehub/icons/es/XAI/components/Mono";
import CloudflareColorIcon from "@lobehub/icons/es/Cloudflare/components/Color";
import VercelIcon from "@lobehub/icons/es/Vercel/components/Mono";
import GithubCopilotIcon from "@lobehub/icons/es/GithubCopilot/components/Mono";
import AwsColorIcon from "@lobehub/icons/es/Aws/components/Color";
import AzureColorIcon from "@lobehub/icons/es/Azure/components/Color";
import KimiColorIcon from "@lobehub/icons/es/Kimi/components/Color";
import QwenColorIcon from "@lobehub/icons/es/Qwen/components/Color";
import ZhipuColorIcon from "@lobehub/icons/es/Zhipu/components/Color";
import CohereColorIcon from "@lobehub/icons/es/Cohere/components/Color";
import PerplexityColorIcon from "@lobehub/icons/es/Perplexity/components/Color";
import TogetherColorIcon from "@lobehub/icons/es/Together/components/Color";
import GrokIcon from "@lobehub/icons/es/Grok/components/Mono";
import AntGroupColorIcon from "@lobehub/icons/es/AntGroup/components/Color";
import NvidiaColorIcon from "@lobehub/icons/es/Nvidia/components/Color";
import OpenCodeIcon from "@lobehub/icons/es/OpenCode/components/Mono";
import XiaomiMiMoIcon from "@lobehub/icons/es/XiaomiMiMo/components/Mono";
import ZAIIcon from "@lobehub/icons/es/ZAI/components/Mono";

type IconComponent = React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;

// hasColor=true → Color icon (self-colored SVG, no wrapper)
// hasColor=false → Mono icon (rendered with currentColor, inherits theme text color)
const PROVIDER_ICONS: Record<string, { Icon: IconComponent; hasColor: boolean }> = {
  "anthropic":              { Icon: AnthropicIcon,        hasColor: false },
  "openai":                 { Icon: OpenAIIcon,           hasColor: false },
  "openai-codex":           { Icon: OpenAIIcon,           hasColor: false },
  "google":                 { Icon: GoogleColorIcon,      hasColor: true },
  "google-vertex":          { Icon: GoogleColorIcon,      hasColor: true },
  "ant-ling":               { Icon: AntGroupColorIcon,    hasColor: true },
  "deepseek":               { Icon: DeepSeekColorIcon,    hasColor: true },
  "groq":                   { Icon: GroqIcon,             hasColor: false },
  "mistral":                { Icon: MistralColorIcon,     hasColor: true },
  "moonshotai":             { Icon: MoonshotIcon,         hasColor: false },
  "moonshotai-cn":          { Icon: MoonshotIcon,         hasColor: false },
  "moonshot":               { Icon: MoonshotIcon,         hasColor: false },
  "minimax":                { Icon: MinimaxColorIcon,     hasColor: true },
  "minimax-cn":             { Icon: MinimaxColorIcon,     hasColor: true },
  "fireworks":              { Icon: FireworksColorIcon,   hasColor: true },
  "huggingface":            { Icon: HuggingFaceColorIcon, hasColor: true },
  "cerebras":               { Icon: CerebrasColorIcon,    hasColor: true },
  "openrouter":             { Icon: OpenRouterIcon,       hasColor: false },
  "xai":                    { Icon: XAIIcon,              hasColor: false },
  "cloudflare-ai-gateway":  { Icon: CloudflareColorIcon,  hasColor: true },
  "cloudflare-workers-ai":  { Icon: CloudflareColorIcon,  hasColor: true },
  "vercel-ai-gateway":      { Icon: VercelIcon,           hasColor: false },
  "github-copilot":         { Icon: GithubCopilotIcon,    hasColor: false },
  "amazon-bedrock":         { Icon: AwsColorIcon,         hasColor: true },
  "azure-openai-responses": { Icon: AzureColorIcon,       hasColor: true },
  "kimi-coding":            { Icon: KimiColorIcon,        hasColor: true },
  "nvidia":                 { Icon: NvidiaColorIcon,      hasColor: true },
  "opencode":               { Icon: OpenCodeIcon,         hasColor: false },
  "opencode-go":            { Icon: OpenCodeIcon,         hasColor: false },
  "qwen":                   { Icon: QwenColorIcon,        hasColor: true },
  "xiaomi":                 { Icon: XiaomiMiMoIcon,       hasColor: false },
  "xiaomi-token-plan-ams":  { Icon: XiaomiMiMoIcon,       hasColor: false },
  "xiaomi-token-plan-cn":   { Icon: XiaomiMiMoIcon,       hasColor: false },
  "xiaomi-token-plan-sgp":  { Icon: XiaomiMiMoIcon,       hasColor: false },
  "zai":                    { Icon: ZAIIcon,              hasColor: false },
  "zai-coding-cn":          { Icon: ZAIIcon,              hasColor: false },
  "zhipu":                  { Icon: ZhipuColorIcon,       hasColor: true },
  "cohere":                 { Icon: CohereColorIcon,      hasColor: true },
  "perplexity":             { Icon: PerplexityColorIcon,  hasColor: true },
  "together":               { Icon: TogetherColorIcon,    hasColor: true },
  "grok":                   { Icon: GrokIcon,             hasColor: false },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface OAuthProvider {
  id: string;
  name: string;
  usesCallbackServer: boolean;
  loggedIn: boolean;
}

interface ApiKeyProvider {
  id: string;
  displayName: string;
  configured: boolean;
  source?: string;
  modelCount: number;
}

type OAuthLoginState =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "auth"; url: string; instructions: string | null; token: string }
  | { phase: "device_code"; userCode: string; verificationUri: string; intervalSeconds: number | null; expiresInSeconds: number | null }
  | { phase: "prompt"; message: string; placeholder: string | null; token: string }
  | { phase: "select"; message: string; options: { id: string; label: string }[]; token: string }
  | { phase: "progress"; message: string }
  | { phase: "success" }
  | { phase: "error"; message: string };

interface ModelEntry {
  id: string;
  name?: string;
  api?: string;
  role?: "weak" | "strong";
  capabilities?: string[];
  routingNotes?: string;
  profileHints?: string[];
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: string[];
  output?: string[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
  compat?: Record<string, unknown>;
}

interface ProviderEntry {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
  models?: ModelEntry[];
  modelOverrides?: Record<string, unknown>;
}

interface CatalogModel {
  id: string;
  name?: string;
  contextWindow?: number;
}

interface ModelsJson {
  providers?: Record<string, ProviderEntry>;
  modelSetup?: {
    guideModel?: string;
    testSuiteVersion?: string;
    capabilityProfiles?: Record<string, CapabilityProfile>;
  };
}

type CapabilityResult = "capable" | "partial" | "not_capable" | "not_applicable" | "pending" | "inconclusive";
type CapabilityProfileStatus = "untested" | "testing" | "completed" | "partial" | "pending_judgement" | "inconclusive";

interface CapabilityDimension {
  result: CapabilityResult;
  confidence?: "low" | "medium" | "high";
  notes?: string;
  tests?: Array<{ id: string; status: "pending" | "running" | "passed" | "failed"; prompt?: string; output?: string; error?: string; comment?: string }>;
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

type ModelTestState =
  | { phase: "idle" }
  | { phase: "testing" }
  | { phase: "success"; latencyMs?: number; status?: number; responseText?: string }
  | { phase: "error"; message: string; latencyMs?: number; status?: number };

type Selection =
  | { type: "provider"; name: string }
  | { type: "model"; providerName: string; index: number }
  | { type: "oauth"; providerId: string }
  | { type: "apikey"; providerId: string }
  | { type: "capabilities" };

type TreeFilter = "all" | "weak" | "strong" | "image";
type GuideMode = "manual" | "assisted";

interface LedgerEvent {
  id?: string;
  isoTime?: string;
  type?: string;
  modelKey?: string;
  taskId?: string;
  stage?: string;
  status?: string;
  payload?: { summary?: string; suggestedRoles?: string[] };
}

const API_OPTIONS = ["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"] as const;
const API_OPTION_META: Record<typeof API_OPTIONS[number], { label: string; description: string; bestFor: string }> = {
  "openai-completions": {
    label: "OpenAI Chat",
    description: "OpenAI-compatible /chat/completions endpoint.",
    bestFor: "OpenRouter, Together, SiliconFlow, most aggregator APIs",
  },
  "openai-responses": {
    label: "OpenAI Responses",
    description: "OpenAI Responses API format.",
    bestFor: "OpenAI newer response-style models",
  },
  "anthropic-messages": {
    label: "Anthropic Messages",
    description: "Anthropic Claude Messages API format.",
    bestFor: "Claude-compatible direct endpoints",
  },
  "google-generative-ai": {
    label: "Google GenAI",
    description: "Google Generative AI API format.",
    bestFor: "Gemini-compatible endpoints",
  },
};
const MODEL_CAPABILITIES = [
  { id: "coding", label: "Coding" },
  { id: "reasoning", label: "Reasoning" },
  { id: "vision", label: "Vision" },
  { id: "image-generation", label: "Image Gen" },
  { id: "writing", label: "Writing" },
  { id: "summarization", label: "Summary" },
  { id: "classification", label: "Classify" },
  { id: "tool-use", label: "Tool Use" },
  { id: "long-context", label: "Long Context" },
] as const;
const PROFILE_HINTS = [
  { id: "lead-agent", label: "Lead" },
  { id: "general-executor", label: "General" },
  { id: "backend-guardian", label: "Backend" },
  { id: "frontend-monitor", label: "Frontend" },
  { id: "artifact-reviewer", label: "Review" },
  { id: "memory-curator", label: "Memory" },
] as const;
const AGGREGATOR_PRESETS = [
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", api: "openai-completions" },
  { id: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", api: "openai-completions" },
  { id: "aihubmix", name: "AiHubMix", baseUrl: "https://aihubmix.com/v1", api: "openai-completions" },
  { id: "together", name: "Together", baseUrl: "https://api.together.xyz/v1", api: "openai-completions" },
  { id: "custom-openai-compatible", name: "OpenAI-compatible", baseUrl: "https://api.example.com/v1", api: "openai-completions" },
] as const;
const CAPABILITY_TEST_SUITE_VERSION = "model-capability-v1";
const CAPABILITY_DIMENSIONS = [
  { id: "coding", label: "代码生成能力" },
  { id: "reasoning", label: "复杂推理能力" },
  { id: "vision", label: "图像理解能力" },
  { id: "image-generation", label: "生图能力" },
  { id: "writing", label: "写作改写能力" },
  { id: "summarization", label: "摘要归纳能力" },
  { id: "classification", label: "分类路由能力" },
  { id: "long-context", label: "长上下文能力" },
] as const;

// ── Form field helpers ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  padding: "6px 9px",
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--text)",
  fontSize: 12,
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
};

function TextInput({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    style={{ ...inputStyle, fontFamily: mono ? "var(--font-mono)" : "inherit" }} />;
}

function SecretTextInput({
  value,
  onChange,
  placeholder,
  mono,
  onKeyDown,
  autoComplete = "off",
  spellCheck = false,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  autoComplete?: string;
  spellCheck?: boolean;
  style?: React.CSSProperties;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!value) setVisible(false);
  }, [value]);

  return (
    <div style={{ position: "relative", width: "100%", ...style }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: 34, fontFamily: mono ? "var(--font-mono)" : "inherit" }}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide API key" : "Show API key"}
        title={visible ? "Hide API key" : "Show API key"}
        style={{
          position: "absolute",
          right: 5,
          top: "50%",
          transform: "translateY(-50%)",
          width: 24,
          height: 24,
          padding: 0,
          border: "none",
          background: "transparent",
          color: "var(--text-dim)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {visible ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12a18.45 18.45 0 0 1 5.06-6.94" />
            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
            <path d="M1 1l22 22" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />;
}

function ApiFormatPicker({
  value,
  inheritedValue,
  onChange,
  allowInherit,
}: {
  value: string;
  inheritedValue?: string;
  onChange: (v: string) => void;
  allowInherit?: boolean;
}) {
  const effective = value || inheritedValue || "openai-completions";
  const effectiveMeta = API_OPTION_META[effective as typeof API_OPTIONS[number]];
  const options = allowInherit ? ["", ...API_OPTIONS] : [...API_OPTIONS];

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 7 }}>
        {options.map((option) => {
          const isInherit = option === "";
          const active = value === option || (!value && isInherit);
          const meta = isInherit ? null : API_OPTION_META[option as typeof API_OPTIONS[number]];
          return (
            <button
              key={option || "inherit"}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={active}
              title={isInherit ? `Use provider default: ${inheritedValue || "openai-completions"}` : meta?.bestFor}
              style={{
                minHeight: 58,
                padding: "8px 10px",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 8,
                background: active ? "color-mix(in srgb, var(--accent) 12%, var(--bg-panel))" : "var(--bg-panel)",
                color: active ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
                textAlign: "left",
                display: "grid",
                gap: 4,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 750 }}>{isInherit ? "Inherit provider" : meta?.label}</span>
                {active ? (
                  <span style={{ width: 16, height: 16, borderRadius: 999, background: "var(--accent)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>✓</span>
                ) : null}
              </span>
              <span style={{ fontSize: 10, color: active ? "var(--text-muted)" : "var(--text-dim)", lineHeight: 1.35 }}>
                {isInherit ? `Actual: ${inheritedValue || "openai-completions"}` : meta?.description}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "color-mix(in srgb, var(--bg-panel) 72%, transparent)" }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--accent)", marginTop: 5, flexShrink: 0 }} />
        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--text)" }}>Current API:</strong> {effective}
          {effectiveMeta ? <span> · {effectiveMeta.bestFor}</span> : null}
        </div>
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 13, height: 13, accentColor: "var(--accent)", cursor: "pointer" }} />
      {label}
    </label>
  );
}

function TogglePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 26,
        padding: "0 9px",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 6,
        background: active ? "color-mix(in srgb, var(--accent) 14%, var(--bg-panel))" : "var(--bg-panel)",
        color: active ? "var(--accent)" : "var(--text-muted)",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function toggleString(values: string[] | undefined, value: string): string[] | undefined {
  const set = new Set(values ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return set.size ? [...set] : undefined;
}

function splitTags(value: string): string[] | undefined {
  const tags = value.split(",").map((part) => part.trim()).filter(Boolean);
  return tags.length ? Array.from(new Set(tags)) : undefined;
}

function modelKey(providerName: string, modelId: string): string {
  return `${providerName}/${modelId}`;
}

function dimensionLabel(id: string): string {
  return CAPABILITY_DIMENSIONS.find((dimension) => dimension.id === id)?.label ?? id;
}

function resultLabel(result: CapabilityResult): string {
  switch (result) {
    case "capable": return "可胜任";
    case "partial": return "部分可用";
    case "not_capable": return "不可用";
    case "not_applicable": return "不适用";
    case "inconclusive": return "无法判定";
    case "pending": return "待判定";
  }
}

function resultGlyph(result: CapabilityResult): string {
  switch (result) {
    case "capable": return "●";
    case "partial": return "◐";
    case "not_capable": return "○";
    case "not_applicable": return "○";
    case "inconclusive": return "◌";
    case "pending": return "◆";
  }
}

function profileHasCapable(profile?: CapabilityProfile): boolean {
  return Boolean(profile && Object.values(profile.dimensions ?? {}).some((dimension) => dimension.result === "capable"));
}

function profileHasOnlyNonCapableResults(profile?: CapabilityProfile): boolean {
  if (!profile) return false;
  const dimensions = Object.values(profile.dimensions ?? {});
  return dimensions.length > 0 && dimensions.every((dimension) => dimension.result !== "capable" && dimension.result !== "pending");
}

function profileHasInconclusive(profile?: CapabilityProfile): boolean {
  return Boolean(profile && Object.values(profile.dimensions ?? {}).some((dimension) => dimension.result === "inconclusive"));
}

function isProfileTested(profile?: CapabilityProfile): boolean {
  return Boolean(profile && profile.status !== "untested" && profile.status !== "testing" && profile.status !== "pending_judgement");
}

function capabilityTooltip(profile?: CapabilityProfile): string {
  if (!profile) return "No capability test has run yet.";
  const summary = CAPABILITY_DIMENSIONS
    .map((dimension) => {
      const item = profile.dimensions?.[dimension.id];
      return item ? `${dimension.label}: ${resultLabel(item.result)}` : null;
    })
    .filter(Boolean)
    .join(" · ");
  return summary || profile.summary || profile.status;
}

function modelMatchesFilter(model: ModelEntry, profile: CapabilityProfile | undefined, filter: TreeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "weak") return model.role === "weak";
  if (filter === "strong") return model.role === "strong";
  return profile?.dimensions?.["image-generation"]?.result === "capable";
}

function buildPendingCapabilityProfile(providerName: string, model: ModelEntry, guideModel?: string): CapabilityProfile {
  const key = modelKey(providerName, model.id);
  return {
    modelKey: key,
    status: guideModel ? "testing" : "pending_judgement",
    testSuiteVersion: CAPABILITY_TEST_SUITE_VERSION,
    updatedAt: new Date().toISOString(),
    summary: guideModel
      ? "已创建 capability_probe，等待标准题库执行和向导判定。"
      : "测试任务可先执行；当前缺少向导强模型，完成后会停在待判定状态。",
    suggestedRoles: [],
    dimensions: Object.fromEntries(CAPABILITY_DIMENSIONS.map((dimension) => [dimension.id, {
      result: "pending",
      confidence: "low",
      notes: "等待 capability_probe 标准题库结果。",
      tests: [{ id: `${dimension.id}-probe-1`, status: "pending" }],
    } satisfies CapabilityDimension])),
  };
}

function collectWeakModelsNeedingProbe(draft: ModelsJson, previous?: ModelsJson): string[] {
  const keys = new Set<string>();
  for (const [providerName, provider] of Object.entries(draft.providers ?? {})) {
    for (const model of provider.models ?? []) {
      if (!model.id.trim() || model.role !== "weak") continue;
      const key = modelKey(providerName, model.id);
      const profile = draft.modelSetup?.capabilityProfiles?.[key];
      const previousProfile = previous?.modelSetup?.capabilityProfiles?.[key];
      if (!previousProfile || !profile || profile.testSuiteVersion !== CAPABILITY_TEST_SUITE_VERSION || profile.status === "untested") {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

function findModelInConfig(draft: ModelsJson, key: string): { providerName: string; model: ModelEntry } | null {
  for (const [providerName, provider] of Object.entries(draft.providers ?? {})) {
    const model = (provider.models ?? []).find((item) => modelKey(providerName, item.id) === key);
    if (model) return { providerName, model };
  }
  return null;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{children}</div>;
}

// ── Provider detail ───────────────────────────────────────────────────────────

function ProviderDetail({ name, provider, onChange, onRename, onDelete, onAddModel, onAddCatalogModel, onSelectModel, onSave, saving, savedOk, dirty }: {
  name: string; provider: ProviderEntry;
  onChange: (p: ProviderEntry) => void; onRename: (n: string) => void; onDelete: () => void;
  onAddModel: () => void;
  onAddCatalogModel: (model: CatalogModel) => void;
  onSelectModel: (index: number) => void;
  onSave: () => void;
  saving: boolean;
  savedOk: boolean;
  dirty: boolean;
}) {
  const [editingName, setEditingName] = useState(name);
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  useEffect(() => setEditingName(name), [name]);
  const set = <K extends keyof ProviderEntry>(k: K, v: ProviderEntry[K]) => onChange({ ...provider, [k]: v });
  const models = provider.models ?? [];
  const configuredModelIds = new Set(models.map((model) => model.id).filter(Boolean));
  const catalogQuery = catalogSearch.trim().toLowerCase();
  const visibleCatalogModels = catalogModels
    .filter((model) => !catalogQuery || model.id.toLowerCase().includes(catalogQuery) || model.name?.toLowerCase().includes(catalogQuery))
    .slice(0, 80);

  useEffect(() => {
    if (!provider.api) onChange({ ...provider, api: "openai-completions" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.api]);

  useEffect(() => {
    setCatalogModels([]);
    setCatalogSearch("");
    setCatalogError(null);
    setCatalogLoading(false);
  }, [name]);

  const fetchCatalog = useCallback(async () => {
    if (!provider.baseUrl?.trim() || catalogLoading) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await fetch("/api/models-config/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, headers: provider.headers }),
      });
      const d = await res.json() as { ok?: boolean; models?: CatalogModel[]; error?: string };
      if (!res.ok || !d.ok) {
        setCatalogError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setCatalogModels(d.models ?? []);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : String(error));
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogLoading, provider.apiKey, provider.baseUrl, provider.headers]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle>Provider</SectionTitle>
        <button onClick={onDelete}
          style={{ padding: "3px 8px", background: "none", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, color: "#ef4444", cursor: "pointer", fontSize: 11 }}>
          Delete
        </button>
      </div>

      <Field label="Provider name">
        <TextInput value={editingName} onChange={setEditingName} placeholder="provider-name" mono />
        {editingName !== name && editingName.trim() && (
          <button onClick={() => onRename(editingName.trim())}
            style={{ marginTop: 4, padding: "3px 10px", background: "var(--accent)", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 11, alignSelf: "flex-start" }}>
            Rename
          </button>
        )}
      </Field>

      <Field label="Base URL">
        <TextInput value={provider.baseUrl ?? ""} onChange={(v) => set("baseUrl", v || undefined)}
          placeholder="https://api.example.com/v1" mono />
      </Field>

      <Field label="API Key">
        <SecretTextInput value={provider.apiKey ?? ""} onChange={(v) => set("apiKey", v || undefined)}
          placeholder="ENV_VAR_NAME, !shell-command, or literal key" mono />
        <span style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
          Prefix with <code style={{ fontFamily: "var(--font-mono)" }}>!</code> to run a shell command, or use an env var name
        </span>
      </Field>

      <Field label="API">
        <ApiFormatPicker value={provider.api ?? "openai-completions"} onChange={(v) => set("api", v || "openai-completions")} />
      </Field>

      <div style={{ display: "grid", gap: 10, padding: "12px", border: "1px solid var(--border)", borderRadius: 10, background: "color-mix(in srgb, var(--bg-panel) 72%, transparent)" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 750, color: "var(--text)", marginBottom: 4 }}>Next steps</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
            API format changes are applied to this draft immediately. Save the config, then add or select a model to run a connection test.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || savedOk || !dirty}
            style={{
              height: 28,
              padding: "0 10px",
              border: "none",
              borderRadius: 6,
              background: savedOk ? "#16a34a" : dirty ? "var(--accent)" : "var(--bg-panel)",
              color: savedOk || dirty ? "#fff" : "var(--text-dim)",
              cursor: saving || savedOk || !dirty ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            {savedOk ? "Saved" : saving ? "Saving..." : dirty ? "Save changes" : "No changes"}
          </button>
          <button
            type="button"
            onClick={onAddModel}
            style={{ height: 28, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
          >
            + Add model
          </button>
          <button
            type="button"
            onClick={fetchCatalog}
            disabled={!provider.baseUrl?.trim() || catalogLoading}
            title="Fetch /models from this provider without auto-selecting anything"
            style={{
              height: 28,
              padding: "0 10px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg)",
              color: provider.baseUrl?.trim() && !catalogLoading ? "var(--text)" : "var(--text-dim)",
              cursor: provider.baseUrl?.trim() && !catalogLoading ? "pointer" : "not-allowed",
              fontSize: 12,
            }}
          >
            {catalogLoading ? "Fetching..." : "Fetch catalog"}
          </button>
        </div>
        {(catalogError || catalogModels.length > 0) && (
          <div style={{ display: "grid", gap: 8, paddingTop: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder={`Search ${catalogModels.length} fetched models`}
                style={{ ...inputStyle, height: 30, flex: 1, minWidth: 0, fontFamily: "var(--font-mono)" }}
              />
              <span style={{ fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>
                manual add only
              </span>
            </div>
            {catalogError ? (
              <div style={{ fontSize: 11, color: "#f87171", lineHeight: 1.45 }}>{catalogError}</div>
            ) : (
              <div style={{ maxHeight: 210, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg)" }}>
                {visibleCatalogModels.length ? visibleCatalogModels.map((catalogModel) => {
                  const alreadyAdded = configuredModelIds.has(catalogModel.id);
                  return (
                    <button
                      key={catalogModel.id}
                      type="button"
                      onClick={() => {
                        if (!alreadyAdded) onAddCatalogModel(catalogModel);
                      }}
                      disabled={alreadyAdded}
                      title={alreadyAdded ? "Already configured" : "Add this model to the provider draft"}
                      style={{
                        width: "100%",
                        minHeight: 34,
                        padding: "7px 9px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        border: "none",
                        borderBottom: "1px solid var(--border)",
                        background: "transparent",
                        color: alreadyAdded ? "var(--text-dim)" : "var(--text-muted)",
                        cursor: alreadyAdded ? "not-allowed" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 11, fontFamily: "var(--font-mono)", color: alreadyAdded ? "var(--text-dim)" : "var(--text)" }}>{catalogModel.id}</span>
                        {catalogModel.name && catalogModel.name !== catalogModel.id ? (
                          <span style={{ display: "block", marginTop: 2, fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{catalogModel.name}</span>
                        ) : null}
                      </span>
                      <span style={{ fontSize: 10, color: alreadyAdded ? "var(--text-dim)" : "var(--accent)", flexShrink: 0 }}>
                        {alreadyAdded ? "added" : "add"}
                      </span>
                    </button>
                  );
                }) : (
                  <div style={{ padding: 12, fontSize: 11, color: "var(--text-dim)", textAlign: "center" }}>No fetched models match</div>
                )}
              </div>
            )}
          </div>
        )}
        {models.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Models using this provider</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {models.map((model, index) => (
                <button
                  key={`${model.id || "new-model"}-${index}`}
                  type="button"
                  onClick={() => onSelectModel(index)}
                  title="Open model details and test this model"
                  style={{
                    maxWidth: 220,
                    height: 26,
                    padding: "0 8px",
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    background: "var(--bg)",
                    color: model.id ? "var(--text-muted)" : "var(--text-dim)",
                    cursor: "pointer",
                    fontSize: 11,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {model.id || "new model"}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── ThinkingLevelMap editor ───────────────────────────────────────────────────

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
type ThinkingLevel = typeof THINKING_LEVELS[number];

const LEVEL_COLORS: Record<ThinkingLevel, string> = {
  off:     "var(--text-dim)",
  minimal: "#6b7280",
  low:     "#60a5fa",
  medium:  "#a78bfa",
  high:    "#f472b6",
  xhigh:   "#fb923c",
};

function ThinkingLevelMapEditor({
  value,
  onChange,
}: {
  value: Record<string, string | null> | undefined;
  onChange: (v: Record<string, string | null> | undefined) => void;
}) {
  const map = value ?? {};

  const setLevel = (level: ThinkingLevel, entry: string | null | "omit") => {
    const next = { ...map };
    if (entry === "omit") {
      delete next[level];
    } else {
      next[level] = entry;
    }
    onChange(Object.keys(next).length ? next : undefined);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {THINKING_LEVELS.map((level) => {
        const raw = map[level];
        const state: "omit" | "null" | "string" =
          !(level in map) ? "omit" : raw === null ? "null" : "string";
        const strVal = typeof raw === "string" ? raw : "";
        const color = LEVEL_COLORS[level];

        const btnBase: React.CSSProperties = {
          padding: "4px 10px",
          fontSize: 10,
          border: "none",
          cursor: "pointer",
          fontWeight: 400,
          transition: "background 0.1s, color 0.1s",
          whiteSpace: "nowrap",
          background: "var(--bg-panel)",
          color: "var(--text-dim)",
        };
        const btnActive: React.CSSProperties = {
          background: "var(--accent)",
          color: "#fff",
          fontWeight: 600,
        };
        const btnActiveDisabled: React.CSSProperties = {
          background: "#ef4444",
          color: "#fff",
          fontWeight: 600,
        };

        return (
          <div
            key={level}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 4px",
              borderRadius: 6,
              background: "transparent",
              border: "1px solid transparent",
            }}
          >
            {/* Level badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, width: 68, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0, opacity: state === "null" ? 0.3 : 1 }} />
              <span style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: state === "null" ? "var(--text-dim)" : "var(--text-muted)",
                textDecoration: state === "null" ? "line-through" : "none",
              }}>
                {level}
              </span>
            </div>

            {/* Default + Disabled buttons */}
            <div style={{ display: "flex", borderRadius: 5, border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 }}>
              <button
                onClick={() => setLevel(level, "omit")}
                style={{ ...btnBase, ...(state === "omit" ? btnActive : {}) }}
              >
                Default
              </button>
              <button
                onClick={() => setLevel(level, null)}
                style={{ ...btnBase, borderLeft: "1px solid var(--border)", ...(state === "null" ? btnActiveDisabled : {}) }}
              >
                Disabled
              </button>
            </div>

            {/* Custom button + input fused */}
            <div style={{ display: "flex", borderRadius: 5, border: `1px solid ${state === "string" ? "var(--accent)" : "var(--border)"}`, overflow: "hidden", transition: "border-color 0.1s" }}>
              <button
                onClick={() => setLevel(level, strVal || level)}
                style={{ ...btnBase, ...(state === "string" ? btnActive : {}), borderRight: "1px solid var(--border)", flexShrink: 0 }}
              >
                Custom
              </button>
              <input
                value={strVal}
                onChange={(e) => setLevel(level, e.target.value)}
                onFocus={() => { if (state !== "string") setLevel(level, strVal || level); }}
                placeholder={level}
                maxLength={10}
                style={{
                  width: "12ch",
                  background: state === "string" ? "var(--bg)" : "var(--bg-panel)",
                  border: "none",
                  outline: "none",
                  color: state === "string" ? "var(--text)" : "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  padding: "4px 7px",
                  transition: "background 0.1s, color 0.1s",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Model detail ──────────────────────────────────────────────────────────────

const DEEPSEEK_COMPAT = {
  thinkingFormat: "deepseek",
  requiresReasoningContentOnAssistantMessages: true,
} as const;

function hasDeepseekCompat(model: ModelEntry): boolean {
  return model.compat?.thinkingFormat === "deepseek";
}

function setDeepseekCompat(model: ModelEntry, enabled: boolean): ModelEntry {
  if (enabled) {
    return { ...model, compat: { ...(model.compat ?? {}), ...DEEPSEEK_COMPAT } };
  }
  if (!model.compat) return model;
  const rest = { ...model.compat };
  delete rest.thinkingFormat;
  delete rest.requiresReasoningContentOnAssistantMessages;
  return { ...model, compat: Object.keys(rest).length ? rest : undefined };
}

function ModelDetail({
  providerName,
  provider,
  model,
  isGuide,
  capabilityProfile,
  ledgerEvents,
  isProbing,
  onChange,
  onSetGuide,
  onRunProbe,
  onRetryDimension,
  onDelete,
}: {
  providerName: string;
  provider: ProviderEntry;
  model: ModelEntry;
  isGuide: boolean;
  capabilityProfile?: CapabilityProfile;
  ledgerEvents: LedgerEvent[];
  isProbing: boolean;
  onChange: (m: ModelEntry) => void;
  onSetGuide: () => void;
  onRunProbe: () => void;
  onRetryDimension: (dimension: string) => void;
  onDelete: () => void;
}) {
  const [testState, setTestState] = useState<ModelTestState>({ phase: "idle" });
  const set = <K extends keyof ModelEntry>(k: K, v: ModelEntry[K]) => onChange({ ...model, [k]: v });
  const costVal = (k: keyof NonNullable<ModelEntry["cost"]>) => model.cost?.[k] !== undefined ? String(model.cost[k]) : "";
  const setCost = (k: keyof NonNullable<ModelEntry["cost"]>, v: string) => {
    const n = parseFloat(v);
    onChange({ ...model, cost: { ...(model.cost ?? {}), [k]: isNaN(n) ? undefined : n } });
  };
  const testSummary = (() => {
    if (testState.phase === "idle") return null;
    if (testState.phase === "testing") return "Testing model connection...";
    const meta = [
      testState.latencyMs !== undefined ? `${testState.latencyMs}ms` : null,
      testState.status !== undefined ? `HTTP ${testState.status}` : null,
    ].filter(Boolean);
    if (testState.phase === "success") {
      return ["Connected", ...meta, testState.responseText || null].filter(Boolean).join(" · ");
    }
    return ["Failed", ...meta, testState.message].filter(Boolean).join(" · ");
  })();

  useEffect(() => {
    setTestState({ phase: "idle" });
  }, [providerName, provider.baseUrl, provider.api, provider.apiKey, model.id, model.api]);

  const handleTest = useCallback(async () => {
    if (!model.id.trim() || testState.phase === "testing") return;
    setTestState({ phase: "testing" });
    try {
      const res = await fetch("/api/models-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerName, provider, model }),
      });
      const d = await res.json() as {
        ok?: boolean;
        error?: string;
        latencyMs?: number;
        status?: number;
        responseText?: string;
      };
      if (!res.ok || !d.ok) {
        setTestState({
          phase: "error",
          message: d.error ?? `HTTP ${res.status}`,
          latencyMs: d.latencyMs,
          status: d.status,
        });
        return;
      }
      setTestState({
        phase: "success",
        latencyMs: d.latencyMs,
        status: d.status,
        responseText: d.responseText,
      });
    } catch (e) {
      setTestState({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [model, provider, providerName, testState.phase]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle>Model</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {testSummary && (
            <span
              title={testSummary}
              style={{
                maxWidth: 260,
                height: 24,
                padding: "0 8px",
                border: `1px solid ${testState.phase === "error" ? "#fecaca" : testState.phase === "success" ? "#bbf7d0" : "var(--border)"}`,
                borderRadius: 4,
                background: testState.phase === "error" ? "#fee2e2" : testState.phase === "success" ? "#dcfce7" : "#e5e7eb",
                color: "#111827",
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                boxSizing: "border-box",
              }}
            >
              {testSummary}
            </span>
          )}
          <button
            onClick={handleTest}
            disabled={!model.id.trim() || testState.phase === "testing"}
            title="Test model connection"
            style={{
              height: 24,
              padding: "0 8px",
              background: testState.phase === "success" ? "#16a34a" : "none",
              border: `1px solid ${testState.phase === "success" ? "#16a34a" : "var(--border)"}`,
              borderRadius: 4,
              color: testState.phase === "success" ? "#fff" : (!model.id.trim() || testState.phase === "testing") ? "var(--text-dim)" : "var(--text-muted)",
              cursor: (!model.id.trim() || testState.phase === "testing") ? "not-allowed" : "pointer",
              fontSize: 11,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              gap: 5,
            }}
          >
            {testState.phase === "success" && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {testState.phase === "testing" ? "Testing…" : testState.phase === "success" ? "OK" : "Test"}
          </button>
          <button
            onClick={onSetGuide}
            disabled={!model.id.trim() || isGuide}
            title={isGuide ? "Current guide model" : "Set as guide model"}
            style={{
              height: 24,
              padding: "0 8px",
              background: isGuide ? "#0a84ff" : "none",
              border: `1px solid ${isGuide ? "#0a84ff" : "var(--border)"}`,
              borderRadius: 4,
              color: isGuide ? "#fff" : !model.id.trim() ? "var(--text-dim)" : "var(--text-muted)",
              cursor: (!model.id.trim() || isGuide) ? "default" : "pointer",
              fontSize: 11,
              boxSizing: "border-box",
            }}
          >
            {isGuide ? "Guide" : "Set guide"}
          </button>
          <button onClick={onDelete}
            style={{ height: 24, padding: "0 8px", background: "none", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, color: "#ef4444", cursor: "pointer", fontSize: 11, boxSizing: "border-box" }}>
            Remove
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="ID *"><TextInput value={model.id} onChange={(v) => set("id", v)} placeholder="model-id" mono /></Field>
        <Field label="Name"><TextInput value={model.name ?? ""} onChange={(v) => set("name", v || undefined)} placeholder="Display name" /></Field>
      </div>

      <Field label="API override">
        <ApiFormatPicker
          value={model.api ?? ""}
          inheritedValue={provider.api ?? "openai-completions"}
          onChange={(v) => set("api", v || undefined)}
          allowInherit
        />
      </Field>

      <div>
        <SectionTitle>Workflow routing</SectionTitle>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Model tier</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <TogglePill label="Weak worker" active={model.role === "weak"} onClick={() => set("role", model.role === "weak" ? undefined : "weak")} />
              <TogglePill label="Strong planner" active={model.role === "strong"} onClick={() => set("role", model.role === "strong" ? undefined : "strong")} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Profile hints</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {PROFILE_HINTS.map((hint) => (
                <TogglePill
                  key={hint.id}
                  label={hint.label}
                  active={(model.profileHints ?? []).includes(hint.id)}
                  onClick={() => set("profileHints", toggleString(model.profileHints, hint.id))}
                />
              ))}
            </div>
          </div>
        </div>
        <Field label="Custom profile hints">
          <TextInput value={(model.profileHints ?? []).filter((hint) => !PROFILE_HINTS.some((preset) => preset.id === hint)).join(", ")} onChange={(v) => {
            const presets = (model.profileHints ?? []).filter((hint) => PROFILE_HINTS.some((preset) => preset.id === hint));
            set("profileHints", Array.from(new Set([...presets, ...(splitTags(v) ?? [])])).length ? Array.from(new Set([...presets, ...(splitTags(v) ?? [])])) : undefined);
          }} placeholder="debug-teacher, product-writer" />
        </Field>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Capabilities</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {MODEL_CAPABILITIES.map((capability) => (
              <TogglePill
                key={capability.id}
                label={capability.label}
                active={(model.capabilities ?? []).includes(capability.id)}
                onClick={() => set("capabilities", toggleString(model.capabilities, capability.id))}
              />
            ))}
          </div>
        </div>
        <Field label="Routing notes for Lead Agent">
          <textarea
            value={model.routingNotes ?? ""}
            onChange={(e) => set("routingNotes", e.target.value || undefined)}
            placeholder="Examples: cheap classifier; reliable code reviewer; use for image generation; avoid for repository edits..."
            style={{ ...inputStyle, minHeight: 62, resize: "vertical", lineHeight: 1.45 }}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <Check label="Reasoning / thinking" checked={model.reasoning ?? false} onChange={(v) => set("reasoning", v || undefined)} />
        <Check label="Image input" checked={model.input?.includes("image") ?? false}
          onChange={(v) => set("input", v ? ["text", "image"] : undefined)} />
        <Check label="Image output" checked={model.output?.includes("image") ?? false}
          onChange={(v) => {
            const nextCapabilities = v
              ? Array.from(new Set([...(model.capabilities ?? []), "image-generation"]))
              : model.capabilities?.filter((capability) => capability !== "image-generation");
            onChange({
              ...model,
              output: v ? ["image"] : undefined,
              capabilities: nextCapabilities?.length ? nextCapabilities : undefined,
            });
          }}
        />
      </div>

      {model.reasoning && (
        <>
          <Check
            label="DeepSeek thinking compat"
            checked={hasDeepseekCompat(model)}
            onChange={(v) => onChange(setDeepseekCompat(model, v))}
          />
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <SectionTitle>Thinking level map</SectionTitle>
              {model.thinkingLevelMap && (
                <button
                  onClick={() => set("thinkingLevelMap", undefined)}
                  style={{ fontSize: 10, padding: "2px 7px", background: "none", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-dim)", cursor: "pointer" }}
                >
                  clear all
                </button>
              )}
            </div>
            <ThinkingLevelMapEditor
              value={model.thinkingLevelMap}
              onChange={(v) => set("thinkingLevelMap", v)}
            />
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Context window (tokens)">
          <NumInput value={model.contextWindow !== undefined ? String(model.contextWindow) : ""}
            onChange={(v) => set("contextWindow", v ? parseInt(v) : undefined)} placeholder="128000" />
        </Field>
        <Field label="Max output tokens">
          <NumInput value={model.maxTokens !== undefined ? String(model.maxTokens) : ""}
            onChange={(v) => set("maxTokens", v ? parseInt(v) : undefined)} placeholder="16384" />
        </Field>
      </div>

      <div>
        <SectionTitle>Cost (per million tokens)</SectionTitle>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {(["input", "output", "cacheRead", "cacheWrite"] as const).map((k) => (
            <Field key={k} label={k}>
              <NumInput value={costVal(k)} onChange={(v) => setCost(k, v)} placeholder="0" />
            </Field>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <SectionTitle>Capabilities</SectionTitle>
          <button
            onClick={onRunProbe}
            disabled={!model.id.trim() || isProbing}
            style={{
              height: 26,
              padding: "0 9px",
              border: "1px solid var(--border)",
              borderRadius: 5,
              background: "var(--bg-panel)",
              color: model.id.trim() && !isProbing ? "var(--text-muted)" : "var(--text-dim)",
              cursor: model.id.trim() && !isProbing ? "pointer" : "not-allowed",
              fontSize: 11,
            }}
          >
            {isProbing ? "Testing..." : capabilityProfile ? "Re-test" : "Test"}
          </button>
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden", background: "var(--bg-panel)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 10px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                {model.name || model.id || "new model"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>Role: {model.role || "unset"}</span>
                <span>Last tested: {capabilityProfile?.updatedAt ? new Date(capabilityProfile.updatedAt).toLocaleDateString() : "-"}</span>
              </div>
            </div>
            <span title={capabilityProfile?.testSuiteVersion !== CAPABILITY_TEST_SUITE_VERSION ? "题库已更新，可重新测试。" : "Current test suite"} style={{ fontSize: 10, color: capabilityProfile?.testSuiteVersion !== CAPABILITY_TEST_SUITE_VERSION ? "#f59e0b" : "var(--text-dim)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
              {capabilityProfile?.testSuiteVersion || CAPABILITY_TEST_SUITE_VERSION}{capabilityProfile?.testSuiteVersion && capabilityProfile.testSuiteVersion !== CAPABILITY_TEST_SUITE_VERSION ? " ⓘ" : ""}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(120px, 0.7fr) minmax(170px, 1fr)", borderBottom: "1px solid var(--border)" }}>
            {CAPABILITY_DIMENSIONS.map((dimension) => {
              const item = capabilityProfile?.dimensions?.[dimension.id];
              const result = item?.result ?? "pending";
              const runningCount = item?.tests?.filter((test) => test.status === "running").length ?? 0;
              const totalCount = item?.tests?.length ?? 0;
              return (
                <div key={dimension.id} style={{ display: "contents" }}>
                  <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text)" }}>{dimension.label}</div>
                  <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 14, marginRight: 6, color: result === "capable" ? "#16a34a" : result === "inconclusive" ? "#f59e0b" : "var(--text-dim)" }}>{resultGlyph(result)}</span>
                    {isProbing && (result === "pending" || runningCount > 0) ? `Running (${runningCount || 1}/${totalCount || 1} questions)` : resultLabel(result)}
                  </div>
                  <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45 }}>
                    {result === "inconclusive" ? (
                      <button
                        type="button"
                        onClick={() => onRetryDimension(dimension.id)}
                        disabled={isProbing}
                        style={{ height: 24, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg)", color: isProbing ? "var(--text-dim)" : "var(--text-muted)", cursor: isProbing ? "not-allowed" : "pointer", fontSize: 11 }}
                      >
                        Retry this dimension
                      </button>
                    ) : item?.confidence ? (
                      `confidence: ${item.confidence}`
                    ) : "confidence: -"}
                    {item?.notes && result !== "inconclusive" ? <div style={{ marginTop: 3 }}>{item.notes}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {capabilityProfile?.suggestedRoles?.length ? (
            <div style={{ padding: "10px", fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ color: "var(--text-dim)" }}>Suggested roles:</span>
              {capabilityProfile.suggestedRoles.map((role) => (
                <span key={role} style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "1px 7px", background: "var(--bg)", color: "var(--text-muted)" }}>{dimensionLabel(role)}</span>
              ))}
            </div>
          ) : null}
          {capabilityProfile?.summary ? (
            <div style={{ padding: "0 10px 10px", fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45 }}>{capabilityProfile.summary}</div>
          ) : null}
          {capabilityProfile ? (
            <details style={{ borderTop: "1px solid var(--border)", padding: "8px 10px" }}>
              <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}>
                View test details ({Object.values(capabilityProfile.dimensions ?? {}).flatMap((dimension) => dimension.tests ?? []).length} questions)
              </summary>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {Object.entries(capabilityProfile.dimensions ?? {}).flatMap(([dimension, item]) => (item.tests ?? []).map((test) => (
                  <div key={`${dimension}-${test.id}`} style={{ border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", padding: 8, display: "grid", gap: 5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
                      <span>{dimensionLabel(dimension)} · {test.id}</span>
                      <span>{test.status}</span>
                    </div>
                    {test.prompt ? <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4 }}>{test.prompt.slice(0, 240)}</div> : null}
                    {test.output ? <pre style={{ margin: 0, maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{test.output}</pre> : null}
                    {test.error || test.comment ? <div style={{ fontSize: 11, color: test.error ? "#f87171" : "var(--text-dim)" }}>{test.error || test.comment}</div> : null}
                  </div>
                )))}
              </div>
            </details>
          ) : null}
          {ledgerEvents.length ? (
            <div style={{ borderTop: "1px solid var(--border)", padding: "9px 10px", display: "grid", gap: 5 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Latest ledger</div>
              {ledgerEvents.slice(-5).reverse().map((event, index) => (
                <div key={event.id ?? `${event.isoTime}-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 11, color: "var(--text-muted)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: event.status === "failed" ? "#ef4444" : event.status === "running" ? "#f59e0b" : "#16a34a", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", flexShrink: 0 }}>{event.isoTime?.slice(11, 19) ?? "--:--:--"}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[event.type, event.stage, event.taskId, event.status].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── OAuth detail ──────────────────────────────────────────────────────────────

function OAuthDetail({ provider, onRefresh }: { provider: OAuthProvider; onRefresh: () => void }) {
  const [loginState, setLoginState] = useState<OAuthLoginState>({ phase: "idle" });
  const [inputValue, setInputValue] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loginState.phase === "auth" || loginState.phase === "prompt") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loginState.phase]);

  // Reset state when provider changes
  useEffect(() => {
    setLoginState({ phase: "idle" });
    setInputValue("");
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, [provider.id]);

  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  const handleLogin = useCallback(() => {
    eventSourceRef.current?.close();
    setLoginState({ phase: "connecting" });
    setInputValue("");

    const es = new EventSource(`/api/auth/login/${encodeURIComponent(provider.id)}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as {
        type: string; url?: string; instructions?: string | null;
        token?: string; message?: string; placeholder?: string | null;
        userCode?: string; verificationUri?: string; intervalSeconds?: number | null; expiresInSeconds?: number | null;
        options?: { id: string; label: string }[];
      };
      if (data.type === "auth") {
        setLoginState({ phase: "auth", url: data.url!, instructions: data.instructions ?? null, token: data.token! });
        window.open(data.url!, "_blank", "noopener,noreferrer");
      } else if (data.type === "device_code") {
        setLoginState({
          phase: "device_code",
          userCode: data.userCode!,
          verificationUri: data.verificationUri!,
          intervalSeconds: data.intervalSeconds ?? null,
          expiresInSeconds: data.expiresInSeconds ?? null,
        });
        window.open(data.verificationUri!, "_blank", "noopener,noreferrer");
      } else if (data.type === "prompt_request") {
        setLoginState({ phase: "prompt", message: data.message!, placeholder: data.placeholder ?? null, token: data.token! });
      } else if (data.type === "select_request") {
        setLoginState({ phase: "select", message: data.message!, options: data.options ?? [], token: data.token! });
      } else if (data.type === "progress") {
        setLoginState({ phase: "progress", message: data.message! });
      } else if (data.type === "success") {
        es.close();
        setLoginState({ phase: "success" });
        onRefresh();
      } else if (data.type === "error") {
        es.close();
        setLoginState({ phase: "error", message: data.message! });
      } else if (data.type === "cancelled") {
        es.close();
        setLoginState({ phase: "idle" });
      }
    };
    es.onerror = () => {
      es.close();
      setLoginState((prev) => prev.phase === "success" ? prev : { phase: "error", message: "Connection lost" });
    };
  }, [provider.id, onRefresh]);

  const handleLogout = useCallback(async () => {
    await fetch(`/api/auth/logout/${encodeURIComponent(provider.id)}`, { method: "POST" });
    setLoginState({ phase: "idle" });
    onRefresh();
  }, [provider.id, onRefresh]);

  const submitCode = useCallback(async (token: string, code: string) => {
    if (!code.trim()) return;
    setLoginState({ phase: "progress", message: "Verifying…" });
    try {
      const res = await fetch(`/api/auth/login/${encodeURIComponent(provider.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code: code.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setLoginState({ phase: "error", message: d.error ?? `Server error ${res.status}` });
        return;
      }
      setInputValue("");
      // Success path: SSE stream will emit "success" and update state
    } catch (e) {
      setLoginState({ phase: "error", message: e instanceof Error ? e.message : "Network error" });
    }
  }, [provider.id]);

  const submitSelection = useCallback(async (token: string, value: string) => {
    setLoginState({ phase: "progress", message: "Continuing…" });
    try {
      const res = await fetch(`/api/auth/login/${encodeURIComponent(provider.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code: value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setLoginState({ phase: "error", message: d.error ?? `Server error ${res.status}` });
      }
    } catch (e) {
      setLoginState({ phase: "error", message: e instanceof Error ? e.message : "Network error" });
    }
  }, [provider.id]);

  const isWorking = loginState.phase === "connecting" || loginState.phase === "progress" ||
    loginState.phase === "auth" || loginState.phase === "device_code" ||
    loginState.phase === "prompt" || loginState.phase === "select";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle>Subscription</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: provider.loggedIn ? "#4ade80" : "var(--border)", display: "inline-block" }} />
          <span style={{ fontSize: 11, color: provider.loggedIn ? "#4ade80" : "var(--text-dim)" }}>
            {provider.loggedIn ? "connected" : "not connected"}
          </span>
        </div>
      </div>

      {/* Status */}
      <div style={{ minHeight: 48 }}>
        {loginState.phase === "idle" && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {provider.loggedIn ? "Already connected. You can re-login or disconnect." : `Connect your ${provider.name} account.`}
          </p>
        )}
        {loginState.phase === "connecting" && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Opening browser…</p>
        )}
        {loginState.phase === "select" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {loginState.message}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {loginState.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => submitSelection(loginState.token, option.id)}
                  style={{ padding: "6px 9px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text)", cursor: "pointer", fontSize: 12, textAlign: "left" }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {(loginState.phase === "auth" || loginState.phase === "prompt") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {loginState.phase === "auth"
                ? "Complete sign-in in the browser, then copy the redirect URL from the address bar and paste it below."
                : loginState.message}
            </p>
            {loginState.phase === "auth" && (
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
                If the browser window did not open,{" "}
                <a href={loginState.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>
                  click here to open the login page
                </a>
                .
              </p>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitCode(loginState.token, inputValue); }}
                placeholder={loginState.phase === "auth" ? "http://localhost:1455/auth/callback?code=…" : (loginState.placeholder ?? "Enter value…")}
                style={{ flex: 1, padding: "6px 9px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text)", fontSize: 12, outline: "none", fontFamily: "var(--font-mono)", boxSizing: "border-box" }}
              />
              <button
                onClick={() => submitCode(loginState.token, inputValue)}
                disabled={!inputValue.trim()}
                style={{ padding: "6px 12px", background: inputValue.trim() ? "var(--accent)" : "var(--bg-panel)", border: "none", borderRadius: 5, color: inputValue.trim() ? "#fff" : "var(--text-dim)", cursor: inputValue.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, flexShrink: 0 }}
              >
                Submit
              </button>
            </div>
          </div>
        )}
        {loginState.phase === "device_code" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Open the verification page and enter this code:
            </p>
            <div style={{ padding: "8px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text)", fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: 0 }}>
              {loginState.userCode}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
              <a href={loginState.verificationUri} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all" }}>
                {loginState.verificationUri}
              </a>
              {loginState.expiresInSeconds ? ` Expires in ${Math.ceil(loginState.expiresInSeconds / 60)} minutes.` : ""}
            </p>
          </div>
        )}
        {loginState.phase === "progress" && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{loginState.message}</p>
        )}
        {loginState.phase === "success" && (
          <p style={{ margin: 0, fontSize: 12, color: "#4ade80" }}>Connected successfully.</p>
        )}
        {loginState.phase === "error" && (
          <p style={{ margin: 0, fontSize: 12, color: "#f87171" }}>{loginState.message}</p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {isWorking ? (
          <button
            onClick={() => { eventSourceRef.current?.close(); setLoginState({ phase: "idle" }); }}
            style={{ padding: "5px 12px", background: "none", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              onClick={handleLogin}
              style={{ padding: "5px 14px", background: "var(--accent)", border: "none", borderRadius: 5, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
            >
              {provider.loggedIn ? "Re-login" : "Login"}
            </button>
            {provider.loggedIn && (
              <button
                onClick={handleLogout}
                style={{ padding: "5px 12px", background: "none", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5, color: "#ef4444", cursor: "pointer", fontSize: 12 }}
              >
                Disconnect
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── API Key detail ────────────────────────────────────────────────────────────

function ApiKeyDetail({ provider, onRefresh }: { provider: ApiKeyProvider; onRefresh: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  // Reset state when provider changes
  useEffect(() => {
    setApiKey("");
    setError(null);
    setSavedOk(false);
  }, [provider.id]);

  const handleSave = useCallback(async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const res = await fetch(`/api/auth/api-key/${encodeURIComponent(provider.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setError(d.error ?? `HTTP ${res.status}`);
      } else {
        setApiKey("");
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
        onRefresh();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [apiKey, provider.id, onRefresh]);

  const handleRemove = useCallback(async () => {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/api-key/${encodeURIComponent(provider.id)}`, { method: "DELETE" });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) setError(d.error ?? `HTTP ${res.status}`);
      else onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setRemoving(false);
    }
  }, [provider.id, onRefresh]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle>API Key</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: provider.configured ? "#4ade80" : "var(--border)", display: "inline-block" }} />
          <span style={{ fontSize: 11, color: provider.configured ? "#4ade80" : "var(--text-dim)" }}>
            {provider.configured ? "configured" : "not configured"}
          </span>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {provider.configured
          ? `API key is stored. Enter a new key below to replace it, or disconnect to remove it.`
          : `Enter your ${provider.displayName} API key to enable ${provider.modelCount} model${provider.modelCount !== 1 ? "s" : ""}.`}
      </p>

      <Field label="API Key">
        <div style={{ display: "flex", gap: 6 }}>
          <SecretTextInput
            value={apiKey}
            onChange={setApiKey}
            onKeyDown={(e) => { if (e.key === "Enter" && apiKey.trim()) handleSave(); }}
            placeholder={provider.configured ? "Enter new key to replace…" : "sk-…"}
            style={{ flex: 1 }}
            autoComplete="off"
            spellCheck={false}
            mono
          />
          <button
            onClick={handleSave}
            disabled={saving || !apiKey.trim() || savedOk}
            style={{
              padding: "6px 12px",
              background: savedOk ? "#16a34a" : apiKey.trim() ? "var(--accent)" : "var(--bg-panel)",
              border: "none", borderRadius: 5,
              color: (apiKey.trim() || savedOk) ? "#fff" : "var(--text-dim)",
              cursor: (saving || !apiKey.trim() || savedOk) ? "not-allowed" : "pointer",
              fontSize: 12, fontWeight: 600, flexShrink: 0,
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            {savedOk && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {savedOk ? "Saved" : saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Field>

      {error && <p style={{ margin: 0, fontSize: 12, color: "#f87171" }}>{error}</p>}

      {provider.configured && (
        <button
          onClick={handleRemove}
          disabled={removing}
          style={{
            alignSelf: "flex-start", padding: "5px 12px",
            background: "none", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 5, color: "#ef4444",
            cursor: removing ? "not-allowed" : "pointer", fontSize: 12,
          }}
        >
          {removing ? "Removing…" : "Disconnect"}
        </button>
      )}
    </div>
  );
}

// ── Provider icon ─────────────────────────────────────────────────────────────

function ProviderIcon({ id, size }: { id: string; size: number }) {
  const pi = PROVIDER_ICONS[id];
  if (!pi) {
    const label = id
      .split(/[-_]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text-dim)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: Math.max(8, Math.floor(size * 0.42)),
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    );
  }
  // Color icons: self-colored SVG, no wrapper needed
  if (pi.hasColor) return <pi.Icon size={size} />;
  // Mono icons: use currentColor so they adapt to light/dark theme
  return <pi.Icon size={size} style={{ color: "var(--text-muted)" }} />;
}

// ── Add provider picker ───────────────────────────────────────────────────────

interface AddProviderPickerProps {
  oauthProviders: OAuthProvider[];
  apiKeyProviders: ApiKeyProvider[];
  onSelectOAuth: (id: string) => void;
  onSelectApiKey: (id: string) => void;
  onAddCustom: () => void;
  onAddPreset: (preset: typeof AGGREGATOR_PRESETS[number]) => void;
  onClose: () => void;
}

function AddProviderPicker({
  oauthProviders, apiKeyProviders,
  onSelectOAuth, onSelectApiKey, onAddCustom, onAddPreset, onClose,
}: AddProviderPickerProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);

  const q = search.trim().toLowerCase();

  const availableOAuth = oauthProviders.filter((p) => !p.loggedIn && (!q || p.name.toLowerCase().includes(q)));
  const availableApiKey = apiKeyProviders.filter((p) => !p.configured && (!q || p.displayName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)));
  const availableAggregators = AGGREGATOR_PRESETS.filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.includes(q) || p.baseUrl.toLowerCase().includes(q));
  const showCustom = !q || "custom".includes(q) || "openai-compatible".includes(q) || "anthropic-compatible".includes(q);

  const totalCount = availableOAuth.length + availableApiKey.length + availableAggregators.length + (showCustom ? 1 : 0);

  const cardStyle: React.CSSProperties = {
    display: "flex", flexDirection: "row", alignItems: "center", gap: 8,
    padding: "10px 12px",
    background: "var(--bg-panel)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    boxSizing: "border-box",
    cursor: "pointer",
    minWidth: 0,
    textAlign: "left",
    transition: "border-color 0.12s, background 0.12s",
    width: "100%",
  };



  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 820, maxWidth: "calc(100vw - 32px)", maxHeight: "min(72vh, calc(100vh - 32px))", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.22)", overflow: "hidden" }}>
        {/* Search */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            placeholder="Search providers…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
          />
        </div>

        {/* Card grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {totalCount === 0 ? (
            <div style={{ padding: "20px 0", fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>No providers match</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 8 }}>
              {showCustom && (
                <div style={{ gridColumn: "1 / -1", fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Custom</div>
              )}
              {showCustom && (
                <button
                  onClick={() => { onAddCustom(); onClose(); }}
                  style={cardStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-panel)"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>OpenAI / Anthropic compatible</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>Custom endpoint format</div>
                  </div>
                  <span style={{ width: 26, height: 26, borderRadius: 5, background: "var(--bg-hover)", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)" }}>
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                </button>
              )}

              {availableAggregators.length > 0 && (
                <div style={{ gridColumn: "1 / -1", paddingTop: showCustom ? 6 : 0, fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Aggregators</div>
              )}
              {availableAggregators.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => { onAddPreset(preset); onClose(); }}
                  style={cardStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-panel)"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preset.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preset.baseUrl}</div>
                  </div>
                  <ProviderIcon id={preset.id} size={28} />
                </button>
              ))}

              {availableOAuth.length > 0 && (
                <div style={{ gridColumn: "1 / -1", paddingTop: (showCustom || availableAggregators.length > 0) ? 6 : 0, fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Subscriptions</div>
              )}
              {availableOAuth.map((p) => (
                <button key={p.id} onClick={() => { onSelectOAuth(p.id); onClose(); }}
                  style={cardStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-panel)"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>OAuth</div>
                  </div>
                  <ProviderIcon id={p.id} size={28} />
                </button>
              ))}

              {availableApiKey.length > 0 && (
                <div style={{ gridColumn: "1 / -1", paddingTop: availableOAuth.length > 0 ? 6 : 0, fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.07em" }}>API Key</div>
              )}
              {availableApiKey.map((p) => (
                <button key={p.id} onClick={() => { onSelectApiKey(p.id); onClose(); }}
                  style={cardStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-panel)"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.displayName}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{p.modelCount} models</div>
                  </div>
                  <ProviderIcon id={p.id} size={28} />
                </button>
              ))}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SetupGuidePanel({
  providerCount,
  modelCount,
  weakCount,
  strongCount,
  guideLabel,
  testedCount,
  inconclusiveCount,
  onAddProvider,
  onSelectFirstProvider,
  onSelectFirstModel,
  onOpenCapabilitySummary,
}: {
  providerCount: number;
  modelCount: number;
  weakCount: number;
  strongCount: number;
  guideLabel: string | null;
  testedCount: number;
  inconclusiveCount: number;
  onAddProvider: () => void;
  onSelectFirstProvider: () => void;
  onSelectFirstModel: () => void;
  onOpenCapabilitySummary: () => void;
}) {
  const capabilityDetail = weakCount === 0
    ? "no models yet"
    : inconclusiveCount > 0 && testedCount === weakCount
      ? `${testedCount} of ${weakCount} tested · ${inconclusiveCount} inconclusive`
      : `${testedCount} of ${weakCount} tested`;
  const steps = [
    { label: "Provider", done: providerCount > 0, detail: providerCount ? `${providerCount} configured` : "missing" },
    { label: "Model", done: modelCount > 0, detail: modelCount ? `${modelCount} configured` : "missing" },
    { label: "Guide", done: Boolean(guideLabel) && strongCount > 0, detail: strongCount > 0 ? (guideLabel || "manual") : "no strong model" },
    { label: "Weak", done: weakCount > 0, detail: `${weakCount} workers` },
    {
      label: "Capability test",
      done: weakCount > 0 && testedCount === weakCount && inconclusiveCount === 0,
      detail: capabilityDetail,
      onClick: onOpenCapabilitySummary,
    },
  ];
  const primary = providerCount === 0
    ? { label: "Add provider", onClick: onAddProvider }
    : modelCount === 0
      ? { label: "Open provider", onClick: onSelectFirstProvider }
      : { label: "Open model", onClick: onSelectFirstModel };

  return (
    <div style={{ marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, background: "color-mix(in srgb, var(--bg-panel) 80%, transparent)", padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 750, color: "var(--text)" }}>Setup assistant</div>
          <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {guideLabel ? `Guide model: ${guideLabel}` : "Choose a strong guide model before workflow routing."}
          </div>
        </div>
        <button
          type="button"
          onClick={primary.onClick}
          style={{ height: 28, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)", cursor: "pointer", fontSize: 12, flexShrink: 0 }}
        >
          {primary.label}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        {steps.map((step) => (
          <button
            key={step.label}
            type="button"
            onClick={"onClick" in step ? step.onClick : undefined}
            style={{ minHeight: 48, border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg)", padding: "7px 8px", display: "grid", alignContent: "center", gap: 3, textAlign: "left", cursor: "onClick" in step ? "pointer" : "default" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: step.done ? "#16a34a" : weakCount === 0 && step.label === "Capability test" ? "var(--border)" : "#f59e0b", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{step.label}</span>
            </div>
            <div title={step.detail} style={{ fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.detail}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CapabilitySummaryView({
  items,
  onSelectModel,
  onRunProbe,
}: {
  items: Array<{ providerName: string; index: number; model: ModelEntry; profile?: CapabilityProfile; isProbing: boolean }>;
  onSelectModel: (providerName: string, index: number) => void;
  onRunProbe: (providerName: string, index: number) => void;
}) {
  const weakItems = items.filter((item) => item.model.id.trim() && item.model.role === "weak");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <SectionTitle>Capability test overview</SectionTitle>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            Compare weak models by tested capability profile.
          </div>
        </div>
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-panel)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1.2fr) repeat(4, minmax(76px, 0.6fr)) 94px", gap: 0, padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span>Model</span>
          {CAPABILITY_DIMENSIONS.slice(0, 4).map((dimension) => <span key={dimension.id}>{dimension.label}</span>)}
          <span>Action</span>
        </div>
        {weakItems.length ? weakItems.map((item) => (
          <div
            key={`${item.providerName}/${item.model.id || item.index}`}
            style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1.2fr) repeat(4, minmax(76px, 0.6fr)) 94px", alignItems: "center", gap: 0, minHeight: 44, padding: "7px 10px", borderBottom: "1px solid var(--border)" }}
          >
            <button
              type="button"
              onClick={() => onSelectModel(item.providerName, item.index)}
              style={{ border: "none", background: "transparent", color: "var(--text)", fontSize: 12, fontFamily: "var(--font-mono)", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
              title={`${item.providerName}/${item.model.id}`}
            >
              {item.providerName}/{item.model.id}
            </button>
            {CAPABILITY_DIMENSIONS.slice(0, 4).map((dimension) => {
              const result = item.profile?.dimensions?.[dimension.id]?.result ?? "pending";
              return (
                <span key={dimension.id} title={resultLabel(result)} style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  <span style={{ fontSize: 13, marginRight: 5, color: result === "capable" ? "#16a34a" : result === "inconclusive" ? "#f59e0b" : "var(--text-dim)" }}>{resultGlyph(result)}</span>
                  {resultLabel(result)}
                </span>
              );
            })}
            <button
              type="button"
              disabled={!item.model.id.trim() || item.isProbing}
              onClick={() => onRunProbe(item.providerName, item.index)}
              style={{ height: 26, border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg)", color: item.isProbing ? "var(--text-dim)" : "var(--text-muted)", cursor: item.isProbing ? "not-allowed" : "pointer", fontSize: 11 }}
            >
              {item.isProbing ? "Testing" : item.profile ? "Re-test" : "Test"}
            </button>
          </div>
        )) : (
          <div style={{ padding: 18, textAlign: "center", fontSize: 12, color: "var(--text-dim)" }}>No weak models yet.</div>
        )}
      </div>
    </div>
  );
}

function SetupGuideDrawer({
  guideMode,
  guideLabel,
  strongCount,
  providers,
  onClose,
  onAddProviderDraft,
}: {
  guideMode: GuideMode;
  guideLabel: string | null;
  strongCount: number;
  providers: string[];
  onClose: () => void;
  onAddProviderDraft: (providerName: string, modelId: string) => void;
}) {
  const [providerName, setProviderName] = useState(providers[0] ?? "openrouter");
  const [modelId, setModelId] = useState("");
  const [failures, setFailures] = useState(0);
  const canConfirm = providerName.trim().length > 0 && modelId.trim().length > 0;
  const blocked = guideMode !== "assisted" || strongCount === 0;

  return (
    <div style={{ width: 320, borderLeft: "1px solid var(--border)", background: "var(--bg-panel)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 750, color: "var(--text)" }}>Setup guide</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>{guideLabel || "manual"}</div>
        </div>
        <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", alignContent: "start", gap: 10 }}>
        {blocked ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", padding: 10, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55 }}>
            需要先有一个 strong 模型才能使用向导。你仍然可以在左侧树和右侧表单里手动配置。
          </div>
        ) : (
          <>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", padding: 10, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55 }}>
              这个模型是接到哪个 Provider 下面？填好 Provider 和模型 ID 后，我会生成确认卡片；确认前不会写入配置。
            </div>
            <Field label="Provider">
              <TextInput value={providerName} onChange={setProviderName} placeholder="openrouter" mono />
            </Field>
            <Field label="Model ID">
              <TextInput value={modelId} onChange={setModelId} placeholder="deepseek/deepseek-coder" mono />
            </Field>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", padding: 10, display: "grid", gap: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>Confirm card</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", display: "grid", gap: 3 }}>
                <span>Provider: <code style={{ fontFamily: "var(--font-mono)" }}>{providerName || "-"}</code></span>
                <span>Model: <code style={{ fontFamily: "var(--font-mono)" }}>{modelId || "-"}</code></span>
                <span>Role: weak</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={!canConfirm}
                  onClick={() => {
                    onAddProviderDraft(providerName.trim(), modelId.trim());
                    setModelId("");
                    setFailures(0);
                  }}
                  style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 6, background: canConfirm ? "var(--accent)" : "var(--bg-panel)", color: canConfirm ? "#fff" : "var(--text-dim)", cursor: canConfirm ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 650 }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setFailures((value) => value + 1)}
                  style={{ height: 28, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
                >
                  Edit
                </button>
              </div>
            </div>
            {failures >= 2 ? (
              <button type="button" onClick={onClose} style={{ height: 30, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>
                切换到表单填写
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ModelsConfig({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<ModelsJson>({ providers: {} });
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [apiKeyProviders, setApiKeyProviders] = useState<ApiKeyProvider[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [probeBusyByKey, setProbeBusyByKey] = useState<Record<string, boolean>>({});
  const [ledgerEventsByModel, setLedgerEventsByModel] = useState<Record<string, LedgerEvent[]>>({});
  const [treeFilter, setTreeFilter] = useState<TreeFilter>("all");
  const [guideMode, setGuideMode] = useState<GuideMode>("manual");
  const [guideDrawerOpen, setGuideDrawerOpen] = useState(false);

  const loadOAuthProviders = useCallback(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d: { providers: OAuthProvider[] }) => setOauthProviders(d.providers))
      .catch(() => {});
  }, []);

  const loadApiKeyProviders = useCallback(() => {
    fetch("/api/auth/all-providers")
      .then((r) => r.json())
      .then((d: { providers: ApiKeyProvider[] }) => setApiKeyProviders(d.providers))
      .catch(() => {});
  }, []);

  const loadLedgerEvents = useCallback(async (key: string) => {
    try {
      const res = await fetch(`/api/models-config/ledger?modelKey=${encodeURIComponent(key)}&limit=40`, { cache: "no-store" });
      const d = await res.json() as { ok?: boolean; events?: LedgerEvent[] };
      if (res.ok && d.ok) {
        setLedgerEventsByModel((prev) => ({ ...prev, [key]: d.events ?? [] }));
      }
    } catch {
      // Ledger is diagnostic only; do not block configuration.
    }
  }, []);

  useEffect(() => {
    fetch("/api/models-config")
      .then((r) => r.json())
      .then((d: ModelsJson) => {
        const normalized = d.providers ? d : { ...d, providers: {} };
        setConfig(normalized);
        setSavedSnapshot(JSON.stringify(normalized));
        const keys = Object.keys(normalized.providers ?? {});
        if (keys.length > 0) setSelection({ type: "provider", name: keys[0] });
      })
      .catch(() => {
        setConfig({ providers: {} });
        setSavedSnapshot(JSON.stringify({ providers: {} }));
      })
      .finally(() => setLoading(false));
    loadOAuthProviders();
    loadApiKeyProviders();
  }, [loadOAuthProviders, loadApiKeyProviders]);

  const addCustomProvider = useCallback(() => {
    let finalName = "new-provider";
    let n = 1;
    while (config.providers?.[finalName]) finalName = `new-provider-${n++}`;
    setConfig((prev) => ({ ...prev, providers: { ...(prev.providers ?? {}), [finalName]: { api: "openai-completions" } } }));
    setSelection({ type: "provider", name: finalName });
  }, [config.providers]);

  const addPresetProvider = useCallback((preset: typeof AGGREGATOR_PRESETS[number]) => {
    let finalName: string = preset.id;
    let n = 1;
    while (config.providers?.[finalName]) finalName = `${preset.id}-${n++}`;
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...(prev.providers ?? {}),
        [finalName]: {
          api: preset.api,
          baseUrl: preset.baseUrl,
          models: [{ id: "", role: "weak", capabilities: ["classification", "summarization"] }],
        },
      },
    }));
    setSelection({ type: "model", providerName: finalName, index: 0 });
  }, [config.providers]);

  const updateProvider = useCallback((name: string, p: ProviderEntry) => {
    setConfig((prev) => ({ ...prev, providers: { ...(prev.providers ?? {}), [name]: p } }));
  }, []);

  const renameProvider = useCallback((oldName: string, newName: string) => {
    setConfig((prev) => {
      const entries = Object.entries(prev.providers ?? {});
      const idx = entries.findIndex(([k]) => k === oldName);
      if (idx === -1) return prev;
      entries[idx] = [newName, entries[idx][1]];
      return { ...prev, providers: Object.fromEntries(entries) };
    });
    setSelection((prev) => {
      if (!prev) return prev;
      if (prev.type === "provider" && prev.name === oldName) return { type: "provider", name: newName };
      if (prev.type === "model" && prev.providerName === oldName) return { ...prev, providerName: newName };
      return prev;
    });
  }, []);

  const deleteProvider = useCallback((name: string) => {
    setConfig((prev) => {
      const providers = { ...(prev.providers ?? {}) };
      delete providers[name];
      return { ...prev, providers };
    });
    setConfig((prev) => {
      const remaining = Object.keys(prev.providers ?? {});
      setSelection(remaining.length > 0 ? { type: "provider", name: remaining[0] } : null);
      return prev;
    });
  }, []);

  const addModel = useCallback((providerName: string) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? []), { id: "" }];
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
    setConfig((prev) => {
      const idx = (prev.providers?.[providerName]?.models?.length ?? 1) - 1;
      setSelection({ type: "model", providerName, index: idx });
      return prev;
    });
  }, []);

  const addCatalogModel = useCallback((providerName: string, catalogModel: CatalogModel) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      if ((provider.models ?? []).some((model) => model.id === catalogModel.id)) return prev;
      const nextModel: ModelEntry = {
        id: catalogModel.id,
        name: catalogModel.name && catalogModel.name !== catalogModel.id ? catalogModel.name : undefined,
        contextWindow: catalogModel.contextWindow,
        role: "weak",
      };
      const models = [...(provider.models ?? []), nextModel];
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
    setConfig((prev) => {
      const idx = (prev.providers?.[providerName]?.models ?? []).findIndex((model) => model.id === catalogModel.id);
      if (idx >= 0) setSelection({ type: "model", providerName, index: idx });
      return prev;
    });
  }, []);

  const addAssistantModelDraft = useCallback((providerName: string, modelId: string) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? { api: "openai-completions" };
      const existingIndex = (provider.models ?? []).findIndex((model) => model.id === modelId);
      if (existingIndex >= 0) return prev;
      const models = [...(provider.models ?? []), { id: modelId, role: "weak" as const }];
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
    setConfig((prev) => {
      const idx = (prev.providers?.[providerName]?.models ?? []).findIndex((model) => model.id === modelId);
      if (idx >= 0) setSelection({ type: "model", providerName, index: idx });
      return prev;
    });
    setGuideDrawerOpen(false);
  }, []);

  const updateModel = useCallback((providerName: string, index: number, m: ModelEntry) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      models[index] = m;
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
  }, []);

  const removeModel = useCallback((providerName: string, index: number) => {
    const removed = config.providers?.[providerName]?.models?.[index];
    const removedKey = removed?.id ? modelKey(providerName, removed.id) : null;
    const isGuide = removedKey && config.modelSetup?.guideModel === removedKey;
    const confirmed = window.confirm(isGuide
      ? "删除后该模型的能力清单会一并清除；它也是当前向导，删除后会退回手动配置。是否继续？"
      : "删除后该模型的能力清单会一并清除。是否继续？");
    if (!confirmed) return;
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      models.splice(index, 1);
      const capabilityProfiles = { ...(prev.modelSetup?.capabilityProfiles ?? {}) };
      if (removedKey) delete capabilityProfiles[removedKey];
      const guideModel = prev.modelSetup?.guideModel === removedKey ? undefined : prev.modelSetup?.guideModel;
      return {
        ...prev,
        providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models: models.length ? models : undefined } },
        modelSetup: {
          ...(prev.modelSetup ?? {}),
          guideModel,
          testSuiteVersion: CAPABILITY_TEST_SUITE_VERSION,
          capabilityProfiles,
        },
      };
    });
    setSelection({ type: "provider", name: providerName });
  }, [config.providers, config.modelSetup?.guideModel]);

  const setGuideModel = useCallback((providerName: string, index: number) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName];
      const model = provider?.models?.[index];
      if (!provider || !model?.id) return prev;
      const models = [...(provider.models ?? [])];
      models[index] = { ...model, role: "strong" };
      return {
        ...prev,
        providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } },
        modelSetup: {
          ...(prev.modelSetup ?? {}),
          guideModel: modelKey(providerName, model.id),
          testSuiteVersion: CAPABILITY_TEST_SUITE_VERSION,
          capabilityProfiles: prev.modelSetup?.capabilityProfiles ?? {},
        },
      };
    });
  }, []);

  const normalizeForSave = useCallback((draft: ModelsJson): ModelsJson => {
    const providers = { ...(draft.providers ?? {}) };
    const entries = Object.entries(providers).flatMap(([providerName, provider]) => (provider.models ?? [])
      .map((model, index) => ({ providerName, provider, model, index }))
      .filter(({ model }) => model.id.trim()));
    let guideModel = draft.modelSetup?.guideModel;
    const capabilityProfiles = { ...(draft.modelSetup?.capabilityProfiles ?? {}) };

    if (!guideModel && entries.length > 0) {
      const first = entries[0];
      guideModel = modelKey(first.providerName, first.model.id);
      const models = [...(first.provider.models ?? [])];
      models[first.index] = { ...first.model, role: "strong" };
      providers[first.providerName] = { ...first.provider, models };
    }

    for (const { providerName, model } of entries) {
      const key = modelKey(providerName, model.id);
      if (model.role === "weak" && !capabilityProfiles[key]) {
        capabilityProfiles[key] = buildPendingCapabilityProfile(providerName, model, guideModel);
      }
    }

    return {
      ...draft,
      providers,
      modelSetup: {
        ...(draft.modelSetup ?? {}),
        guideModel,
        testSuiteVersion: CAPABILITY_TEST_SUITE_VERSION,
        capabilityProfiles,
      },
    };
  }, []);

  const triggerCapabilityProbe = useCallback(async (key: string, dimensions?: string[]) => {
    const runningConfig = normalizeForSave(config);
    const found = findModelInConfig(runningConfig, key);
    if (!found || !found.model.id.trim()) return;

    setProbeBusyByKey((prev) => ({ ...prev, [key]: true }));
    setSaveError(null);
    setConfig((prev) => {
      const latest = findModelInConfig(prev, key);
      if (!latest) return prev;
      const profile = {
        ...buildPendingCapabilityProfile(latest.providerName, latest.model, prev.modelSetup?.guideModel),
        status: "testing" as const,
        summary: "标准题库正在执行，完成后会写入能力画像和 Ledger。",
      };
      return {
        ...prev,
        modelSetup: {
          ...(prev.modelSetup ?? {}),
          testSuiteVersion: CAPABILITY_TEST_SUITE_VERSION,
          guideModel: prev.modelSetup?.guideModel,
          capabilityProfiles: {
            ...(prev.modelSetup?.capabilityProfiles ?? {}),
            [key]: profile,
          },
        },
      };
    });
    try {
      const res = await fetch("/api/models-config/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelKey: key, dimensions }),
      });
      const d = await res.json() as { ok?: boolean; error?: string; profile?: CapabilityProfile; config?: ModelsJson };
      if (!res.ok || !d.ok || !d.profile) {
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setConfig((prev) => {
        const nextProfiles = {
          ...(prev.modelSetup?.capabilityProfiles ?? {}),
          [key]: d.profile!,
        };
        return {
          ...prev,
          modelSetup: {
            ...(prev.modelSetup ?? {}),
            ...(d.config?.modelSetup ?? {}),
            capabilityProfiles: {
              ...(d.config?.modelSetup?.capabilityProfiles ?? {}),
              ...nextProfiles,
            },
          },
        };
      });
      if (d.config) setSavedSnapshot(JSON.stringify(d.config));
      await loadLedgerEvents(key);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      await loadLedgerEvents(key);
    } finally {
      setProbeBusyByKey((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [config, loadLedgerEvents, normalizeForSave]);

  const runCapabilityProbe = useCallback(async (providerName: string, index: number, dimensions?: string[]) => {
    const nextConfig = normalizeForSave(config);
    const model = nextConfig.providers?.[providerName]?.models?.[index];
    if (!model?.id.trim()) return;
    const key = modelKey(providerName, model.id);
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/models-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) throw new Error(d.error ?? `HTTP ${res.status}`);
      setConfig(nextConfig);
      setSavedSnapshot(JSON.stringify(nextConfig));
      await triggerCapabilityProbe(key, dimensions);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [config, normalizeForSave, triggerCapabilityProbe]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      const nextConfig = normalizeForSave(config);
      const weakProbeKeys = collectWeakModelsNeedingProbe(nextConfig, config);
      setConfig(nextConfig);
      const res = await fetch("/api/models-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) setSaveError(d.error ?? `HTTP ${res.status}`);
      else {
        setSavedSnapshot(JSON.stringify(nextConfig));
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
        for (const key of weakProbeKeys) {
          void triggerCapabilityProbe(key);
        }
      }
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }, [config, normalizeForSave, triggerCapabilityProbe]);

  const providers = Object.entries(config.providers ?? {});
  const dirty = JSON.stringify(config) !== savedSnapshot;
  const modelInventory = providers.flatMap(([providerName, provider]) => (provider.models ?? []).map((model, index) => {
    const key = model.id ? modelKey(providerName, model.id) : "";
    return { providerName, index, model, key, profile: key ? config.modelSetup?.capabilityProfiles?.[key] : undefined };
  }));
  const validModelCount = modelInventory.filter(({ model }) => model.id.trim()).length;
  const weakCount = modelInventory.filter(({ model }) => model.role === "weak" && model.id.trim()).length;
  const strongCount = modelInventory.filter(({ model }) => model.role === "strong" && model.id.trim()).length;
  const imageCount = modelInventory.filter(({ profile }) => profile?.dimensions?.["image-generation"]?.result === "capable").length;
  const testedWeakCount = modelInventory.filter(({ model, profile }) => model.role === "weak" && model.id.trim() && isProfileTested(profile)).length;
  const inconclusiveWeakCount = modelInventory.filter(({ model, profile }) => model.role === "weak" && model.id.trim() && profileHasInconclusive(profile)).length;
  const duplicateModelKeys = new Set<string>();
  const seenModelKeys = new Set<string>();
  let duplicateTarget: { providerName: string; index: number } | null = null;
  for (const { providerName, model } of modelInventory) {
    if (!model.id.trim()) continue;
    const key = modelKey(providerName, model.id);
    if (seenModelKeys.has(key)) {
      duplicateModelKeys.add(key);
      if (!duplicateTarget) {
        const index = config.providers?.[providerName]?.models?.findIndex((item) => item.id === model.id) ?? -1;
        duplicateTarget = index >= 0 ? { providerName, index } : null;
      }
    }
    seenModelKeys.add(key);
  }
  const statusLabel = duplicateModelKeys.size ? "conflict" : dirty ? "unsaved" : savedOk ? "saved" : "clean";
  const guideLabel = config.modelSetup?.guideModel ?? null;
  const setupIncomplete = !guideLabel || weakCount === 0 || strongCount === 0 || testedWeakCount < weakCount || inconclusiveWeakCount > 0;
  const activeOAuth = oauthProviders.filter((p) => p.loggedIn);
  const activeApiKey = apiKeyProviders.filter((p) => p.configured);
  const selectFirstProvider = () => {
    const first = providers[0]?.[0];
    if (first) setSelection({ type: "provider", name: first });
  };
  const selectFirstModel = () => {
    for (const [providerName, provider] of providers) {
      const index = (provider.models ?? []).findIndex((model) => model.id.trim());
      if (index >= 0) {
        setSelection({ type: "model", providerName, index });
        return;
      }
    }
    selectFirstProvider();
  };
  const selectionTitle = (() => {
    if (!selection) return "Nothing selected";
    if (selection.type === "provider") return `Provider · ${selection.name}`;
    if (selection.type === "model") {
      const model = config.providers?.[selection.providerName]?.models?.[selection.index];
      return `Model · ${selection.providerName}/${model?.id || "new model"}`;
    }
    if (selection.type === "apikey") {
      const provider = apiKeyProviders.find((item) => item.id === selection.providerId);
      return `API Key · ${provider?.displayName || selection.providerId}`;
    }
    if (selection.type === "capabilities") return "Capability tests";
    const provider = oauthProviders.find((item) => item.id === selection.providerId);
    return `OAuth · ${provider?.name || selection.providerId}`;
  })();

  // Resolve current detail
  const detailContent = (() => {
    if (!selection) return null;
    if (selection.type === "oauth") {
      const p = oauthProviders.find((p) => p.id === selection.providerId);
      if (!p) return null;
      return <OAuthDetail key={p.id} provider={p} onRefresh={loadOAuthProviders} />;
    }
    if (selection.type === "apikey") {
      const p = apiKeyProviders.find((p) => p.id === selection.providerId);
      if (!p) return null;
      return <ApiKeyDetail key={p.id} provider={p} onRefresh={loadApiKeyProviders} />;
    }
    if (selection.type === "capabilities") {
      return (
        <CapabilitySummaryView
          items={modelInventory.map((item) => ({ ...item, isProbing: Boolean(item.key && probeBusyByKey[item.key]) }))}
          onSelectModel={(providerName, index) => setSelection({ type: "model", providerName, index })}
          onRunProbe={(providerName, index) => void runCapabilityProbe(providerName, index)}
        />
      );
    }
    if (selection.type === "provider") {
      const provider = config.providers?.[selection.name];
      if (!provider) return null;
      return (
        <ProviderDetail
          key={selection.name}
          name={selection.name}
          provider={provider}
          onChange={(p) => updateProvider(selection.name, p)}
          onRename={(n) => renameProvider(selection.name, n)}
          onDelete={() => deleteProvider(selection.name)}
          onAddModel={() => addModel(selection.name)}
          onAddCatalogModel={(model) => addCatalogModel(selection.name, model)}
          onSelectModel={(index) => setSelection({ type: "model", providerName: selection.name, index })}
          onSave={() => void handleSave()}
          saving={saving}
          savedOk={savedOk}
          dirty={dirty}
        />
      );
    }
    const provider = config.providers?.[selection.providerName];
    const model = provider?.models?.[selection.index];
    if (!model) return null;
    return (
      <ModelDetail
        key={`${selection.providerName}-${selection.index}`}
        providerName={selection.providerName}
        provider={provider}
        model={model}
        isGuide={config.modelSetup?.guideModel === modelKey(selection.providerName, model.id)}
        capabilityProfile={model.id ? config.modelSetup?.capabilityProfiles?.[modelKey(selection.providerName, model.id)] : undefined}
        ledgerEvents={model.id ? ledgerEventsByModel[modelKey(selection.providerName, model.id)] ?? [] : []}
        isProbing={model.id ? Boolean(probeBusyByKey[modelKey(selection.providerName, model.id)]) : false}
        onChange={(m) => updateModel(selection.providerName, selection.index, m)}
        onSetGuide={() => setGuideModel(selection.providerName, selection.index)}
        onRunProbe={() => void runCapabilityProbe(selection.providerName, selection.index)}
        onRetryDimension={(dimension) => void runCapabilityProbe(selection.providerName, selection.index, [dimension])}
        onDelete={() => removeModel(selection.providerName, selection.index)}
      />
    );
  })();

  return (
    <>
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 860, height: "78vh", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Models</span>
              <code style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>~/.pi/agent/models.json</code>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {([
                ["weak", weakCount],
                ["strong", strongCount],
                ["image", imageCount],
              ] as const).map(([filter, count]) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setTreeFilter((prev) => prev === filter ? "all" : filter)}
                  style={{ fontSize: 10, color: count ? "#16a34a" : filter === "strong" ? "#f59e0b" : "var(--text-dim)", border: `1px solid ${treeFilter === filter ? "var(--accent)" : filter === "strong" && !count ? "#f59e0b" : "var(--border)"}`, borderRadius: 5, padding: "2px 6px", background: treeFilter === filter ? "color-mix(in srgb, var(--accent) 10%, var(--bg-panel))" : "transparent", cursor: "pointer" }}
                >
                  {filter} {count}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (duplicateTarget) {
                    setSelection({ type: "model", providerName: duplicateTarget.providerName, index: duplicateTarget.index });
                  }
                }}
                style={{ fontSize: 10, color: statusLabel === "conflict" ? "#ef4444" : statusLabel === "unsaved" ? "#f59e0b" : savedOk ? "#16a34a" : "var(--text-dim)", border: `1px solid ${statusLabel === "conflict" ? "#ef4444" : "var(--border)"}`, borderRadius: 5, padding: "2px 6px", background: "transparent", cursor: statusLabel === "conflict" ? "pointer" : "default" }}
              >
                {statusLabel}
              </button>
              <select
                value={guideMode}
                onChange={(event) => {
                  const next = event.target.value as GuideMode;
                  setGuideMode(next);
                  setGuideDrawerOpen(next === "assisted");
                }}
                title={guideLabel || "No guide model"}
                style={{ maxWidth: 152, height: 22, fontSize: 10, color: guideLabel ? "#0a84ff" : "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 5, padding: "0 5px", background: "var(--bg)", outline: "none" }}
              >
                <option value="manual">guide: manual</option>
                <option value="assisted">guide: assisted</option>
              </select>
              {guideMode === "assisted" && (
                <button type="button" onClick={() => setGuideDrawerOpen((open) => !open)} title="Open setup guide" style={{ width: 22, height: 22, border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg)", color: "var(--text-dim)", cursor: "pointer", fontSize: 11 }}>
                  ◆
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span title={selectionTitle} style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "var(--text-muted)" }}>{selectionTitle}</span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Left: tree */}
          <div style={{ width: 210, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, background: "var(--bg-panel)" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              {/* Active OAuth subscriptions */}
              {activeOAuth.map((p) => {
                const isSelected = selection?.type === "oauth" && selection.providerId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelection({ type: "oauth", providerId: p.id })}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 5, cursor: "pointer", background: isSelected ? "var(--bg-selected)" : "none" }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "none"; }}
                  >
                    <ProviderIcon id={p.id} size={16} />
                    <span style={{ fontSize: 12, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  </div>
                );
              })}

              {/* Active API key providers */}
              {activeApiKey.map((p) => {
                const isSelected = selection?.type === "apikey" && selection.providerId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelection({ type: "apikey", providerId: p.id })}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 5, cursor: "pointer", background: isSelected ? "var(--bg-selected)" : "none" }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "none"; }}
                  >
                    <ProviderIcon id={p.id} size={16} />
                    <span style={{ fontSize: 12, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.displayName}</span>
                  </div>
                );
              })}

              {/* Divider before custom providers, only when there are active managed providers */}
              {(activeOAuth.length > 0 || activeApiKey.length > 0) && providers.length > 0 && (
                <div style={{ margin: "4px 8px", borderTop: "1px solid var(--border)" }} />
              )}

              {/* Custom providers */}
              {loading ? (
                <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
              ) : providers.map(([pName, pData]) => {
                const isProviderSelected = selection?.type === "provider" && selection.name === pName;
                const models = pData.models ?? [];
                return (
                  <div key={pName} style={{ marginBottom: 2 }}>
                    {/* Provider row */}
                    <div
                      onClick={() => setSelection({ type: "provider", name: pName })}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 8px", borderRadius: 5, cursor: "pointer", background: isProviderSelected ? "var(--bg-selected)" : "none" }}
                      onMouseEnter={(e) => { if (!isProviderSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { if (!isProviderSelected) e.currentTarget.style.background = "none"; }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-dim)", flexShrink: 0 }}>
                        <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
                        <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                        <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                        <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                        <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
                      </svg>
                      <span style={{ fontSize: 12, fontWeight: isProviderSelected ? 600 : 400, color: "var(--text)", fontFamily: "var(--font-mono)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pName}
                      </span>
                    </div>

                    {/* Model rows */}
                    {models.map((m, i) => {
                      const isModelSelected = selection?.type === "model" && selection.providerName === pName && selection.index === i;
                      const key = m.id ? modelKey(pName, m.id) : "";
                      const profile = key ? config.modelSetup?.capabilityProfiles?.[key] : undefined;
                      const matchesFilter = modelMatchesFilter(m, profile, treeFilter);
                      const testing = Boolean(key && probeBusyByKey[key]) || profile?.status === "testing";
                      const dotColor = !profile
                        ? "transparent"
                        : testing
                          ? "#f59e0b"
                          : profileHasCapable(profile)
                            ? "#16a34a"
                            : profileHasOnlyNonCapableResults(profile)
                              ? "#f59e0b"
                              : "var(--border)";
                      return (
                        <div
                          key={i}
                          onClick={() => setSelection({ type: "model", providerName: pName, index: i })}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 26px", borderRadius: 5, cursor: "pointer", background: isModelSelected ? "var(--bg-selected)" : "none", opacity: matchesFilter ? 1 : 0.38 }}
                          onMouseEnter={(e) => { if (!isModelSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                          onMouseLeave={(e) => { if (!isModelSelected) e.currentTarget.style.background = "none"; }}
                        >
                          <span
                            title={capabilityTooltip(profile)}
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              border: profile ? `1px solid ${dotColor}` : "1px solid transparent",
                              background: profile && !testing ? dotColor : "transparent",
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: m.id ? "var(--text-muted)" : "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.id || "new model"}
                          </span>
                          {key && config.modelSetup?.guideModel === key && (
                            <span title="当前向导" style={{ width: 7, height: 7, borderRadius: 999, background: "#0a84ff", flexShrink: 0 }} />
                          )}
                          {m.reasoning && (
                            <span style={{ fontSize: 9, padding: "1px 4px", background: "rgba(99,102,241,0.12)", color: "rgba(99,102,241,0.8)", borderRadius: 3, flexShrink: 0 }}>T</span>
                          )}
                          {m.role && (
                            <span style={{ fontSize: 9, padding: "1px 4px", background: m.role === "strong" ? "rgba(20,184,166,0.12)" : "rgba(234,179,8,0.14)", color: m.role === "strong" ? "#0f766e" : "#a16207", borderRadius: 3, flexShrink: 0 }}>
                              {m.role === "strong" ? "S" : "W"}
                            </span>
                          )}
                          {((m.capabilities ?? []).includes("image-generation") || (m.output ?? []).includes("image")) && (
                            <span style={{ fontSize: 9, padding: "1px 4px", background: "rgba(236,72,153,0.12)", color: "#be185d", borderRadius: 3, flexShrink: 0 }}>IMG</span>
                          )}
                        </div>
                      );
                    })}

                    {/* Add model button */}
                    <div
                      onClick={(e) => { e.stopPropagation(); addModel(pName); }}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px 4px 26px", borderRadius: 5, cursor: "pointer", color: "var(--text-dim)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
                    >
                      <span style={{ fontSize: 11 }}>+ model</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add provider */}
            <div style={{ borderTop: "1px solid var(--border)", padding: "8px 6px" }}>
              <button onClick={() => setPickerOpen(true)} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                width: "100%", padding: "6px 0", background: "none", border: "1px dashed var(--border)", borderRadius: 5,
                color: "var(--text-muted)", cursor: "pointer", fontSize: 12,
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                + Add provider
              </button>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
            {/* Right: detail */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20, minWidth: 0 }}>
              {loading ? null : (
                <>
                  {setupIncomplete && (
                    <SetupGuidePanel
                      providerCount={providers.length}
                      modelCount={validModelCount}
                      weakCount={weakCount}
                      strongCount={strongCount}
                      guideLabel={guideLabel}
                      testedCount={testedWeakCount}
                      inconclusiveCount={inconclusiveWeakCount}
                      onAddProvider={() => setPickerOpen(true)}
                      onSelectFirstProvider={selectFirstProvider}
                      onSelectFirstModel={selectFirstModel}
                      onOpenCapabilitySummary={() => setSelection({ type: "capabilities" })}
                    />
                  )}
                  {detailContent ?? (
                    <div style={{ height: "100%", display: "grid", alignContent: "center", justifyItems: "center", gap: 10, color: "var(--text-dim)", fontSize: 13, textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Select a provider or model</div>
                      <div style={{ maxWidth: 360, lineHeight: 1.6 }}>Choose an existing provider on the left, or add a provider and then add at least one model to test.</div>
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        style={{ marginTop: 4, height: 30, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
                      >
                        + Add provider
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            {guideDrawerOpen && (
              <SetupGuideDrawer
                guideMode={guideMode}
                guideLabel={guideLabel}
                strongCount={strongCount}
                providers={providers.map(([name]) => name)}
                onClose={() => setGuideDrawerOpen(false)}
                onAddProviderDraft={addAssistantModelDraft}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "10px 18px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          {saveError ? (
            <span style={{ fontSize: 12, color: "#f87171", flex: 1 }}>{saveError}</span>
          ) : (
            <span style={{ fontSize: 12, color: dirty ? "#f59e0b" : "var(--text-muted)", flex: 1 }}>
              {dirty ? "You have unsaved model configuration changes." : "Model configuration is up to date."}
            </span>
          )}
          <button onClick={onClose} style={{ padding: "6px 14px", background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || savedOk || !dirty} style={{
            position: "relative",
            padding: "6px 16px",
            minWidth: 92,
            background: savedOk ? "#16a34a" : saving || !dirty ? "var(--bg-panel)" : "var(--accent)",
            border: "none", borderRadius: 6,
            color: savedOk ? "#fff" : saving || !dirty ? "var(--text-muted)" : "#fff",
            cursor: (saving || savedOk || !dirty) ? "default" : "pointer", fontSize: 13, fontWeight: 600,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "background-color 0.2s ease, color 0.2s ease",
            animation: savedOk ? "saved-pop 0.45s ease" : undefined,
          }}>
            {savedOk && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 18, animation: "saved-check-draw 0.35s ease forwards", flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span>{savedOk ? "Saved" : saving ? "Saving…" : "Save"}</span>
          </button>
        </div>
      </div>
    </div>
    {pickerOpen && (
      <AddProviderPicker
        oauthProviders={oauthProviders}
        apiKeyProviders={apiKeyProviders}
        onSelectOAuth={(id) => setSelection({ type: "oauth", providerId: id })}
        onSelectApiKey={(id) => setSelection({ type: "apikey", providerId: id })}
        onAddCustom={addCustomProvider}
        onAddPreset={addPresetProvider}
        onClose={() => setPickerOpen(false)}
      />
    )}
    </>
  );
}
