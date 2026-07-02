import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import type { WorkflowDefinition, WorkflowTaskDefinition } from "@/lib/types";
import { defaultInputContractForTemplate } from "@/lib/workflowInputContracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgentProfileItem {
  id: string;
  name?: string;
  description?: string;
  defaultModel?: string;
  projectConfig?: {
    modelTier?: string;
    domain?: string;
    roleInWorkflow?: string;
    profileKind?: string;
  };
}

interface Recommendation {
  workflow: WorkflowDefinition;
  score: number;
  reasons: string[];
}

interface FlashWorkflowDecision {
  decision?: "use-existing" | "customize-template" | "create-from-profiles";
  workflowId?: string;
  matchReason?: string;
  generationReason?: string;
  workflow?: Partial<WorkflowDefinition>;
  tasks?: WorkflowTaskDefinition[];
  profilePlan?: Array<{
    id: string;
    name?: string;
    tier?: string;
    model?: string;
    role?: string;
  }>;
  guidance?: string[];
}

const FLASH_MODEL = "opencode-go/deepseek-v4-flash";
const STRONG_EXISTING_THRESHOLD = 62;
const TEMPLATE_MATCH_THRESHOLD = 42;
const FLASH_TIMEOUT_MS = 45000;
const WORKFLOW_BACKEND = "http://127.0.0.1:3000";
const FORBIDDEN_TERMS = ["训练样本", "标准样本", "真实训练", "训练验证", "样本对齐"];

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "self-media": ["自媒体", "选题", "脚本", "标题", "封面", "评论", "完播", "互动", "小红书", "抖音", "视频", "图文"],
  ecommerce: ["电商", "商品", "listing", "评价", "库存", "大促", "海报", "淘宝", "亚马逊", "seo"],
  "customer-support": ["客服", "工单", "咨询", "投诉", "知识库", "转人工", "质检", "售后", "用户对话"],
  research: ["行业", "调研", "竞品", "新闻", "财报", "政策", "访谈", "舆情", "风险", "监控", "搜索", "融资", "轮次", "金额", "量子", "初创", "定价", "功能对比", "差异矩阵", "选型", "cursor", "copilot", "windsurf", "tesla", "特斯拉", "fsd", "监管"],
  sales: ["销售", "电话", "线索", "客户", "crm", "异议", "跟进", "通话", "意向", "简报"],
  "job-search": ["求职", "简历", "面试", "offer", "jd", "公司调研", "岗位", "跳槽", "背调"],
};

const TEMPLATE_KEYWORDS: Record<string, string[]> = {
  "fetch-summarize": ["抓取", "搜集", "搜索", "监控", "摘要", "简报", "报告", "复盘", "调研", "新闻", "评论", "融资", "轮次", "金额", "定价", "对比", "差异矩阵", "选型"],
  "classify-route": ["分类", "分级", "路由", "标签", "回复", "优先级", "派发", "审核", "转人工", "复核", "队列", "风险清单", "投诉"],
  "generate-variants": ["多版", "版本", "文案", "脚本", "标题", "封面", "海报", "改写", "草稿", "a/b", "ab测试"],
  "monitor-alert": ["监控", "告警", "预警", "异常", "风险", "阈值", "变化", "定时", "库存", "舆情", "48 小时", "48小时", "事故", "监管", "高级告警"],
  "extract-writeback": ["提取", "抽取", "结构化", "字段", "回写", "crm", "纪要", "表单", "校验"],
};

const TEMPLATE_RECIPES: Record<string, {
  appliesTo: string[];
  nodes: Array<{
    type: string;
    label: string;
    profileId: string;
  }>;
}> = {
  "fetch-summarize": {
    appliesTo: ["行业调研", "信息监控", "竞品追踪"],
    nodes: [
      { type: "Fetch", label: "资料搜集", profileId: "weak-research-extractor" },
      { type: "Structure", label: "结构化提取", profileId: "weak-structured-operator" },
      { type: "Judge", label: "影响判断与摘要", profileId: "research-report-analyst" },
    ],
  },
  "classify-route": {
    appliesTo: ["客服票据", "评论区分级", "工单路由"],
    nodes: [
      { type: "Standardize", label: "输入标准化", profileId: "weak-structured-operator" },
      { type: "Classify", label: "分类打标", profileId: "classification-router" },
      { type: "Generate", label: "自动处理草稿", profileId: "support-kb-responder" },
      { type: "Review", label: "风险审查", profileId: "strong-quality-reviewer" },
    ],
  },
  "extract-writeback": {
    appliesTo: ["CRM回写", "发票处理", "表单录入"],
    nodes: [
      { type: "Standardize", label: "输入整理", profileId: "weak-structured-operator" },
      { type: "Extract", label: "字段抽取", profileId: "structured-writeback-operator" },
      { type: "Action", label: "写回Payload", profileId: "structured-writeback-operator" },
      { type: "Review", label: "风险审查", profileId: "strong-quality-reviewer" },
    ],
  },
  "generate-variants": {
    appliesTo: ["A/B测试", "标题封面", "广告文案"],
    nodes: [
      { type: "Plan", label: "生成策略", profileId: "strong-task-architect" },
      { type: "Generate", label: "批量变体生成", profileId: "content-draft-producer" },
      { type: "Review", label: "质量审查", profileId: "content-editor-reviewer" },
    ],
  },
  "monitor-alert": {
    appliesTo: ["舆情监控", "库存预警", "价格波动"],
    nodes: [
      { type: "Gather", label: "事件窗口整理", profileId: "weak-research-extractor" },
      { type: "Classify", label: "触发判断与分级", profileId: "monitor-alert-operator" },
      { type: "Review", label: "重度告警审查", profileId: "strong-quality-reviewer" },
    ],
  },
};

