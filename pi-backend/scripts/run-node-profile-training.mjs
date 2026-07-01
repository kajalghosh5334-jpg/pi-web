import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const defaultSpecPath = join(repoRoot, "training", "node-task-cases.json");
const profileStore = join(repoRoot, "agent-profiles.json");
const outRoot = join(repoRoot, "agent_memory", "node_profile_training");

const args = new Set(process.argv.slice(2));
const getArg = (name, fallback) => {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const validateOnly = args.has("--validate-only");
const dryRun = args.has("--dry-run") || args.has("--no-write-profiles");
const writeProfiles = !validateOnly && !dryRun;
const reuse = args.has("--reuse") || process.env.PI_TRAINING_REUSE === "1";
const skipProfileSynthesis = args.has("--skip-profile-synthesis");
const specPath = getArg("--spec", process.env.PI_TRAINING_SPEC || defaultSpecPath);
const runId = getArg("--run-id", process.env.PI_TRAINING_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-"));
const nodeTypeFilter = getArg("--node-type", process.env.PI_TRAINING_NODE_TYPE || "");
const caseIdFilter = getArg("--case-id", process.env.PI_TRAINING_CASE_ID || "");
const maxCases = Number(getArg("--max-cases", process.env.PI_TRAINING_MAX_CASES || "0"));
const minScoreOverride = Number(getArg("--min-score", process.env.PI_TRAINING_MIN_SCORE || "0"));
const minCasesForProfile = Number(getArg("--min-cases-for-profile", process.env.PI_TRAINING_MIN_CASES_FOR_PROFILE || "1"));
const weakModel = process.env.PI_TRAINING_WEAK_MODEL || "";
const strongModel = process.env.PI_TRAINING_STRONG_MODEL || "";
const runDir = join(outRoot, runId);
const nodeOutputDir = join(runDir, "node_outputs");
const conversationIsolation = {
  mode: "fresh_conversation_per_model_call",
  appliesTo: ["node_output", "judge", "profile_synthesis"],
  piArgs: ["--print", "--mode", "json", "--no-session", "--no-context-files", "--session-dir", "<per-call isolated directory>"],
  contextPolicy: "Only explicit dependency outputs are injected into the next prompt; no model call resumes prior chat history.",
};

const NODE_TYPE_CONTRACTS = {
  "Strategize/Plan": {
    purpose: "做方向性判断和任务/策略规划，不生成正文、不替下游执行。",
    output: [
      "decision_summary: 一句话方向结论",
      "positioning_or_strategy: 目标定位/策略方向",
      "constraints: 不可逆约束、现实限制、红线",
      "opportunities: 可利用优势或机会",
      "execution_priorities: 3-6 个优先执行项",
      "validation_metrics: 可验证指标或验证动作",
      "handoff_to_next_nodes: 下游节点需要拿到的结构化输入",
    ],
    redLines: [
      "不得生成长文正文、简历正文或营销稿正文",
      "不得编造案例、金额、转化率、学历、工作年限",
      "求职/履历策略可以调整呈现顺序和证明方式，但不得建议隐藏、删除、伪造学历、经历、年龄等需要如实披露的硬信息",
      "必须把可验证竞争力/验证资产写成明确字段，而不是泛泛建议",
    ],
  },
  "Gather/Fetch": {
    purpose: "只搬运用户给定来源、工具结果或可定位文件中的显性事实，不做判断。",
    output: [
      "extracted_facts: 每条含 fact, source, source_status",
      "unknown_fields: 来源未出现但任务关心的字段",
      "evidence_gaps: 证据缺口和补源建议",
      "handoff_summary: 给下游的短摘要",
    ],
    redLines: [
      "不得凭记忆或行业常识补公司新闻、数字、链接、媒体名",
      "不得把评论/访谈观点写成行业事实",
    ],
  },
  "Analyze/Judge": {
    purpose: "基于事实做可验证判断，输出证据、置信度、反证条件和建议。",
    output: [
      "analysis_items: 每项含 claim_type(fact|inference|assumption|recommendation), evidence, confidence, counter_evidence, recommendation",
      "gap_handling: 对关键缺口的处理策略",
      "overall_confidence",
      "escalation_flag",
    ],
    redLines: [
      "不得对未验证来源下高置信结论",
      "不得把推断写成事实",
      "上游依赖缺失或失败时，必须显式写 upstream_missing，不得用节点名、标准答案或常识补齐事实",
      "每个短板/风险必须给可操作处理建议",
    ],
  },
  "Generate/Draft": {
    purpose: "依据上游事实和策略生成可编辑初稿，不承担最终事实责任。",
    output: [
      "draft_sections: 草稿分段或变体列表",
      "source_usage: 每个事实/数字对应的上游依据；无依据必须写 placeholder 或删除",
      "unsupported_claims_removed: 删除或占位的无依据表达",
      "unsupported_numbers_self_check: 扫描所有数字/百分比/金额；无上游依据必须替换为非数字表达或 placeholder",
      "editable_notes: 需要人类补充或确认的占位项",
      "risk_flags",
    ],
    redLines: [
      "不得新增上游未支持的数字、百分比、金额、案例、客户名、项目成果、学历、职位",
      "生成标题/封面/广告语时，尤其禁止为了增强点击而添加 70%、80%、30 天、翻倍等无来源数字",
      "不得把 demo 写成生产级成果",
      "不得输出不可修改的最终定稿",
    ],
  },
  "Classify/Router": {
    purpose: "按给定标签体系做分类、置信度和路由，不生成最终处置。",
    output: [
      "items: 每条含 id, label, confidence, route(auto_reply|manual_review|ignore|delete_suggested), reason, risk_flags",
      "manual_review_items",
      "label_conflicts",
    ],
    redLines: [
      "不得发明标签；若标签体系不足，使用 other 并说明 schema_gap",
      "预算、交易、法律、投诉、纠纷必须 manual_review",
      "广告只能忽略/删除建议，不应生成推广回复",
    ],
  },
  "Review/Gate": {
    purpose: "最终质量门，只做短裁决和返工分配，不重写长内容。",
    output: [
      "decision: pass|publish|approve|revise|block|escalate",
      "issues: 每项含 severity, target_node, location, problem, action, acceptance_criteria",
      "evidence_checks: 事实/数字/来源/项目证明/学历/职位/技能熟练度/CTA 检查",
      "checklist_coverage: 明确列出已检查和未检查的关键项",
      "rework_assignment",
    ],
    redLines: [
      "必须给明确裁决，不能只给建议",
      "不得代替上游节点重写整篇长文",
      "无来源数字、虚构经历、夸大技能、法律/交易风险、缺失必要 CTA 审查必须阻塞或升级",
      "只要 issues 中存在 high/critical severity，decision 不得是 pass/publish/approve，除非同一输出明确证明该问题已被解决",
    ],
  },
  Standardize: {
    purpose: "把非结构化输入转换成统一 schema，不做业务判断。",
    output: [
      "normalized_items: 标准化条目列表",
      "field_mapping: 原始字段到标准字段的映射",
      "missing_fields",
      "format_warnings",
      "handoff_summary: 只概括标准化结果，不给业务策略建议",
    ],
    redLines: [
      "不得猜测缺失字段",
      "不得改变原始事实含义",
      "不得加入业务判断或策略建议",
    ],
  },
  Extract: {
    purpose: "从给定材料抽取字段并保留原文锚点。",
    output: [
      "extracted_fields: 每项含 field, value, source_anchor, confidence",
      "missing_required_fields",
      "validation_errors",
      "handoff_payload",
    ],
    redLines: [
      "不得无来源补字段",
      "不确定字段必须标记 confidence=low 或 missing",
      "必须保留原文锚点或来源位置",
    ],
  },
  "Action/Writeback": {
    purpose: "生成系统动作 payload 或队列项，不声称已经执行真实外部动作。",
    output: [
      "action_payloads: 待执行 payload 列表；每项必须含 platform/action_type/status/source_artifact/content_fields/scheduled_time/idempotency_key",
      "idempotency_key: 全局幂等键；每个 payload 也要有平台级幂等键",
      "validation_result",
      "blocked_items",
      "retry_or_manual_review_advice",
    ],
    redLines: [
      "不得声称已写入、已发布、已执行，除非工具真实返回成功",
      "必填项缺失必须 blocked，不得默认为 0 或空",
      "每个 action_payload 都必须在顶层显式写 scheduled_time；缺少 scheduled_time/source_artifact/content_fields 时必须显式写 missing 或 blocked",
      "status 只能使用 pending_write、pending_schedule、blocked、manual_review，不得用含糊状态掩盖必填项缺失",
      "不得凭空生成 variant_set、素材编号、排期时间或外部 artifact id",
      "高风险动作必须 manual_review",
    ],
  },
  "Artifact/Render": {
    purpose: "把上游结构化结果渲染成人类可读产物，不新增事实。",
    output: [
      "artifact_title",
      "artifact_body",
      "source_mapping",
      "placeholders",
      "render_notes",
    ],
    redLines: [
      "不得新增上游没有的事实、数字、案例或结论",
      "不得丢失关键风险/缺口",
      "必须保留占位符和待确认项",
    ],
  },
  "Monitor/Alert": {
    purpose: "基于阈值或事件窗口做异常检测、分级和升级建议。",
    output: [
      "alerts: 每项含 severity, trigger_reason, evidence, recommended_action",
      "normal_items",
      "escalation_required",
      "next_check_window",
    ],
    redLines: [
      "不得自行执行高风险动作",
      "不得无阈值或无证据触发重度告警",
      "必须区分 observed evidence 和 possible cause",
    ],
  },
};

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function saveJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function markdownList(items) {
  return (items || []).length ? items.map((item) => `- ${item}`).join("\n") : "- 无";
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function pickModel(spec, testCase) {
  if (testCase.model) return testCase.model;
  if (/Review\/Gate|Strategize\/Plan/.test(testCase.nodeType)) return strongModel || spec.defaults?.strongModel;
  return weakModel || spec.defaults?.weakModel;
}

function isStrongNode(testCase, model) {
  return /Review\/Gate|Strategize\/Plan/.test(testCase.nodeType) || /pro|strong/i.test(String(model || ""));
}

function pickTimeout(spec, testCase, model) {
  if (testCase.timeoutMs) return testCase.timeoutMs;
  if (isStrongNode(testCase, model) && spec.defaults?.strongTimeoutMs) return spec.defaults.strongTimeoutMs;
  if (!isStrongNode(testCase, model) && spec.defaults?.weakTimeoutMs) return spec.defaults.weakTimeoutMs;
  return spec.defaults?.timeoutMs || 180000;
}

function validateSpec(spec) {
  assert.ok(Array.isArray(spec.cases), "training spec must include cases[]");
  const ids = new Set();
  for (const testCase of spec.cases) {
    assert.ok(testCase.id, "case missing id");
    assert.ok(!ids.has(testCase.id), `duplicate case id: ${testCase.id}`);
    ids.add(testCase.id);
    assert.ok(testCase.nodeType, `${testCase.id} missing nodeType`);
    assert.ok(testCase.profileTarget, `${testCase.id} missing profileTarget`);
    assert.ok(testCase.title, `${testCase.id} missing title`);
    assert.ok(testCase.input, `${testCase.id} missing input`);
    assert.ok(Array.isArray(testCase.expectedRubric) && testCase.expectedRubric.length >= 3, `${testCase.id} needs at least three rubric items`);
    assert.ok(testCase.standardAnswer, `${testCase.id} missing standardAnswer`);
    assert.ok(Array.isArray(testCase.dependsOn), `${testCase.id} dependsOn must be an array`);
  }
  for (const testCase of spec.cases) {
    for (const dep of testCase.dependsOn) {
      assert.ok(ids.has(dep), `${testCase.id} depends on unknown case ${dep}`);
    }
  }
  topoSort(spec.cases);
}

function topoSort(cases) {
  const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
  const temporary = new Set();
  const permanent = new Set();
  const sorted = [];

  function visit(testCase) {
    if (permanent.has(testCase.id)) return;
    if (temporary.has(testCase.id)) throw new Error(`cycle detected at ${testCase.id}`);
    temporary.add(testCase.id);
    for (const dep of testCase.dependsOn || []) visit(byId.get(dep));
    temporary.delete(testCase.id);
    permanent.add(testCase.id);
    sorted.push(testCase);
  }

  for (const testCase of cases) visit(testCase);
  return sorted;
}

function selectCaseClosure(cases, requestedIds) {
  if (!requestedIds.length) return topoSort(cases);
  const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
  const selected = new Set();
  function include(id) {
    const testCase = byId.get(id);
    if (!testCase) throw new Error(`unknown --case-id: ${id}`);
    if (selected.has(id)) return;
    for (const dep of testCase.dependsOn || []) include(dep);
    selected.add(id);
  }
  for (const id of requestedIds) include(id);
  return topoSort(cases).filter((testCase) => selected.has(testCase.id));
}

function sanitizeStringList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => !/^(无|none|null|n\/a|no|没有|无红线|无严重虚构)$/i.test(item));
}

function extractAssistantText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

async function runPiModel(model, prompt, label, timeoutMs, tools = "none") {
  const resultPath = join(runDir, `${label}.json`);
  if (reuse && existsSync(resultPath)) {
    const cached = loadJson(resultPath);
    if (cached?.text) return cached;
  }

  const workDir = join(runDir, label);
  const isolatedSessionDir = join(workDir, ".pi-sessions");
  mkdirSync(workDir, { recursive: true });
  mkdirSync(isolatedSessionDir, { recursive: true });
  const piArgs = ["--print", "--mode", "json", "--no-session", "--no-context-files", "--session-dir", isolatedSessionDir, "--model", model];
  if (tools === "none") piArgs.push("--no-tools");

  const child = spawn("pi", piArgs, { cwd: workDir });
  child.stdin.end(prompt);

  let buffer = "";
  let finalText = "";
  let usage = null;
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const assistantEvent = event.assistantMessageEvent;
        if (event.type === "message_update" && assistantEvent?.type === "text_delta" && assistantEvent.delta) {
          finalText += assistantEvent.delta;
        }
        if (event.type === "agent_end") {
          const last = [...(event.messages || [])].reverse().find((message) => message.role === "assistant");
          const text = extractAssistantText(last);
          if (text) finalText = text;
          if (last?.usage) usage = last.usage;
        }
      } catch {}
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const startedAt = Date.now();
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = {
        model,
        code,
        text: finalText.trim(),
        usage,
        stderr,
        elapsedMs: Date.now() - startedAt,
        conversationIsolation: "fresh pi --print process with --no-session and --no-context-files",
        workDir,
        isolatedSessionDir,
      };
      saveJson(resultPath, result);
      if (code !== 0 || !result.text) {
        reject(new Error(`${label} failed code=${code} textLen=${result.text.length} stderr=${stderr.slice(0, 500)}`));
      } else {
        resolve(result);
      }
    });
    child.on("error", reject);
  });
}

