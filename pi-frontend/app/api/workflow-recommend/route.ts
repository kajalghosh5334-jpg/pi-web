import type { WorkflowDefinition, WorkflowTaskDefinition } from "@/lib/types";

interface AgentProfileItem {
  id: string;
  name?: string;
  defaultModel?: string;
  projectConfig?: {
    modelTier?: string;
    domain?: string;
    roleInWorkflow?: string;
  };
}

interface Recommendation {
  workflow: WorkflowDefinition;
  score: number;
  reasons: string[];
}

const FLASH_MODEL = "opencode-go/deepseek-v4-flash";

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "self-media": ["自媒体", "选题", "脚本", "标题", "封面", "评论", "完播", "互动", "小红书", "抖音", "视频", "图文"],
  ecommerce: ["电商", "商品", "listing", "评价", "库存", "定价", "大促", "海报", "淘宝", "亚马逊", "seo"],
  "customer-support": ["客服", "工单", "咨询", "投诉", "知识库", "转人工", "质检", "售后", "用户对话"],
  research: ["行业", "调研", "竞品", "新闻", "财报", "政策", "访谈", "舆情", "风险", "监控"],
  sales: ["销售", "电话", "线索", "客户", "crm", "异议", "跟进", "通话", "意向", "简报"],
};

const TEMPLATE_KEYWORDS: Record<string, string[]> = {
  "fetch-summarize": ["抓取", "搜集", "监控", "摘要", "简报", "报告", "复盘", "调研", "新闻", "评论"],
  "generate-variants": ["生成", "多版", "版本", "文案", "脚本", "标题", "封面", "海报", "改写", "草稿"],
  "classify-route": ["分类", "分级", "路由", "标签", "回复", "优先级", "派发", "审核", "转人工"],
  "monitor-alert": ["监控", "告警", "预警", "异常", "风险", "阈值", "变化", "定时", "库存", "舆情"],
  "extract-writeback": ["提取", "抽取", "结构化", "字段", "回写", "crm", "纪要", "表单", "校验"],
};

function normalizeText(value: string | undefined) {
  return (value || "").toLowerCase();
}

function keywordScore(input: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => score + (input.includes(keyword.toLowerCase()) ? 1 : 0), 0);
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

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const input = normalizeText(typeof body?.task === "string" ? body.task.trim() : "");
  if (!input) return Response.json({ error: "Task is required" }, { status: 400 });

  const [workflowData, profileData] = await Promise.all([
    fetchJson<{ workflows?: WorkflowDefinition[] }>("http://127.0.0.1:3000/api/workflows", { workflows: [] }),
    fetchJson<{ profiles?: AgentProfileItem[] }>("http://127.0.0.1:3000/api/agent-profiles", { profiles: [] }),
  ]);
  const workflows = (workflowData.workflows || []).filter((workflow) => workflow.status !== "legacy");
  const profiles = profileData.profiles || [];
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

  const best = activeRecommendations[0] || templateRecommendations[0] || null;
  const decision = best && best.score >= 54
    ? "use-existing"
    : templateRecommendations[0]
      ? "customize-template"
      : "create-from-profiles";
  const selectedTemplate = templateRecommendations[0]?.workflow || null;
  const selectedWorkflow = best?.workflow || selectedTemplate;

  return Response.json({
    model: FLASH_MODEL,
    mode: "flash-routing",
    decision,
    inferred: {
      domain: domain.domain,
      templateType: template.templateType || selectedTemplate?.templateType || "",
      confidence: Math.min(0.96, Math.max(0.42, ((best?.score || 30) / 100))),
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
    profilePlan: selectedWorkflow ? profilePlan(selectedWorkflow, profiles) : [],
    guidance: [
      decision === "use-existing" ? "直接选择推荐 workflow，在主界面输入任务材料后运行。" : "用推荐模板新建 workflow，先保留节点结构，再微调行业术语和验收标准。",
      "弱模型节点适合抓取、分类、抽取、草稿；强模型节点保留在策略、风险判断和最终复核。",
      "保存时选择已有行业分类；如果你的业务线不在列表里，新建分类并复用模板类型。",
    ],
  });
}