function normalizeText(value: string | undefined) {
  return (value || "").toLowerCase();
}

function cleanInlineText(value: unknown, maxLength = 180) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function stripForbidden(value: string) {
  return FORBIDDEN_TERMS.reduce((text, term) => text.replaceAll(term, ""), value);
}

function keywordScore(input: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => score + (input.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

function relevantTerms(input: string) {
  const seedTerms = [
    ...Object.values(DOMAIN_KEYWORDS).flat(),
    ...Object.values(TEMPLATE_KEYWORDS).flat(),
    "2025", "2025h1", "h1", "上半年", "全球", "初创公司", "应用方向",
    "cursor", "github", "copilot", "windsurf", "devin", "pricing", "plans",
    "reddit", "twitter", "x", "tesla", "特斯拉", "fsd", "v13", "nhtsa",
  ];
  const inputTokens = input
    .split(/[\s,，。；;:：/、+()（）「」"'`]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2);
  return [...new Set([
    ...seedTerms.map((term) => term.toLowerCase()).filter((term) => input.includes(term)),
    ...inputTokens,
  ])];
}

function taskText(task: WorkflowTaskDefinition) {
  return [
    task.name,
    task.profileId,
    task.model,
    task.prompt,
    task.definitionOfDone,
    ...(task.acceptanceCriteria || []),
  ].filter(Boolean).join(" ");
}

function workflowText(workflow: WorkflowDefinition) {
  return [
    workflow.name,
    workflow.description,
    workflow.domain,
    workflow.category,
    workflow.templateType,
    ...(workflow.tasks || []).map(taskText),
  ].filter(Boolean).join(" ").toLowerCase();
}

function inferDomain(input: string) {
  let best = { domain: "generic", score: 0 };
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywordScore(input, keywords);
    if (score > best.score) best = { domain, score };
  }
  return best;
}

function inferTemplateType(input: string) {
  let best = { templateType: "", score: 0 };
  for (const [templateType, keywords] of Object.entries(TEMPLATE_KEYWORDS)) {
    const score = keywordScore(input, keywords);
    if (score > best.score) best = { templateType, score };
  }
  return best;
}

function scoreWorkflow(workflow: WorkflowDefinition, input: string, domain: string, templateType: string): Recommendation {
  const text = workflowText(workflow);
  const reasons: string[] = [];
  let score = 0;

  if (domain !== "generic" && workflow.domain === domain) {
    score += 36;
    reasons.push(`行业匹配：${workflow.category || workflow.domain}`);
  }
  if (templateType && workflow.templateType === templateType) {
    score += 30;
    reasons.push(`流程类型匹配：${templateType}`);
  }

  const domainHits = workflow.domain ? keywordScore(input, DOMAIN_KEYWORDS[workflow.domain] || []) : 0;
  if (domainHits > 0) {
    score += Math.min(18, domainHits * 4);
    reasons.push(`命中 ${domainHits} 个行业关键词`);
  }

  const templateHits = workflow.templateType ? keywordScore(input, TEMPLATE_KEYWORDS[workflow.templateType] || []) : 0;
  if (templateHits > 0) {
    score += Math.min(18, templateHits * 4);
    reasons.push(`命中 ${templateHits} 个任务模式关键词`);
  }

  const inputTokens = input.split(/[\s,，。；;:：/、]+/).filter((token) => token.length >= 2);
  const overlap = inputTokens.filter((token) => text.includes(token)).length;
  if (overlap > 0) {
    score += Math.min(16, overlap * 3);
    reasons.push(`与 workflow 描述/节点有 ${overlap} 处语义重合`);
  }

  const termHits = relevantTerms(input).filter((term) => text.includes(term));
  if (termHits.length > 0) {
    score += Math.min(32, termHits.length * 5);
    reasons.push(`命中 ${termHits.length} 个关键语义词`);
  }

  if (workflow.id?.startsWith("case-") && termHits.length >= 3) {
    score += 16;
    reasons.push("命中真实案例 workflow");
  }

  const hasStrongReview = (workflow.tasks || []).some((task) => {
    const haystack = `${task.profileId || ""} ${task.model || ""} ${task.name || ""}`.toLowerCase();
    return haystack.includes("strong") || haystack.includes("review") || haystack.includes("pro") || haystack.includes("analyst") || haystack.includes("director");
  });
  if (hasStrongReview) {
    score += 6;
    reasons.push("包含强模型复核或高阶判断节点");
  }

  return { workflow, score, reasons: reasons.slice(0, 4) };
}

function semanticTermHits(workflow: WorkflowDefinition, input: string) {
  const text = workflowText(workflow);
  return relevantTerms(input).filter((term) => text.includes(term));
}

function canUseExistingWorkflow(workflow: WorkflowDefinition, score: number, input: string, domain: string) {
  if (score < STRONG_EXISTING_THRESHOLD) return false;
  if (domain !== "generic") return workflow.domain === domain;
  const hits = semanticTermHits(workflow, input);
  return score >= 90 && hits.length >= 6;
}

function canUseTemplateWorkflow(workflow: WorkflowDefinition, score: number, templateType: string) {
  if (workflow.status !== "template") return false;
  if (!templateType || workflow.templateType !== templateType) return false;
  return score >= TEMPLATE_MATCH_THRESHOLD;
}

function profilePlan(workflow: WorkflowDefinition, profiles: AgentProfileItem[]) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const seen = new Set<string>();
  return (workflow.tasks || [])
    .map((task) => task.profileId)
    .filter((profileId): profileId is string => Boolean(profileId))
    .filter((profileId) => {
      if (seen.has(profileId)) return false;
      seen.add(profileId);
      return true;
    })
    .slice(0, 5)
    .map((profileId) => {
      const profile = profileMap.get(profileId);
      return {
        id: profileId,
        name: profile?.name || profileId,
        tier: profile?.projectConfig?.modelTier || (profile?.defaultModel?.includes("flash") ? "weak" : profile?.defaultModel?.includes("pro") ? "strong" : "unknown"),
        model: profile?.defaultModel || "按 workflow 节点配置",
        role: profile?.projectConfig?.roleInWorkflow || "workflow-node",
      };
    });
}

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return fallback;
    return await res.json().catch(() => fallback);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

function compactWorkflowCatalog(workflows: WorkflowDefinition[]) {
  return workflows
    .filter((workflow) => workflow.status !== "legacy")
    .slice(0, 40)
    .map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      description: cleanInlineText(workflow.description, 180),
      status: workflow.status || "active",
      domain: workflow.domain || workflow.category || "generic",
      templateType: workflow.templateType || "",
      taskCount: workflow.tasks?.length || 0,
      profiles: [...new Set((workflow.tasks || []).map((task) => task.profileId).filter(Boolean))].slice(0, 8),
      nodeNames: (workflow.tasks || []).map((task) => task.name || task.id || "").filter(Boolean).slice(0, 8),
    }));
}

