import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflows = JSON.parse(readFileSync(join(__dirname, "..", "workflows.json"), "utf-8"));
const profiles = JSON.parse(readFileSync(join(__dirname, "..", "agent-profiles.json"), "utf-8"));
const modelsPath = join(homedir(), ".pi", "agent", "models.json");
const configuredModels = (() => {
  if (!existsSync(modelsPath)) return null;
  const config = JSON.parse(readFileSync(modelsPath, "utf-8"));
  const set = new Set();
  for (const [provider, entry] of Object.entries(config.providers || {})) {
    for (const model of entry.models || []) {
      if (model?.id) set.add(`${provider}/${model.id}`);
    }
  }
  return set;
})();

const SAMPLE_INPUTS = {
  "self-media": "我是一个职场成长账号，想围绕 AI 提效做近 7 天选题、标题和脚本测试。",
  research: "请监控 AI Agent 行业近 7 天新闻、融资、政策和竞品动态，输出结构化研究简报。",
  ecommerce: "这是一款便携咖啡机，请根据商品参数、竞品价格和用户评价优化 listing 与大促文案。",
  "customer-support": "这些是新增客服工单和用户对话，请分类优先级，自动回复低风险问题，并标记需要人工处理的情况。",
  sales: "这是一段 B2B SaaS 销售通话转写，请提取意向度、异议点、下一步动作并准备 CRM 回填。",
  generic: "根据输入资料完成该模板类型对应的抓取、结构化、生成、分类、告警或回写任务。",
};

const TEMPLATE_REQUIREMENTS = {
  "fetch-summarize": {
    names: ["抓取-摘要"],
    weakRoles: ["research", "operator", "alert-operator", "writeback-operator"],
    mustText: ["来源", "结构", "摘要"],
  },
  "generate-variants": {
    names: ["生成-多版本"],
    weakRoles: ["drafting", "listing-operator", "operator"],
    mustText: ["变体", "草稿", "标题", "文案", "版本"],
  },
  "classify-route": {
    names: ["分类-路由"],
    weakRoles: ["classifier-router", "support-operator", "operator"],
    mustText: ["分类", "标签", "路由", "置信", "人工"],
  },
  "monitor-alert": {
    names: ["监控-告警"],
    weakRoles: ["alert-operator", "research", "operator"],
    mustText: ["监控", "告警", "阈值", "异常", "分级"],
  },
  "extract-writeback": {
    names: ["结构化回写"],
    weakRoles: ["writeback-operator", "operator"],
    mustText: ["字段", "校验", "回写", "原文", "payload"],
  },
};

function taskText(task) {
  return [
    task.id,
    task.name,
    task.prompt,
    task.definitionOfDone,
    ...(task.acceptanceCriteria || []),
  ].filter(Boolean).join("\n");
}

function profileRole(profile) {
  return profile?.projectConfig?.roleInWorkflow
    || profile?.projectConfig?.roleInWeakStrongWorkflow
    || profile?.projectConfig?.pattern
    || profile?.projectConfig?.modelTier
    || "unknown";
}

function profileTier(profile) {
  return profile?.projectConfig?.modelTier || "unknown";
}

function modelExists(model) {
  if (!model || !configuredModels) return true;
  return configuredModels.has(model);
}