function dependencyContext(testCase, results) {
  return (testCase.dependsOn || []).map((dep) => {
    const item = results[dep];
    if (!item) return `上游节点 ${dep} 状态：missing\n该依赖没有可用输出。当前节点必须标记 upstream_missing，不得补造。`;
    if (!item.judge?.pass) {
      return [
        `上游节点 ${dep} 状态：failed`,
        `失败原因：${item.error || item.judge?.error || "未通过 judge"}`,
        `裁判问题：${JSON.stringify({
          score: item.judge?.score,
          missing: item.judge?.missing || [],
          hallucination: item.judge?.hallucination || [],
          red_line_violations: item.judge?.red_line_violations || [],
        }, null, 2)}`,
        "可用输出仅可作为低置信参考；不得把失败依赖当成已验证事实。",
        `上游原始输出：\n${item.output?.text || "(missing)"}`,
      ].join("\n");
    }
    return `上游节点 ${dep} 状态：passed\n上游节点 ${dep} 输出：\n${item.output?.text || "(missing)"}`;
  }).join("\n\n---\n\n");
}

function trimZeros(value) {
  return Number(value.toFixed(4)).toString();
}

function percent(value) {
  return `${trimZeros(value * 100)}%`;
}

function deterministicReference(testCase) {
  if (!testCase.calculationRules) return null;
  const rows = [];
  const pattern = /视频\s*([A-Za-z0-9\u4e00-\u9fa5]+)\s*播放\s*(\d+)，点赞\s*(\d+)，评论\s*(\d+)，转发\s*(\d+)，私信\s*(\d+)/g;
  for (const match of testCase.input.matchAll(pattern)) {
    const [, itemId, viewsRaw, likesRaw, commentsRaw, sharesRaw, directMessagesRaw] = match;
    const views = Number(viewsRaw);
    const likes = Number(likesRaw);
    const comments = Number(commentsRaw);
    const shares = Number(sharesRaw);
    const directMessages = Number(directMessagesRaw);
    if (!views) continue;
    const interactionNumerator = likes + comments + shares;
    rows.push({
      item_id: `视频 ${itemId}`,
      raw: { views, likes, comments, shares, direct_messages: directMessages },
      metrics: {
        interaction_rate: {
          formula: "(likes + comments + shares) / views",
          numerator: interactionNumerator,
          denominator: views,
          decimal: Number((interactionNumerator / views).toFixed(6)),
          percent: percent(interactionNumerator / views),
        },
        comment_rate: {
          formula: "comments / views",
          numerator: comments,
          denominator: views,
          decimal: Number((comments / views).toFixed(6)),
          percent: percent(comments / views),
        },
        share_rate: {
          formula: "shares / views",
          numerator: shares,
          denominator: views,
          decimal: Number((shares / views).toFixed(6)),
          percent: percent(shares / views),
        },
        dm_conversion_rate: {
          formula: "direct_messages / views",
          numerator: directMessages,
          denominator: views,
          decimal: Number((directMessages / views).toFixed(6)),
          percent: percent(directMessages / views),
        },
      },
    });
  }
  if (!rows.length) return null;
  return {
    kind: "metric_rate_precompute",
    source: "runner_precompute_not_user_evidence",
    note: "Use these deterministic calculations as the numeric reference. Do not cite this helper as a user-facing evidence source; cite the original input rows as source evidence.",
    rules: testCase.calculationRules,
    rows,
  };
}