function compactProfileCatalog(profiles: AgentProfileItem[]) {
  const preferred = new Set([
    "weak-research-extractor",
    "weak-structured-operator",
    "classification-router",
    "structured-writeback-operator",
    "content-draft-producer",
    "support-kb-responder",
    "research-report-analyst",
    "sales-call-analyst",
    "content-strategy-director",
    "strong-task-architect",
    "strong-quality-reviewer",
    "content-editor-reviewer",
    "monitor-alert-operator",
    "general-executor",
  ]);
  return profiles
    .filter((profile) => preferred.has(profile.id) || profile.projectConfig?.profileKind === "workflow-node")
    .slice(0, 36)
    .map((profile) => ({
      id: profile.id,
      name: profile.name || profile.id,
      model: profile.defaultModel || "",
      tier: profile.projectConfig?.modelTier || (profile.defaultModel?.includes("pro") ? "strong" : "weak"),
      domain: profile.projectConfig?.domain || "generic",
      role: profile.projectConfig?.roleInWorkflow || "",
      description: cleanInlineText(profile.description, 160),
    }));
}

function buildFlashPrompt(input: string, workflows: WorkflowDefinition[], profiles: AgentProfileItem[], domain: string, templateType: string) {
  const templateRecipes = Object.fromEntries(Object.entries(TEMPLATE_RECIPES).map(([id, recipe]) => [
    id,
    {
      appliesTo: recipe.appliesTo,
      chain: recipe.nodes.map((node) => `${node.label}(${node.type}) -> ${node.profileId}`),
    },
  ]));
  return [
    "你是 Workflow 主界面的 Flash 路由助手。本次调用是全新干净上下文，只能使用下面注入的 catalog 和用户需求，不得引用外部记忆。",
    "",
    "目标：先搜索当前 Workflow 数据库；精确匹配到业务 workflow 就复用；精确匹配不到时选择模板 workflow；模板也不匹配时才用通用 Profile 组合一个可保存的新 workflow。",
    "",
    "硬性规则：",
    "1. 先判断已有业务 workflow 是否精确匹配。只有当行业、任务目标、输入输出和节点结构都接近时，才 decision=use-existing。",
    "2. 如果没有精确业务 workflow，但能匹配一个 template workflow，decision=customize-template，并返回该 template workflowId。",
    "3. 如果 template 也不匹配，decision=create-from-profiles，并且必须先选择一个 template recipe，再严格按该 recipe 的节点链生成 workflow。",
    "4. 所有新建 workflow 都必须是单次输入输出型：一次输入资料/窗口/对象列表，一次输出报告、矩阵、payload、草稿、分级或裁决；不得设计成长期后台守护进程。",
    "5. 节点必须沿用通用类型：Gather/Fetch、Standardize、Classify/Route、Extract/Validate、Generate/Draft、Analyze/Judge、Strategize/Plan、Review/Gate、Writeback/Action、Monitor/Alert。",
    "6. 弱模型负责资料搬运、结构化、分类、字段抽取、草稿和轻量告警；强模型只用于策略、复杂判断和最终门禁。",
    "7. prompt 要写清楚上游输入、下游输出、不得编造事实、缺失信息如何标记、何时转人工/强审查。",
    "8. template-fetch-summarize 必须是资料搜集(Fetch) -> 结构化提取(Structure) -> 影响判断与摘要(Judge)。",
    "9. template-classify-route 必须是输入标准化(Standardize) -> 分类打标(Classify) -> 自动处理草稿(Generate) -> 风险审查(Review)。",
    "10. template-extract-writeback 必须是输入整理(Standardize) -> 字段抽取(Extract) -> 写回Payload(Action) -> 风险审查(Review)。",
    "11. template-generate-variants 必须是生成策略(Plan) -> 批量变体生成(Generate) -> 质量审查(Review)。",
    "12. template-monitor-alert 必须是事件窗口整理(Gather) -> 触发判断与分级(Classify) -> 重度告警审查(Review)。",
    "13. 不要出现训练、样本、标准答案、调试记录等内部词。",
    "14. 只输出 JSON 对象，不要 Markdown，不要解释。",
    "",
    "JSON schema:",
    JSON.stringify({
      decision: "use-existing | customize-template | create-from-profiles",
      workflowId: "existing or template workflow id when use-existing/customize-template",
      matchReason: "why existing or template workflow is enough",
      generationReason: "why a new workflow is needed",
      workflow: {
        name: "short name",
        description: "what this workflow completes",
        domain,
        templateType: templateType || "fetch-summarize",
        leadProfileId: "strong-task-architect",
        reviewPolicy: "lead_only | lead_plus_reviewer",
        tasks: [
          {
            id: "ascii-kebab-id",
            name: "node name",
            profileId: "profile id from catalog",
            model: FLASH_MODEL,
            deps: ["previous-task-id"],
            prompt: "node instruction",
            acceptanceCriteria: ["criterion"],
            definitionOfDone: "done condition",
          },
        ],
      },
      profilePlan: [{ id: "profile id", tier: "weak | strong", role: "node role" }],
      guidance: ["one-line usage guidance"],
    }),
    "",
    `用户需求：${input}`,
    `本地推断：domain=${domain}; templateType=${templateType || "unknown"}`,
    "",
    "Template recipes:",
    JSON.stringify(templateRecipes),
    "",
    "Workflow catalog:",
    JSON.stringify(compactWorkflowCatalog(workflows)),
    "",
    "Profile catalog:",
    JSON.stringify(compactProfileCatalog(profiles)),
  ].join("\n");
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {}

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  for (let start = trimmed.indexOf("{"); start >= 0; start = trimmed.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") inString = true;
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, index + 1));
        } catch {
          break;
        }
      }
    }
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const contentParts: string[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const content = event.content || event.text || event.message;
      if (typeof content === "string") contentParts.push(content);
      if (Array.isArray(content)) {
        contentParts.push(...content.map((part) => typeof part === "string" ? part : (part as { text?: string }).text || ""));
      }
    } catch {}
  }
  return contentParts.length ? extractJsonObject(contentParts.join("\n")) : null;
}

