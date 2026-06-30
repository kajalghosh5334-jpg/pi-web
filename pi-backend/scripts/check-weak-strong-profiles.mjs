import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const profileStore = join(__dirname, "..", "agent-profiles.json");
const workflowStore = join(__dirname, "..", "workflows.json");
const profiles = JSON.parse(readFileSync(profileStore, "utf-8"));
const workflows = JSON.parse(readFileSync(workflowStore, "utf-8"));

const requiredProfiles = [
  "strong-task-architect",
  "weak-research-extractor",
  "weak-structured-operator",
  "weak-test-enumerator",
  "strong-quality-reviewer",
  "content-strategy-director",
  "content-researcher",
  "content-draft-producer",
  "content-editor-reviewer",
  "ecommerce-listing-optimizer",
  "support-kb-responder",
  "research-report-analyst",
  "classification-router",
  "monitor-alert-operator",
  "structured-writeback-operator",
  "sales-call-analyst",
];

const requiredWorkflows = [
  "self-media-content-pipeline",
  "ecommerce-listing-optimization",
  "support-kb-response-pipeline",
  "industry-research-brief",
  "template-fetch-summarize",
  "template-generate-variants",
  "template-classify-route",
  "template-monitor-alert",
  "template-extract-writeback",
  "self-media-comment-reply-routing",
  "sales-call-crm-writeback",
  "self-media-topic-mining",
  "self-media-title-cover-ab",
  "self-media-data-review-weekly",
  "industry-source-monitoring-daily",
  "industry-competitor-diff-tracking",
  "industry-interview-summary",
  "industry-sentiment-risk-alert",
  "ecommerce-review-mining",
  "ecommerce-inventory-pricing-alert",
  "ecommerce-promo-creative-batch",
  "support-auto-answer",
  "support-ticket-priority-routing",
  "support-prehandoff-info-collection",
  "support-service-quality-review",
  "sales-lead-scoring",
  "sales-precall-brief",
  "sales-objection-coach",
  "sales-followup-cadence",
];

function selectAgentProfile(task) {
  if (task.profileId && profiles[task.profileId]) return profiles[task.profileId];
  if (task.profileHint && profiles[task.profileHint]) return profiles[task.profileHint];

  const text = `${task.name || ""}\n${task.prompt || ""}`.toLowerCase();
  let best = profiles["general-executor"];
  let bestScore = -1;

  for (const profile of Object.values(profiles)) {
    const matchScore = (profile.match || []).filter((kw) => text.includes(String(kw).toLowerCase())).length * 10;
    const experienceScore = Math.min(profile.experience || 0, 20) / 4;
    const score = matchScore + experienceScore;
    if (score > bestScore) {
      best = profile;
      bestScore = score;
    }
  }

  return best;
}

for (const id of requiredProfiles) {
  assert.ok(profiles[id], `missing profile: ${id}`);
  assert.equal(profiles[id].id, id);
  assert.ok(Array.isArray(profiles[id].match) && profiles[id].match.length >= 5, `${id} should have routing keywords`);
  assert.ok(profiles[id].projectConfig?.modelTier, `${id} should declare modelTier`);
  assert.ok(profiles[id].projectConfig?.roleInWeakStrongWorkflow || profiles[id].projectConfig?.roleInWorkflow, `${id} should declare workflow role`);
}

for (const id of ["strong-task-architect", "strong-quality-reviewer"]) {
  assert.equal(profiles[id].projectConfig.modelTier, "strong");
  assert.match(profiles[id].defaultModel, /pro|gpt|claude|sonnet|opus/i, `${id} should default to a strong model`);
}

for (const id of ["weak-research-extractor", "weak-structured-operator", "weak-test-enumerator"]) {
  assert.equal(profiles[id].projectConfig.modelTier, "weak");
  assert.match(profiles[id].defaultModel, /flash|mini|small|lite/i, `${id} should default to a cheap/fast model`);
  assert.ok(Array.isArray(profiles[id].projectConfig.escalateWhen), `${id} should define escalation rules`);
}