function buildCasePrompt(testCase, depContext) {
  const contract = NODE_TYPE_CONTRACTS[testCase.nodeType];
  const deterministic = deterministicReference(testCase);
  return `你是 Workflow 中的一个 profile 化节点。请只完成当前节点，不要越权完成下游任务。

节点类型：${testCase.nodeType}
目标 Profile：${testCase.profileTarget}
Workflow：${testCase.workflowId || "unknown"}
任务：${testCase.title}

上游上下文：
${depContext || "(无上游依赖)"}

当前输入：
${testCase.input}

节点通用契约：
${contract ? [
  `职责：${contract.purpose}`,
  "推荐输出字段：",
  ...contract.output.map((item) => `- ${item}`),
  "通用红线：",
  ...contract.redLines.map((item) => `- ${item}`),
].join("\n") : "无"}

本样本标签/路由 schema：
${testCase.labelSchema ? JSON.stringify(testCase.labelSchema, null, 2) : "未指定；如需分类，严格使用题目给定标签。"}

本样本生成/审查专项约束：
${testCase.generationGuardrails ? JSON.stringify(testCase.generationGuardrails, null, 2) : "无"}
${testCase.reviewChecklist ? JSON.stringify({ reviewChecklist: testCase.reviewChecklist }, null, 2) : "无"}

确定性预计算参考：
${deterministic ? JSON.stringify(deterministic, null, 2) : "无"}

输出要求：
1. 严格遵守当前节点职责。
2. 输出可供下游使用的结构化结果。
3. 如信息缺失，写 unknown/missing/unverified，不得补造。
4. 区分事实、推断、建议和风险。
5. 遇到红线必须标记 blocked 或 manual_review_required。
6. 优先按“节点通用契约”的字段输出；若任务要求更具体，以任务要求为准。
7. 如果上游依赖 missing/failed，只能标记 upstream_missing 或 low_confidence，不得用常识、节点名、标准答案补齐。
8. 如果提供“确定性预计算参考”，数字计算必须以该参考为准；模型只负责结构化、标注原始输入来源和说明，不要把预计算 helper 当成用户可见证据来源。

评分 Rubric：
${testCase.expectedRubric.map((item, index) => `${index + 1}. ${item}`).join("\n")}

红线：
${(testCase.redLines || []).map((item, index) => `${index + 1}. ${item}`).join("\n") || "无"}
`;
}