async function askFlashForWorkflow(input: string, workflows: WorkflowDefinition[], profiles: AgentProfileItem[], domain: string, templateType: string) {
  const sessionDir = await mkdtemp(join(tmpdir(), "pi-workflow-recommend-"));
  const prompt = buildFlashPrompt(input, workflows, profiles, domain, templateType);
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const proc = spawn("pi", [
        "--print",
        "--mode",
        "json",
        "--model",
        FLASH_MODEL,
        "--no-session",
        "--session-dir",
        sessionDir,
        "--no-context-files",
        "--no-tools",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        prompt,
      ], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PI_CODING_AGENT_SESSION_DIR: sessionDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("Flash recommendation timed out"));
      }, FLASH_TIMEOUT_MS);
      proc.stdout.on("data", (chunk) => { stdout += String(chunk); });
      proc.stderr.on("data", (chunk) => { stderr += String(chunk); });
      proc.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(stderr.trim() || `Flash exited with code ${code}`));
          return;
        }
        resolve(stdout || stderr);
      });
    });
    return extractJsonObject(output) as FlashWorkflowDecision | null;
  } finally {
    await rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  }
}

function slug(value: string, fallback: string) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
  return ascii || fallback;
}

function profileModel(profileId: string, profileMap: Map<string, AgentProfileItem>) {
  return profileMap.get(profileId)?.defaultModel || (profileId.includes("strong") || profileId.includes("director") || profileId.includes("reviewer") || profileId.includes("analyst")
    ? "opencode-go/deepseek-v4-pro"
    : FLASH_MODEL);
}

function sanitizeTasks(tasks: WorkflowTaskDefinition[] | undefined, profileMap: Map<string, AgentProfileItem>, templateType: string) {
  const usedIds = new Set<string>();
  return (tasks || [])
    .slice(0, 8)
    .map((task, index) => {
      const profileId = task.profileId && profileMap.has(task.profileId) ? task.profileId : fallbackProfileForTemplate(templateType, index);
      const fallbackId = `node-${index + 1}`;
      let id = slug(String(task.id || task.name || fallbackId), fallbackId);
      while (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);
      const deps = Array.isArray(task.deps) ? task.deps.map((dep) => slug(String(dep), "")).filter((dep) => usedIds.has(dep)) : [];
      return {
        id,
        name: stripForbidden(cleanInlineText(task.name || `Workflow Node ${index + 1}`, 64)),
        profileId,
        model: task.model || profileModel(profileId, profileMap),
        deps: index === 0 ? [] : (deps.length ? deps : [Array.from(usedIds)[index - 1]].filter(Boolean)),
        prompt: stripForbidden(cleanInlineText(task.prompt || "执行本节点任务，输出结构化结果；缺失信息必须标记 unknown，不得编造。", 900)),
        definitionOfDone: stripForbidden(cleanInlineText(task.definitionOfDone || "输出满足本节点验收标准，且保留缺失项和风险项。", 220)),
        acceptanceCriteria: (Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [])
          .map((item) => stripForbidden(cleanInlineText(item, 120)))
          .filter(Boolean)
          .slice(0, 6),
        noTools: task.noTools,
      };
    })
    .filter((task) => task.name && task.profileId);
}