function evaluateWorkflow(id, workflow) {
  const gaps = [];
  const warnings = [];
  const tasks = Array.isArray(workflow.tasks) ? workflow.tasks : [];
  const isTemplate = workflow.status === "template" || id.startsWith("template-");
  const domain = workflow.domain || (isTemplate ? "generic" : "");
  const sampleInput = SAMPLE_INPUTS[domain] || SAMPLE_INPUTS.generic;
  const taskIds = new Set(tasks.map((task) => task.id).filter(Boolean));
  const tiers = new Set();
  const profileDomains = new Set();
  const roles = new Set();
  const allTaskText = tasks.map(taskText).join("\n");

  if (workflow.status === "legacy") return null;
  if (!workflow.name) gaps.push("P0: missing workflow name");
  if (!workflow.description || workflow.description.length < 12) gaps.push("P1: description is too thin");
  if (!workflow.templateType || !TEMPLATE_REQUIREMENTS[workflow.templateType]) gaps.push("P0: unknown or missing templateType");
  if (!isTemplate && !domain) gaps.push("P0: missing domain");
  if (tasks.length < 3) gaps.push("P0: fewer than three executable tasks");

  tasks.forEach((task, index) => {
    const profile = profiles[task.profileId];
    if (!task.id) gaps.push(`P0: task ${index + 1} missing id`);
    if (!task.name) gaps.push(`P1: task ${task.id || index + 1} missing name`);
    if (!profile) {
      gaps.push(`P0: task ${task.id || index + 1} references missing profile ${task.profileId || "(none)"}`);
      return;
    }
    if (task.model && !modelExists(task.model)) {
      gaps.push(`P0: ${task.id || index + 1} references unconfigured model ${task.model}`);
    }
    if (profile.defaultModel && !modelExists(profile.defaultModel)) {
      gaps.push(`P0: profile ${profile.id} default model is unconfigured: ${profile.defaultModel}`);
    }
    tiers.add(profileTier(profile));
    roles.add(profileRole(profile));
    if (profile.projectConfig?.domain) profileDomains.add(profile.projectConfig.domain);
    if (!task.prompt || task.prompt.length < 16) gaps.push(`P0: ${task.id} prompt is too thin`);
    if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length < 3) gaps.push(`P0: ${task.id} needs at least three acceptance criteria`);
    for (const dep of task.deps || []) {
      if (!taskIds.has(dep)) gaps.push(`P0: ${task.id} depends on missing task ${dep}`);
    }
    if (index > 0 && !(task.deps || []).length) warnings.push(`P2: ${task.id} has no dependency and may run without upstream context`);
  });

  if (!tiers.has("weak")) gaps.push("P0: workflow has no weak-model task");
  if (!tiers.has("strong")) gaps.push("P0: workflow has no strong-model task");

  const lastTask = tasks[tasks.length - 1];
  const lastProfile = profiles[lastTask?.profileId];
  const lastTier = profileTier(lastProfile);
  const lastText = taskText(lastTask || {});
  if (lastTier !== "strong" && !/人工|review|审查|复核|审批|final/i.test(lastText)) {
    gaps.push(`P1: final task ${lastTask?.id || "(none)"} is not strong and does not declare review/escalation`);
  }

  const requirement = TEMPLATE_REQUIREMENTS[workflow.templateType];
  if (requirement) {
    const hasWeakRole = [...roles].some((role) => requirement.weakRoles.includes(role));
    if (!hasWeakRole) gaps.push(`P1: template ${workflow.templateType} lacks expected weak role (${requirement.weakRoles.join("/")})`);
    const missingTerms = requirement.mustText.filter((term) => !allTaskText.includes(term));
    if (missingTerms.length >= 3) gaps.push(`P1: template ${workflow.templateType} text misses core terms: ${missingTerms.join(", ")}`);
  }

  if (!isTemplate && profileDomains.size) {
    const foreignDomains = [...profileDomains].filter((item) => item !== domain);
    if (foreignDomains.length && foreignDomains.length === profileDomains.size) {
      gaps.push(`P1: all domain-specific profiles point away from workflow domain ${domain}: ${foreignDomains.join(", ")}`);
    } else if (foreignDomains.length) {
      warnings.push(`P2: mixed domain-specific profiles: ${foreignDomains.join(", ")}`);
    }
  }

  const hasSourceAnchor = /来源|原文|证据|source|anchor|链接|数据/.test(allTaskText);
  if (["fetch-summarize", "extract-writeback", "monitor-alert"].includes(workflow.templateType) && !hasSourceAnchor) {
    gaps.push("P1: workflow should preserve sources/evidence anchors");
  }

  const hasManualGate = /人工|审核|复核|审批|升级|escalat|manual/i.test(allTaskText);
  if (["classify-route", "monitor-alert", "extract-writeback"].includes(workflow.templateType) && !hasManualGate) {
    gaps.push("P1: workflow should declare manual review/escalation gate");
  }

  const score = Math.max(0, 100 - gaps.reduce((sum, gap) => sum + (gap.startsWith("P0") ? 18 : 8), 0) - warnings.length * 2);
  return {
    id,
    name: workflow.name,
    status: workflow.status || "active",
    domain,
    templateType: workflow.templateType,
    sampleInput,
    score,
    usable: score >= 85 && !gaps.some((gap) => gap.startsWith("P0")),
    tiers: [...tiers],
    roles: [...roles],
    gaps,
    warnings,
  };
}

const results = Object.entries(workflows)
  .map(([id, workflow]) => evaluateWorkflow(id, workflow))
  .filter(Boolean);

const summary = {
  checked: results.length,
  usable: results.filter((item) => item.usable).length,
  failing: results.filter((item) => !item.usable).map((item) => ({
    id: item.id,
    score: item.score,
    gaps: item.gaps,
    warnings: item.warnings,
  })),
  byDomain: {},
};

for (const result of results) {
  const key = result.domain || "unknown";
  summary.byDomain[key] ||= { total: 0, usable: 0 };
  summary.byDomain[key].total += 1;
  if (result.usable) summary.byDomain[key].usable += 1;
}

console.log(JSON.stringify({ summary, results }, null, 2));

assert.equal(summary.failing.length, 0, `${summary.failing.length} workflows failed usability checks`);