function buildJudgePrompt(testCase, outputText, depContext) {
  const contract = NODE_TYPE_CONTRACTS[testCase.nodeType];
  const deterministic = deterministicReference(testCase);
  return `你是严格训练裁判。请对一个 Workflow 节点输出评分，只返回 JSON，不要 markdown。

节点类型：${testCase.nodeType}
任务：${testCase.title}

当前输入：
${testCase.input}

上游上下文：
${depContext || "(无上游依赖)"}

Rubric：
${JSON.stringify(testCase.expectedRubric, null, 2)}

标准答案/关键要点：
${testCase.standardAnswer}

红线：
${JSON.stringify(testCase.redLines || [], null, 2)}

节点通用契约：
${JSON.stringify(contract || {}, null, 2)}

本样本标签/路由 schema：
${JSON.stringify(testCase.labelSchema || null, null, 2)}

本样本生成/审查专项约束：
${JSON.stringify({
  generationGuardrails: testCase.generationGuardrails || null,
  reviewChecklist: testCase.reviewChecklist || null,
  calculationRules: testCase.calculationRules || null,
  deterministicReference: deterministic,
}, null, 2)}

裁判注意：
1. 当前输入中明确出现的实体、公司名、数字或事实，不应判为编造。
2. 上游上下文中明确出现的实体、公司名、数字或事实，也不应判为编造。
3. 只有输出新增了当前输入、上游输出、标准答案都未支持的信息，才算 hallucination。
4. 若上游依赖 failed/missing，输出把失败依赖当作已验证事实，应扣分；但不能把上游已通过节点中的事实误判为 hallucination。
5. 若存在确定性预计算参考，所有率值/百分比以该参考为准，偏离即扣分；把 helper 名称当成事实来源是轻微问题，但不能误判数值本身。
6. red_line_violations 如果没有，请返回空数组 []，不要返回 ["无"]。

待评分输出：
${outputText}

返回 JSON。score 必须是 0-100 的整数，不要使用 0-1 小数制或 0-10 十分制：
{
  "score": 0,
  "score_scale": "0-100",
  "pass": true,
  "rubric_hits": [""],
  "missing": [""],
  "hallucination": [""],
  "red_line_violations": [""],
  "profile_lessons": [""],
  "prompt_patch_suggestions": [""]
}`;
}