function fallbackProfileForTemplate(templateType: string, index: number) {
  const chain = (TEMPLATE_RECIPES[templateType] || TEMPLATE_RECIPES["fetch-summarize"]).nodes.map((node) => node.profileId);
  return chain[Math.min(index, chain.length - 1)];
}

function templateRecipeProfileIds(templateType: string) {
  return (TEMPLATE_RECIPES[templateType] || TEMPLATE_RECIPES["fetch-summarize"]).nodes.map((node) => node.profileId);
}

function followsTemplateRecipe(tasks: WorkflowTaskDefinition[] | undefined, templateType: string) {
  const expectedProfiles = templateRecipeProfileIds(templateType);
  if (!Array.isArray(tasks) || tasks.length !== expectedProfiles.length) return false;
  return tasks.every((task, index) => task.profileId === expectedProfiles[index]);
}

function deterministicWorkflow(input: string, domain: string, templateType: string, profileMap: Map<string, AgentProfileItem>): Partial<WorkflowDefinition> {
  const type = templateType || "fetch-summarize";
  const domainLabel = domain === "generic" ? "通用" : domain;
  const taskTemplates: Record<string, WorkflowTaskDefinition[]> = {
    "fetch-summarize": [
      { id: "gather-facts", name: "资料搜集与事实搬运", profileId: "weak-research-extractor", prompt: "从用户提供的资料、链接、文件或工具结果中抽取可定位事实；每条事实必须包含来源、原文锚点、不确定点和复核建议。不得凭记忆补新闻、数字、链接或媒体名。", acceptanceCriteria: ["包含来源", "包含事实列表", "标记不确定点", "无来源输出 source_status=missing/unverified"] },
      { id: "standardize-pack", name: "资料包标准化", profileId: "weak-structured-operator", prompt: "把上游事实整理为统一资料包 schema，按主题去重归类；缺失字段保持 unknown，不猜测。", acceptanceCriteria: ["输出统一 schema", "保留来源字段", "缺失字段不猜测"] },
      { id: "judge-summary", name: "影响判断与摘要", profileId: "research-report-analyst", prompt: "基于事实包输出摘要、影响判断、证据锚点、置信度和反证条件。对未验证来源不得下高置信结论。", acceptanceCriteria: ["区分事实/推断/建议", "包含证据锚点", "包含置信度", "包含反证条件"] },
    ],
    "classify-route": [
      { id: "standardize-input", name: "输入标准化", profileId: "weak-structured-operator", prompt: "将用户输入整理为可分类条目，保留原文、来源、上下文字段；缺失项保持 unknown。", acceptanceCriteria: ["条目化输入", "保留原文", "缺失项不猜测"] },
      { id: "classify-route", name: "分类打标与路由", profileId: "classification-router", prompt: "按固定标签输出分类、confidence、emotion/risk、route_target 和人工审核原因。低置信度、高风险或标签冲突必须转人工。", acceptanceCriteria: ["包含标签", "包含 confidence", "包含 route_target", "低置信度转人工"] },
      { id: "draft-response", name: "自动处理草稿", profileId: "support-kb-responder", prompt: "基于分类结果生成可编辑处理草稿；不得新增上游未支持事实、案例或数字；素材不足时输出占位符和待补信息。", acceptanceCriteria: ["草稿引用上游依据", "风险项不自动放行", "素材不足有占位符"] },
      { id: "review-gate", name: "风险审查与放行", profileId: "strong-quality-reviewer", prompt: "检查分类、路由和草稿是否满足成功标准，输出 publish/pass、rework 或 blocked 的明确裁决，并列出返工节点。", acceptanceCriteria: ["给出明确裁决", "列出问题清单", "指定返工节点"] },
    ],
    "extract-writeback": [
      { id: "standardize-input", name: "输入整理", profileId: "weak-structured-operator", prompt: "把非结构化材料整理为字段抽取输入包，保留原文段落和来源。", acceptanceCriteria: ["输入包结构统一", "保留原文锚点", "缺失项不猜测"] },
      { id: "extract-validate", name: "字段抽取与校验", profileId: "structured-writeback-operator", prompt: "抽取目标字段、校验格式和必填项，输出字段映射、payload、幂等键和原文锚点；不确定字段标记 needs_review。", acceptanceCriteria: ["包含字段映射", "包含 payload", "包含幂等键", "不确定字段转人工"] },
      { id: "writeback-payload", name: "写回 Payload 生成", profileId: "structured-writeback-operator", prompt: "生成最终写回 payload、字段校验结果和失败重试建议。必填项缺失必须阻塞，不允许默认为 0 或空。", acceptanceCriteria: ["包含写回 payload", "包含校验结果", "必填缺失阻塞"] },
      { id: "review-gate", name: "写回风险审查", profileId: "strong-quality-reviewer", prompt: "审查写回 payload 的字段完整性、来源锚点和高风险写入动作，输出通过/返工/阻塞裁决。", acceptanceCriteria: ["给出明确裁决", "标记高风险动作", "列出返工字段"] },
    ],
    "generate-variants": [
      { id: "strategy-plan", name: "生成策略规划", profileId: "strong-task-architect", prompt: "根据用户目标定义生成方向、约束、成功指标和执行优先级；只做策略，不写长文案，不编造案例、金额或转化率。", acceptanceCriteria: ["包含策略方向", "包含约束", "包含验证指标"] },
      { id: "draft-variants", name: "批量变体生成", profileId: "content-draft-producer", prompt: "依据上游策略和素材生成可编辑初稿/变体；不得新增未支持事实、案例或数字；素材不足用占位符标记。", acceptanceCriteria: ["输出多版本", "遵守素材边界", "包含待审风险"] },
      { id: "review-gate", name: "质量审查与定稿", profileId: "content-editor-reviewer", prompt: "审查变体是否符合定位、事实边界和发布风险，输出发布/返工/阻塞裁决及返工分配。", acceptanceCriteria: ["给出明确裁决", "指出事实风险", "指定返工节点"] },
    ],
    "monitor-alert": [
      { id: "event-window-gather", name: "事件窗口整理", profileId: "weak-research-extractor", prompt: "整理监控窗口内的事件、指标、来源和时间戳；没有来源的变化标记 unverified。", acceptanceCriteria: ["包含时间窗口", "包含事件列表", "包含来源状态"] },
      { id: "alert-classify", name: "触发判断与分级", profileId: "monitor-alert-operator", prompt: "基于阈值和证据判断是否触发告警，输出轻/中/重分级、触发原因、建议动作和升级条件；不得自行执行高风险动作。", acceptanceCriteria: ["包含触发原因", "包含分级", "包含升级条件", "高风险动作不执行"] },
      { id: "severe-alert-review", name: "重度告警审查", profileId: "strong-quality-reviewer", prompt: "仅审查中重度或证据冲突告警，输出升级/观察/驳回裁决、证据缺口和下一步处理人。", acceptanceCriteria: ["给出明确裁决", "包含证据缺口", "包含下一步处理"] },
    ],
  };
  return {
    name: `Custom ${domain}-${type}：${cleanInlineText(input, 28) || "自定义 Workflow"}`,
    description: `根据用户需求自动生成的 ${domainLabel} ${type} workflow；先由弱模型完成结构化处理，再由强模型处理策略/审查节点。`,
    domain,
    category: domain,
    templateType: type,
    inputContract: defaultInputContractForTemplate(type),
    leadProfileId: "strong-task-architect",
    reviewPolicy: "lead_plus_reviewer",
    tasks: sanitizeTasks(taskTemplates[type] || taskTemplates["fetch-summarize"], profileMap, type),
  };
}