const routingCases = [
  {
    id: "intent-and-plan",
    expected: "strong-task-architect",
    task: {
      name: "用户意图推断与任务拆解",
      prompt: "请先定义成功标准、关键假设和验证方案，再把可验证子任务交给弱模型。",
    },
  },
  {
    id: "research",
    expected: "weak-research-extractor",
    task: {
      name: "信息搜集与事实抽取",
      prompt: "搜索候选链接，整理来源，摘录事实，标注不确定点，不要下最终结论。",
    },
  },
  {
    id: "structured",
    expected: "weak-structured-operator",
    task: {
      name: "结构化抽取和格式转换",
      prompt: "按 JSON schema 做字段抽取、表格转换和统一格式。",
    },
  },
  {
    id: "tests",
    expected: "weak-test-enumerator",
    task: {
      name: "测试用例与验收用例枚举",
      prompt: "列出边界值、负例、常规 case、回归测试和验证步骤。",
    },
  },
  {
    id: "review",
    expected: "strong-quality-reviewer",
    task: {
      name: "最终审查与风险裁决",
      prompt: "做一致性检查、隐藏风险识别、上线条件判断，并给最终交付结论。",
    },
  },
  {
    id: "self-media-strategy",
    expected: "content-strategy-director",
    task: {
      name: "自媒体账号定位与爆款选题策划",
      prompt: "请做受众画像、平台策略、内容矩阵和选题优先级。",
    },
  },
  {
    id: "self-media-research",
    expected: "content-researcher",
    task: {
      name: "自媒体素材和竞品搜集",
      prompt: "整理评论区洞察、标题样本、用户痛点摘录和爆款拆解。",
    },
  },
  {
    id: "self-media-draft",
    expected: "content-draft-producer",
    task: {
      name: "短视频脚本和小红书图文笔记初稿",
      prompt: "生成标题备选、开头钩子、口播稿和多平台改写。",
    },
  },
  {
    id: "self-media-review",
    expected: "content-editor-reviewer",
    task: {
      name: "自媒体主编合规审稿",
      prompt: "检查品牌一致性、敏感表达、标题审查和最终发布稿。",
    },
  },
  {
    id: "ecommerce",
    expected: "ecommerce-listing-optimizer",
    task: {
      name: "电商商品页详情页文案优化",
      prompt: "提炼 SKU 卖点、商品标题、用户评价、竞品卖点和 A/B 测试。",
    },
  },
  {
    id: "support",
    expected: "support-kb-responder",
    task: {
      name: "客服回复和知识库 FAQ",
      prompt: "做工单分类、售后话术、投诉处理、SOP 和标准回复。",
    },
  },
  {
    id: "research-report",
    expected: "research-report-analyst",
    task: {
      name: "行业调研报告与市场分析",
      prompt: "做趋势判断、竞品分析、数据解读、商业洞察和研究备忘录。",
    },
  },
  {
    id: "classification-router",
    expected: "classification-router",
    task: {
      name: "分类路由和置信度阈值",
      prompt: "做多标签分类、情绪识别、条件分支、人工审核队列和自动路由。",
    },
  },
  {
    id: "monitor-alert",
    expected: "monitor-alert-operator",
    task: {
      name: "监控告警和分级响应",
      prompt: "监听负面突增、库存预警、定价异常、触发条件和升级机制。",
    },
  },
  {
    id: "structured-writeback",
    expected: "structured-writeback-operator",
    task: {
      name: "结构化回写和 CRM 回填",
      prompt: "做字段校验、字段映射、幂等性、非结构化对话字段抽取和写回系统。",
    },
  },
  {
    id: "sales-call",
    expected: "sales-call-analyst",
    task: {
      name: "电话销售通话纪要",
      prompt: "判断客户意向度、异议点、跟进节奏、销售话术、线索分级和下一步动作。",
    },
  },
];

const results = routingCases.map((item) => {
  const selected = selectAgentProfile(item.task);
  assert.equal(selected.id, item.expected, `${item.id} routed to ${selected.id}, expected ${item.expected}`);
  return {
    case: item.id,
    profileId: selected.id,
    modelTier: selected.projectConfig.modelTier,
    defaultModel: selected.defaultModel,
  };
});

const workflowResults = requiredWorkflows.map((id) => {
  const workflow = workflows[id];
  assert.ok(workflow, `missing workflow: ${id}`);
  assert.ok(Array.isArray(workflow.tasks) && workflow.tasks.length >= 3, `${id} should have at least three tasks`);

  const taskIds = new Set(workflow.tasks.map((task) => task.id));
  const modelTiers = new Set();
  for (const task of workflow.tasks) {
    assert.ok(task.profileId, `${id}/${task.id} should declare profileId`);
    assert.ok(profiles[task.profileId], `${id}/${task.id} references missing profile ${task.profileId}`);
    assert.ok(Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length >= 3, `${id}/${task.id} should have acceptance criteria`);
    for (const dep of task.deps || []) {
      assert.ok(taskIds.has(dep), `${id}/${task.id} references missing dependency ${dep}`);
    }
    modelTiers.add(profiles[task.profileId].projectConfig?.modelTier || "unknown");
  }

  assert.ok(modelTiers.has("weak"), `${id} should include weak-model work`);
  assert.ok(modelTiers.has("strong"), `${id} should include strong-model work`);

  return {
    workflowId: id,
    taskCount: workflow.tasks.length,
    modelTiers: [...modelTiers].sort(),
    profiles: [...new Set(workflow.tasks.map((task) => task.profileId))],
  };
});

console.log(JSON.stringify({ checkedProfiles: requiredProfiles, routingCases: results, workflowCases: workflowResults }, null, 2));