function parseJsonObject(text) {
  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch {}
  const match = direct.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`model did not return JSON: ${direct.slice(0, 1000)}`);
  return JSON.parse(match[0]);
}

function normalizeJudgeScore(value) {
  const score = Number(value || 0);
  if (!Number.isFinite(score)) return 0;
  if (score > 0 && score <= 1) return Math.round(score * 100);
  if (score > 1 && score <= 10) return Math.round(score * 10);
  return Math.round(score);
}

function buildProfileSynthesisPrompt(nodeType, group, profiles) {
  const targetIds = unique(group.map((item) => item.testCase.profileTarget));
  const baseProfiles = Object.fromEntries(targetIds.map((id) => [id, {
    name: profiles[id]?.name,
    defaultModel: profiles[id]?.defaultModel,
    collaborationProtocol: profiles[id]?.collaborationProtocol,
    projectConfig: profiles[id]?.projectConfig,
    systemPromptPatch: profiles[id]?.systemPromptPatch,
  }]));
  const cases = group.map((item) => ({
    id: item.testCase.id,
    title: item.testCase.title,
    profileTarget: item.testCase.profileTarget,
    score: item.judge.score,
    profile_lessons: item.judge.profile_lessons || [],
    prompt_patch_suggestions: item.judge.prompt_patch_suggestions || [],
    node_output_artifact: item.nodeOutputArtifact?.markdownPath || "",
    output_excerpt: item.output.text.slice(0, 1200),
  }));

  return `你是 Profile 提炼器。请根据同一 nodeType 的真实训练样本，总结一个可复用通用 Profile。
只返回 JSON，不要 markdown。

nodeType: ${nodeType}

现有相关 profile：
${JSON.stringify(baseProfiles, null, 2)}

通过样本：
${JSON.stringify(cases, null, 2)}

请生成：
{
  "name": "",
  "match": [""],
  "collaborationProtocol": "",
  "projectConfig": {
    "modelTier": "weak|strong",
    "roleInWorkflow": "",
    "preferredTasks": [""],
    "escalateWhen": [""],
    "qualityBar": "",
    "nodeContract": {
      "input_scope": "",
      "allowed_sources": [""],
      "output_schema_note": "",
      "max_input_chars": 0,
      "escalation_rule": ""
    }
  },
  "systemPromptPatch": ""
}

要求：
1. 不要删除已有 profile 的关键红线。
2. systemPromptPatch 要短、硬、可执行，适合弱模型稳定执行。
3. 事实型节点必须强调不得编造来源。
4. Review/Gate 必须输出短裁决，不重写长文。
5. Analyze/Judge 必须区分事实/推断/建议/置信度/反证条件。`;
}

function makeCandidateProfile(nodeType, synthesized, group, spec) {
  const targetIds = unique(group.map((item) => item.testCase.profileTarget));
  const firstTarget = targetIds[0];
  const profiles = loadJson(profileStore);
  const base = profiles[firstTarget] || {};
  const modelTier = synthesized.projectConfig?.modelTier || base.projectConfig?.modelTier || (/Review\/Gate|Strategize\/Plan/.test(nodeType) ? "strong" : "weak");
  const defaultModel = modelTier === "strong"
    ? (strongModel || spec.defaults?.strongModel || base.defaultModel || "opencode-go/deepseek-v4-pro")
    : (weakModel || spec.defaults?.weakModel || base.defaultModel || "opencode-go/deepseek-v4-flash");
  const profileId = `generated-${slug(nodeType)}-${runId.slice(0, 10)}`;
  const generatedMatch = unique([
    `generated:${slug(nodeType)}`,
    `training-run:${runId}`,
    ...targetIds.map((id) => `source-profile:${id}`),
    ...group.map((item) => `case:${item.testCase.id}`),
    ...group.map((item) => item.testCase.title),
  ]).slice(0, 24);
  return {
    id: profileId,
    name: synthesized.name || `${nodeType} Generated Profile`,
    match: generatedMatch,
    defaultModel,
    skills: unique([...(base.skills || []), "output-spec"]),
    availableSkills: unique([...(base.availableSkills || []), ...(base.skills || []), "output-spec", "artifact-storage"]),
    collaborationProtocol: synthesized.collaborationProtocol || base.collaborationProtocol || "执行该类 Workflow 节点，输出可交接结果、风险和下一步建议。",
    projectConfig: {
      ...(base.projectConfig || {}),
      ...(synthesized.projectConfig || {}),
      modelTier,
      generated: true,
      generatedStatus: "trained",
      routingEnabled: false,
      sourceNodeType: nodeType,
      sourceProfileTargets: targetIds,
      trainingRunId: runId,
      trainingCases: group.map((item) => item.testCase.id),
      trainingArtifactDir: runDir,
      nodeOutputArtifacts: group.map((item) => item.nodeOutputArtifact?.markdownPath).filter(Boolean),
    },
    systemPromptPatch: synthesized.systemPromptPatch || base.systemPromptPatch || "",
    experience: group.length,
    successes: group.filter((item) => item.judge.pass).length,
    failures: 0,
    recentTasks: group.map((item) => ({
      name: item.testCase.title,
      taskId: item.testCase.id,
      success: item.judge.pass,
      timestamp: Date.now(),
      modelUsed: item.output.model,
      score: item.judge.score,
      status: "training_generated",
      outputArtifact: item.nodeOutputArtifact?.markdownPath,
    })).slice(0, 20),
    runHistory: [],
    savedExperiences: group.map((item) => ({
      taskId: item.testCase.id,
      taskName: item.testCase.title,
      lesson: [
        ...(item.judge.profile_lessons || []),
        ...(item.judge.prompt_patch_suggestions || []),
      ].join(" | "),
      skills: base.skills || [],
      model: item.output.model,
      artifactId: item.nodeOutputArtifact?.markdownPath,
      debugValidated: true,
      score: item.judge.score,
      savedAt: Date.now(),
    })).slice(0, 50),
    sourceProfileId: firstTarget,
    generatedAt: Date.now(),
    generatedBy: "node-profile-training",
  };
}