function sanitizeWorkflowDraft(
  draft: Partial<WorkflowDefinition> | undefined,
  input: string,
  domain: string,
  templateType: string,
  profileMap: Map<string, AgentProfileItem>,
) {
  const fallback = deterministicWorkflow(input, domain, templateType, profileMap);
  const effectiveTemplateType = cleanInlineText(draft?.templateType || fallback.templateType || templateType || "fetch-summarize", 60);
  const candidateTasks = sanitizeTasks(draft?.tasks || fallback.tasks, profileMap, effectiveTemplateType);
  const tasks = followsTemplateRecipe(candidateTasks, effectiveTemplateType)
    ? candidateTasks
    : (fallback.tasks || []);
  const rawName = stripForbidden(cleanInlineText(draft?.name || fallback.name || "Custom Workflow", 80));
  const name = /^[a-z0-9][a-z0-9\s:-]*：/i.test(rawName)
    ? rawName
    : `Custom ${domain}-${effectiveTemplateType}：${rawName}`;
  return {
    name,
    description: stripForbidden(cleanInlineText(draft?.description || fallback.description || "", 400)),
    status: "active" as const,
    debugStatus: "unverified" as const,
    domain: stripForbidden(cleanInlineText(draft?.domain || domain || fallback.domain || "generic", 80)),
    category: stripForbidden(cleanInlineText(draft?.category || draft?.domain || domain || fallback.category || "generic", 80)),
    templateType: effectiveTemplateType,
    inputContract: draft?.inputContract?.fields?.length ? draft.inputContract : defaultInputContractForTemplate(effectiveTemplateType),
    leadProfileId: profileMap.has(String(draft?.leadProfileId || "")) ? draft?.leadProfileId : "strong-task-architect",
    reviewPolicy: draft?.reviewPolicy === "lead_only" ? "lead_only" as const : "lead_plus_reviewer" as const,
    tasks: tasks.length ? tasks : fallback.tasks,
  };
}

async function saveGeneratedWorkflow(workflow: Partial<WorkflowDefinition>) {
  const res = await fetch(`${WORKFLOW_BACKEND}/api/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workflow),
  });
  if (!res.ok) throw new Error(`保存生成 Workflow 失败：HTTP ${res.status}`);
  const data = await res.json().catch(() => ({})) as { workflow?: WorkflowDefinition };
  if (!data.workflow) throw new Error("保存生成 Workflow 失败：响应缺少 workflow");
  if (!data.workflow.inputContract?.fields?.length && workflow.inputContract?.fields?.length) {
    const patchRes = await fetch(`${WORKFLOW_BACKEND}/api/workflows/${encodeURIComponent(data.workflow.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputContract: workflow.inputContract }),
    });
    const patchData = await patchRes.json().catch(() => ({})) as { workflow?: WorkflowDefinition };
    if (patchRes.ok && patchData.workflow) return patchData.workflow;
  }
  return data.workflow;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const input = normalizeText(typeof body?.task === "string" ? body.task.trim() : "");
  if (!input) return Response.json({ error: "Task is required" }, { status: 400 });

  const [workflowData, profileData] = await Promise.all([
    fetchJson<{ workflows?: WorkflowDefinition[] }>(`${WORKFLOW_BACKEND}/api/workflows`, { workflows: [] }),
    fetchJson<{ profiles?: AgentProfileItem[] }>(`${WORKFLOW_BACKEND}/api/agent-profiles`, { profiles: [] }),
  ]);
  const workflows = (workflowData.workflows || []).filter((workflow) => workflow.status !== "legacy");
  const profiles = profileData.profiles || [];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const domain = inferDomain(input);
  const template = inferTemplateType(input);

  const activeRecommendations = workflows
    .filter((workflow) => workflow.status !== "template")
    .map((workflow) => scoreWorkflow(workflow, input, domain.domain, template.templateType))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const templateRecommendations = workflows
    .filter((workflow) => workflow.status === "template")
    .map((workflow) => scoreWorkflow(workflow, input, "generic", template.templateType))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (activeRecommendations[0] && canUseExistingWorkflow(activeRecommendations[0].workflow, activeRecommendations[0].score, input, domain.domain)) {
    return Response.json({
      model: FLASH_MODEL,
      mode: "catalog-search",
      cleanContext: true,
      decision: "use-existing",
      searchSummary: "已先检索当前 Workflow 数据库，最高匹配达到直接复用阈值。",
      inferred: {
        domain: domain.domain,
        templateType: template.templateType || activeRecommendations[0].workflow.templateType || "",
        confidence: Math.min(0.96, Math.max(0.56, activeRecommendations[0].score / 100)),
      },
      recommendations: activeRecommendations.map((item) => ({
        workflow: item.workflow,
        score: item.score,
        reasons: item.reasons,
      })),
      templateRecommendations: templateRecommendations.map((item) => ({
        workflow: item.workflow,
        score: item.score,
        reasons: item.reasons,
      })),
      profilePlan: profilePlan(activeRecommendations[0].workflow, profiles),
      guidance: [
        "已命中现有 workflow，点击打开后在 workflow 界面输入本次任务材料运行。",
        "弱模型节点处理采集、结构化、分类、草稿；强模型节点保留在策略、判断和终审。",
      ],
    });
  }

  const topTemplateRecommendation = templateRecommendations.find((item) => canUseTemplateWorkflow(item.workflow, item.score, template.templateType));
  if (topTemplateRecommendation) {
    return Response.json({
      model: FLASH_MODEL,
      mode: "template-catalog-search",
      cleanContext: true,
      decision: "customize-template",
      searchSummary: "已先检索当前 Workflow 数据库，未找到精确业务 workflow；已匹配到通用模板 workflow。",
      inferred: {
        domain: domain.domain,
        templateType: topTemplateRecommendation.workflow.templateType || template.templateType || "",
        confidence: Math.min(0.9, Math.max(0.52, topTemplateRecommendation.score / 100)),
      },
      recommendations: activeRecommendations.map((item) => ({
        workflow: item.workflow,
        score: item.score,
        reasons: item.reasons,
      })),
      templateRecommendations: [
        topTemplateRecommendation,
        ...templateRecommendations.filter((item) => item.workflow.id !== topTemplateRecommendation.workflow.id),
      ].map((item) => ({
        workflow: item.workflow,
        score: item.score,
        reasons: item.reasons,
      })),
      profilePlan: profilePlan(topTemplateRecommendation.workflow, profiles),
      guidance: [
        "未找到精确业务 workflow，建议先打开匹配模板，再在 workflow 界面按本次材料运行或微调节点。",
        "如果模板入口字段仍无法覆盖需求，再由通用 Profile 生成新的 workflow。",
      ],
    });
  }

  let flashDecision: FlashWorkflowDecision | null = null;
  let flashError = "";
  try {
    flashDecision = await askFlashForWorkflow(input, workflows, profiles, domain.domain, template.templateType || templateRecommendations[0]?.workflow.templateType || "");
  } catch (error) {
    flashError = error instanceof Error ? error.message : String(error);
  }

  const flashWorkflowId = cleanInlineText(flashDecision?.workflowId, 120);
  const flashExisting = flashWorkflowId
    ? workflows.find((workflow) => workflow.id === flashWorkflowId && workflow.status !== "template")
    : null;
  const flashTemplate = flashWorkflowId
    ? workflows.find((workflow) => workflow.id === flashWorkflowId && workflow.status === "template")
    : null;

  if (flashDecision?.decision === "use-existing" && flashExisting) {
    const selected = scoreWorkflow(flashExisting, input, domain.domain, template.templateType);
    if (!canUseExistingWorkflow(flashExisting, selected.score, input, domain.domain)) {
      flashDecision = {
        ...flashDecision,
        decision: "create-from-profiles",
        generationReason: "Flash 命中的已有 workflow 只满足模板相似，行业/输入输出语义不足，改用通用 Profile 生成。",
      };
    } else {
      const recommendations = [
        selected,
        ...activeRecommendations.filter((item) => item.workflow.id !== flashExisting.id),
      ].slice(0, 3);
      return Response.json({
        model: FLASH_MODEL,
        mode: "flash-catalog-search",
        cleanContext: true,
        decision: "use-existing",
        searchSummary: flashDecision.matchReason || "Flash 在干净上下文中检索 catalog 后选择复用已有 workflow。",
        inferred: {
          domain: domain.domain,
          templateType: flashExisting.templateType || template.templateType || "",
          confidence: Math.min(0.95, Math.max(0.6, selected.score / 100)),
        },
        recommendations: recommendations.map((item) => ({
          workflow: item.workflow,
          score: item.score,
          reasons: item.reasons,
        })),
        templateRecommendations: templateRecommendations.map((item) => ({
          workflow: item.workflow,
          score: item.score,
          reasons: item.reasons,
        })),
        profilePlan: profilePlan(flashExisting, profiles),
        guidance: flashDecision.guidance?.length ? flashDecision.guidance : [
          "已由 Flash 复核 catalog 后命中已有 workflow，点击打开即可进入 workflow 界面。",
        ],
      });
    }
  }

  if (flashDecision?.decision === "customize-template" && flashTemplate) {
    const selected = scoreWorkflow(flashTemplate, input, "generic", template.templateType);
    if (canUseTemplateWorkflow(flashTemplate, selected.score, template.templateType || flashTemplate.templateType || "")) {
      const orderedTemplates = [
        { workflow: flashTemplate, score: selected.score, reasons: selected.reasons },
        ...templateRecommendations.filter((item) => item.workflow.id !== flashTemplate.id),
      ].slice(0, 3);
      return Response.json({
        model: FLASH_MODEL,
        mode: "flash-template-catalog-search",
        cleanContext: true,
        decision: "customize-template",
        searchSummary: flashDecision.matchReason || "Flash 在干净上下文中未找到精确业务 workflow，选择匹配模板 workflow。",
        inferred: {
          domain: domain.domain,
          templateType: flashTemplate.templateType || template.templateType || "",
          confidence: Math.min(0.9, Math.max(0.52, selected.score / 100)),
        },
        recommendations: activeRecommendations.map((item) => ({
          workflow: item.workflow,
          score: item.score,
          reasons: item.reasons,
        })),
        templateRecommendations: orderedTemplates.map((item) => ({
          workflow: item.workflow,
          score: item.score,
          reasons: item.reasons,
        })),
        profilePlan: profilePlan(flashTemplate, profiles),
        guidance: flashDecision.guidance?.length ? flashDecision.guidance : [
          "已由 Flash 复核 catalog 后命中模板 workflow，点击打开即可按入口字段提交本次材料。",
        ],
      });
    }
  }

  const selectedTemplateType = template.templateType || flashDecision?.workflow?.templateType || templateRecommendations[0]?.workflow.templateType || "fetch-summarize";
  const generatedDraft = sanitizeWorkflowDraft(
    {
      ...(flashDecision?.workflow || {}),
      tasks: flashDecision?.workflow?.tasks || flashDecision?.tasks,
    },
    input,
    domain.domain,
    selectedTemplateType,
    profileMap,
  );
  const generatedWorkflow = await saveGeneratedWorkflow(generatedDraft);
  const selectedTemplate = templateRecommendations[0]?.workflow || null;

  return Response.json({
    model: FLASH_MODEL,
    mode: flashDecision ? "flash-create-from-profiles" : "fallback-create-from-profiles",
    cleanContext: true,
    decision: "create-from-profiles",
    searchSummary: "已先检索当前 Workflow 数据库，未找到足够匹配的可复用 workflow。",
    generationReason: flashDecision?.generationReason || (flashError ? `Flash 调用失败，已使用同一套通用节点规则保底生成：${flashError}` : "当前需求需要由通用 Profile 重新组合。"),
    inferred: {
      domain: generatedWorkflow.domain || domain.domain,
      templateType: generatedWorkflow.templateType || selectedTemplateType,
      confidence: 0.58,
    },
    recommendations: activeRecommendations.map((item) => ({
      workflow: item.workflow,
      score: item.score,
      reasons: item.reasons,
    })),
    templateRecommendations: templateRecommendations.map((item) => ({
      workflow: item.workflow,
      score: item.score,
      reasons: item.reasons,
    })),
    generatedWorkflow,
    profilePlan: profilePlan(generatedWorkflow, profiles),
    guidance: flashDecision?.guidance?.length ? flashDecision.guidance : [
      "已根据通用 Profile 生成并保存新的 workflow，点击打开后可以继续微调节点。",
      selectedTemplate ? `可参考模板「${selectedTemplate.name}」的节点形态继续收敛验收标准。` : "弱模型节点负责可验证的小任务，强模型节点负责最终审查和复杂判断。",
    ],
  });
}