function makeTaskSpecificProfile(item, spec) {
  const profiles = loadJson(profileStore);
  const base = profiles[item.testCase.profileTarget] || {};
  const contract = NODE_TYPE_CONTRACTS[item.testCase.nodeType] || {};
  const modelTier = base.projectConfig?.modelTier || (/Review\/Gate|Strategize\/Plan/.test(item.testCase.nodeType) ? "strong" : "weak");
  const defaultModel = item.output.model
    || (modelTier === "strong" ? spec.defaults?.strongModel : spec.defaults?.weakModel)
    || base.defaultModel
    || "opencode-go/deepseek-v4-flash";
  const lessons = [
    ...(item.judge.profile_lessons || []),
    ...(item.judge.prompt_patch_suggestions || []),
  ].filter(Boolean);
  return {
    id: `trained-case-${slug(item.testCase.id)}-${runId.slice(0, 10)}`,
    name: `${item.testCase.title} 专用 Profile`,
    match: unique([
      `trained-case:${item.testCase.id}`,
      `workflow:${item.testCase.workflowId || "unknown"}`,
      `node-type:${item.testCase.nodeType}`,
      item.testCase.title,
      item.testCase.profileTarget,
    ]),
    defaultModel,
    skills: unique([...(base.skills || []), "output-spec"]),
    availableSkills: unique([...(base.availableSkills || []), ...(base.skills || []), "output-spec", "artifact-storage"]),
    collaborationProtocol: [
      `专用于真实训练任务：${item.testCase.title}。`,
      base.collaborationProtocol || contract.purpose || "执行该类节点并输出可交接结果。",
      "必须复用训练样本中的成功模式，并保留风险、证据和待确认项。",
    ].filter(Boolean).join("\n"),
    projectConfig: {
      ...(base.projectConfig || {}),
      modelTier,
      generated: true,
      generatedStatus: "trained",
      routingEnabled: false,
      profileKind: "task-specific",
      workflowId: item.testCase.workflowId || "",
      sourceNodeType: item.testCase.nodeType,
      sourceProfileId: item.testCase.profileTarget,
      trainingRunId: runId,
      trainingCaseId: item.testCase.id,
      trainingScore: item.judge.score,
      trainingArtifactDir: runDir,
      nodeOutputArtifact: item.nodeOutputArtifact?.markdownPath,
      nodeContract: contract,
    },
    systemPromptPatch: [
      `你是“${item.testCase.title}”专用节点 Profile。`,
      `节点类型：${item.testCase.nodeType}。`,
      contract.purpose ? `节点职责：${contract.purpose}` : "",
      contract.redLines?.length ? `红线：${contract.redLines.join("；")}` : "",
      item.testCase.generationGuardrails ? `生成约束：${JSON.stringify(item.testCase.generationGuardrails)}` : "",
      item.testCase.labelSchema ? `标签 schema：${JSON.stringify(item.testCase.labelSchema)}` : "",
      item.testCase.reviewChecklist ? `审查 checklist：${item.testCase.reviewChecklist.join("；")}` : "",
      lessons.length ? `训练沉淀：${lessons.join(" | ")}` : "",
      "只完成当前节点；缺失信息标记 missing/unknown/unverified；不得补造。",
    ].filter(Boolean).join("\n"),
    experience: 1,
    successes: 1,
    failures: 0,
    recentTasks: [{
      name: item.testCase.title,
      taskId: item.testCase.id,
      success: true,
      timestamp: Date.now(),
      modelUsed: item.output.model,
      score: item.judge.score,
      status: "training_case_profile",
      outputArtifact: item.nodeOutputArtifact?.markdownPath,
    }],
    runHistory: [],
    savedExperiences: [{
      taskId: item.testCase.id,
      taskName: item.testCase.title,
      lesson: lessons.join(" | ") || `通过真实训练样本，score=${item.judge.score}`,
      skills: base.skills || [],
      model: item.output.model,
      artifactId: item.nodeOutputArtifact?.markdownPath,
      debugValidated: true,
      score: item.judge.score,
      savedAt: Date.now(),
    }],
    sourceProfileId: item.testCase.profileTarget,
    generatedAt: Date.now(),
    generatedBy: "node-profile-training",
  };
}

function writeNodeOutputArtifact(record, order) {
  mkdirSync(nodeOutputDir, { recursive: true });
  const baseName = `${String(order).padStart(2, "0")}-${slug(record.testCase.id)}`;
  const markdownPath = join(nodeOutputDir, `${baseName}.md`);
  const jsonPath = join(nodeOutputDir, `${baseName}.json`);
  const body = `# ${record.testCase.title}

- Case ID: \`${record.testCase.id}\`
- Workflow: \`${record.testCase.workflowId || "unknown"}\`
- Node Type: \`${record.testCase.nodeType}\`
- Target Profile: \`${record.testCase.profileTarget}\`
- Model: \`${record.output.model}\`
- Score: \`${record.judge.score}\`
- Pass: \`${record.judge.pass}\`
- Elapsed: \`${record.output.elapsedMs}ms\`
- Conversation Isolation: \`${record.output.conversationIsolation}\`
- Depends On: ${(record.testCase.dependsOn || []).map((id) => `\`${id}\``).join(", ") || "none"}

## Input

${record.testCase.input}

## Rubric

${record.testCase.expectedRubric.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Node Output

${record.output.text}

## Judge

### Rubric Hits

${markdownList(record.judge.rubric_hits)}

### Missing

${markdownList(record.judge.missing)}

### Hallucination

${markdownList(record.judge.hallucination)}

### Red Line Violations

${markdownList(record.judge.red_line_violations)}

### Profile Lessons

${markdownList(record.judge.profile_lessons)}

### Prompt Patch Suggestions

${markdownList(record.judge.prompt_patch_suggestions)}
`;
  writeFileSync(markdownPath, body);
  saveJson(jsonPath, {
    caseId: record.testCase.id,
    title: record.testCase.title,
    workflowId: record.testCase.workflowId,
    nodeType: record.testCase.nodeType,
    profileTarget: record.testCase.profileTarget,
    model: record.output.model,
    score: record.judge.score,
    pass: record.judge.pass,
    elapsedMs: record.output.elapsedMs,
    conversationIsolation: record.output.conversationIsolation,
    workDir: record.output.workDir,
    input: record.testCase.input,
    output: record.output.text,
    judge: record.judge,
    dependencies: record.testCase.dependsOn || [],
  });
  return { markdownPath, jsonPath };
}

function writeCandidateProfiles(candidates) {
  if (!candidates.length) return { written: [], backupPath: null };
  const profiles = loadJson(profileStore);
  const backupPath = `${profileStore}.bak-${runId}`;
  writeFileSync(backupPath, readFileSync(profileStore));
  const written = [];
  for (const candidate of candidates) {
    let id = candidate.id;
    let suffix = 2;
    while (profiles[id]) {
      id = `${candidate.id}-${suffix}`;
      suffix += 1;
    }
    profiles[id] = { ...candidate, id };
    written.push(id);
  }
  saveJson(profileStore, profiles);
  return { written, backupPath };
}

async function runCommand(command, commandArgs) {
  return await new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: repoRoot, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: String(error) }));
  });
}

async function runPostWriteChecks(backupPath) {
  const checks = [
    ["npm", ["run", "check:weak-strong-profiles"]],
    ["npm", ["run", "check:workflow-catalog"]],
  ];
  const results = [];
  for (const [command, commandArgs] of checks) {
    const result = await runCommand(command, commandArgs);
    results.push({ command: [command, ...commandArgs].join(" "), ...result });
    if (result.code !== 0) {
      if (backupPath) renameSync(backupPath, profileStore);
      throw new Error(`post-write check failed: ${command} ${commandArgs.join(" ")}\n${result.stderr || result.stdout}`);
    }
  }
  return results;
}

async function main() {
  const spec = loadJson(specPath);
  validateSpec(spec);

  let cases = topoSort(spec.cases);
  const requestedCaseIds = caseIdFilter
    ? caseIdFilter.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  cases = selectCaseClosure(cases, requestedCaseIds);
  if (nodeTypeFilter) cases = cases.filter((testCase) => testCase.nodeType === nodeTypeFilter);
  if (maxCases > 0) cases = cases.slice(0, maxCases);
  assert.ok(cases.length, "no training cases selected");

  const plan = {
    runId,
    specPath,
    runDir,
    conversationIsolation,
    selectedCases: cases.map((testCase) => ({
      id: testCase.id,
      nodeType: testCase.nodeType,
      title: testCase.title,
      dependsOn: testCase.dependsOn,
      profileTarget: testCase.profileTarget,
    })),
    requestedCaseIds,
  };

  if (validateOnly) {
    console.log(JSON.stringify({ ok: true, mode: "validate-only", ...plan }, null, 2));
    return;
  }

  mkdirSync(runDir, { recursive: true });
  mkdirSync(nodeOutputDir, { recursive: true });
  saveJson(join(runDir, "plan.json"), plan);

  const results = {};
  const summary = {
    runId,
    runDir,
    specPath,
    writeProfiles,
    dryRun,
    nodeOutputDir,
    conversationIsolation,
    cases: [],
    generatedProfiles: [],
    generatedTaskProfiles: [],
    writtenProfiles: [],
    writtenTaskProfiles: [],
    pass: false,
  };

  for (const testCase of cases) {
    const label = slug(testCase.id);
    const model = pickModel(spec, testCase);
    const timeoutMs = pickTimeout(spec, testCase, model);
    const judgeTimeoutMs = testCase.judgeTimeoutMs || spec.defaults?.judgeTimeoutMs || 180000;
    const minScore = minScoreOverride || testCase.minScore || spec.defaults?.minScore || 82;
    console.log(`\n== ${testCase.id} (${testCase.nodeType}) ==`);
    let output = null;
    try {
      const depContext = dependencyContext(testCase, results);
      const prompt = buildCasePrompt(testCase, depContext);
      writeFileSync(join(runDir, `${label}.prompt.txt`), prompt);
      output = await runPiModel(model, prompt, `${label}-output`, timeoutMs, testCase.tools || "none");
      const judgePrompt = buildJudgePrompt(testCase, output.text, depContext);
      writeFileSync(join(runDir, `${label}.judge-prompt.txt`), judgePrompt);
      const judgeOutput = await runPiModel(strongModel || spec.defaults?.strongModel, judgePrompt, `${label}-judge`, judgeTimeoutMs, "none");
      const judge = parseJsonObject(judgeOutput.text);
      judge.raw_score = judge.score;
      judge.score = normalizeJudgeScore(judge.score);
      judge.score_scale = "0-100";
      judge.rubric_hits = sanitizeStringList(judge.rubric_hits);
      judge.missing = sanitizeStringList(judge.missing);
      judge.hallucination = sanitizeStringList(judge.hallucination);
      judge.red_line_violations = sanitizeStringList(judge.red_line_violations);
      judge.profile_lessons = sanitizeStringList(judge.profile_lessons);
      judge.prompt_patch_suggestions = sanitizeStringList(judge.prompt_patch_suggestions);
      judge.pass = Boolean(judge.pass) && judge.score >= minScore && !(judge.red_line_violations || []).length;
      const record = { testCase, output, judgeOutput, judge, minScore };
      record.nodeOutputArtifact = writeNodeOutputArtifact(record, summary.cases.length + 1);
      results[testCase.id] = record;
      saveJson(join(runDir, `${label}.result.json`), record);
      summary.cases.push({
        id: testCase.id,
        nodeType: testCase.nodeType,
        profileTarget: testCase.profileTarget,
        model,
        score: judge.score,
        pass: judge.pass,
        outputChars: output.text.length,
        elapsedMs: output.elapsedMs,
        conversationIsolation: output.conversationIsolation,
        missing: judge.missing || [],
        hallucination: judge.hallucination || [],
        redLineViolations: judge.red_line_violations || [],
        outputArtifact: record.nodeOutputArtifact.markdownPath,
      });
      console.log(`score=${judge.score} pass=${judge.pass} chars=${output.text.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedOutput = output || {
        model,
        code: null,
        text: "",
        elapsedMs: 0,
        conversationIsolation: conversationIsolation.mode,
        error: message,
      };
      const judge = {
        score: 0,
        pass: false,
        rubric_hits: [],
        missing: [],
        hallucination: [],
        red_line_violations: [],
        profile_lessons: [`case failed during execution: ${message}`],
        prompt_patch_suggestions: [],
        error: message,
      };
      const record = { testCase, output: failedOutput, judgeOutput: null, judge, minScore, error: message };
      record.nodeOutputArtifact = writeNodeOutputArtifact(record, summary.cases.length + 1);
      results[testCase.id] = record;
      saveJson(join(runDir, `${label}.result.json`), record);
      summary.cases.push({
        id: testCase.id,
        nodeType: testCase.nodeType,
        profileTarget: testCase.profileTarget,
        model,
        score: 0,
        pass: false,
        outputChars: failedOutput.text.length,
        elapsedMs: failedOutput.elapsedMs || 0,
        conversationIsolation: failedOutput.conversationIsolation,
        missing: [],
        hallucination: [],
        redLineViolations: [],
        outputArtifact: record.nodeOutputArtifact.markdownPath,
        error: message,
      });
      console.log(`error=${message}`);
    }
  }

  if (!skipProfileSynthesis) {
    const profiles = loadJson(profileStore);
    const groups = new Map();
    for (const item of Object.values(results)) {
      if (!item.judge.pass) continue;
      const taskProfile = makeTaskSpecificProfile(item, spec);
      summary.generatedTaskProfiles.push(taskProfile.id);
      saveJson(join(runDir, `${taskProfile.id}.task-profile.json`), taskProfile);
      if (!groups.has(item.testCase.nodeType)) groups.set(item.testCase.nodeType, []);
      groups.get(item.testCase.nodeType).push(item);
    }
    for (const [nodeType, group] of groups) {
      if (group.length < minCasesForProfile) continue;
      const prompt = buildProfileSynthesisPrompt(nodeType, group, profiles);
      const label = `profile-${slug(nodeType)}`;
      writeFileSync(join(runDir, `${label}.prompt.txt`), prompt);
      try {
        const synthesizedOutput = await runPiModel(strongModel || spec.defaults?.strongModel, prompt, `${label}-synthesis`, spec.defaults?.profileSynthesisTimeoutMs || spec.defaults?.judgeTimeoutMs || 180000, "none");
        const synthesized = parseJsonObject(synthesizedOutput.text);
        const candidate = makeCandidateProfile(nodeType, synthesized, group, spec);
        summary.generatedProfiles.push(candidate.id);
        saveJson(join(runDir, `${candidate.id}.candidate-profile.json`), candidate);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!summary.profileSynthesisErrors) summary.profileSynthesisErrors = [];
        summary.profileSynthesisErrors.push({
          nodeType,
          caseIds: group.map((item) => item.testCase.id),
          error: message,
        });
        console.log(`profile_synthesis_error nodeType=${nodeType} error=${message}`);
      }
    }
  }

  if (writeProfiles) {
    const taskCandidates = summary.generatedTaskProfiles.map((id) => loadJson(join(runDir, `${id}.task-profile.json`)));
    const genericCandidates = summary.generatedProfiles.map((id) => loadJson(join(runDir, `${id}.candidate-profile.json`)));
    const candidates = [...taskCandidates, ...genericCandidates];
    const { written, backupPath } = writeCandidateProfiles(candidates);
    const taskIdSet = new Set(summary.generatedTaskProfiles);
    summary.writtenTaskProfiles = written.filter((id) => [...taskIdSet].some((base) => id === base || id.startsWith(`${base}-`)));
    summary.writtenProfiles = written.filter((id) => !summary.writtenTaskProfiles.includes(id));
    summary.postWriteChecks = await runPostWriteChecks(backupPath);
  }

  summary.pass = summary.cases.every((item) => item.pass) && (!writeProfiles || summary.writtenProfiles.length > 0);
  saveJson(join(runDir, "summary.json"), summary);
  console.log(`\nSUMMARY ${summary.pass ? "PASS" : "FAIL"}`);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
