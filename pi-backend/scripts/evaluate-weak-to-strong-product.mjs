import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const backend = process.env.PI_BACKEND_URL || "http://127.0.0.1:3000";
const weakModel = process.env.PI_EVAL_WEAK_MODEL || "opencode-go/deepseek-v4-flash";
const strongModel = process.env.PI_EVAL_STRONG_MODEL || "opencode-go/deepseek-v4-pro";
const cwd = process.env.PI_EVAL_CWD || process.cwd();
const outDir = process.env.PI_EVAL_OUT_DIR || join(cwd, "agent_memory", "eval_runs");
const runId = process.env.PI_EVAL_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const runDir = join(outDir, runId);
mkdirSync(runDir, { recursive: true });

const caseSpec = {
  id: "weak-to-strong-product",
  title: "弱模型在少量强模型辅助下达到强模型效果",
  task: `你是产品与系统架构负责人。请设计一套 Agent 产品方案：目标是让弱模型在少量强模型 planner/reviewer/coach 的帮助下，达到接近强模型甚至超过强模型单跑的任务完成质量。

必须覆盖：
1. MultiAgent 如何自动拆成多个子任务并合成最终结果
2. Workflow 如何复用多个 Profile 完成同类任务
3. Train/Coach 如何通过用户不断否定，让子 Agent 靠齐 coach/challenger 输出
4. 至少 6 个可量化验收指标
5. 三个真实失败案例与修复策略
6. 一页 MVP 落地与真实评测计划`,
  rubric: [
    "MultiAgent 自动拆解与合成",
    "Workflow 多 Profile 复用",
    "Train/Coach 用户否定闭环",
    "弱模型接近强模型的指标体系",
    "失败案例与修复策略",
    "MVP 与真实评测计划",
  ],
  minScore: 82,
  maxStrongGap: 8,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const res = await fetch(`${backend}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(data).slice(0, 1200)}`);
  return data;
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

async function runPiModel(model, prompt, label, timeoutMs = 240000) {
  const resultPath = join(runDir, `${label}.json`);
  if (process.env.PI_EVAL_REUSE === "1") {
    try {
      const cached = JSON.parse(readFileSync(resultPath, "utf-8"));
      if (cached?.text) return cached;
    } catch {}
  }
  const workDir = join(runDir, label);
  mkdirSync(workDir, { recursive: true });
  const child = spawn("pi", ["--print", "--mode", "json", "--model", model, "--no-tools"], { cwd: workDir });
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
      const result = { model, code, text: finalText.trim(), usage, stderr, elapsedMs: Date.now() - startedAt };
      writeFileSync(resultPath, JSON.stringify(result, null, 2));
      if (code !== 0 || !result.text) reject(new Error(`${label} failed code=${code} textLen=${result.text.length} stderr=${stderr.slice(0, 500)}`));
      else resolve(result);
    });
    child.on("error", reject);
  });
}

async function waitSession(sessionId, timeoutMs = 900000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const monitor = await request("/api/monitor");
    const session = (monitor.sessions || []).find((item) => item.id === sessionId);
    if (session?.status === "done") return session;
    if (session?.status === "error") throw new Error(`session ${sessionId} error: ${session.error}`);
    await wait(1500);
  }
  throw new Error(`session ${sessionId} timed out`);
}

async function runOrchestration(options = {}) {
  const resultPath = join(runDir, "multiagent-session.json");
  if (process.env.PI_EVAL_REUSE === "1" && !options.force) {
    try {
      const session = JSON.parse(readFileSync(resultPath, "utf-8"));
      const childTasks = (session.tasks || []).filter((task) => task.id !== "lead-agent" && task.id !== "artifact-reviewer-agent");
      const text = String(session.output || session.finalOutput || "");
      if (session.status === "done" && text) return { sessionId: session.id, session, text, pass: childTasks.length >= 2 && childTasks.every((task) => task.status === "completed") && text.length >= 1000 };
    } catch {}
  }
  const sessionId = randomUUID();
  const input = `真实验收：请用 MultiAgent 自动拆解执行，而不是单 Agent 直接回答。\n\n${caseSpec.task}`;
  const start = await request("/api/orchestrate", {
    method: "POST",
    body: JSON.stringify({ input, cwd, sessionId }),
  });
  const session = await waitSession(start.sessionId || sessionId);
  writeFileSync(resultPath, JSON.stringify(session, null, 2));
  const childTasks = (session.tasks || []).filter((task) => task.id !== "lead-agent" && task.id !== "artifact-reviewer-agent");
  return {
    sessionId: start.sessionId || sessionId,
    session,
    text: String(session.output || session.finalOutput || ""),
    pass: session.status === "done" && childTasks.length >= 2 && childTasks.every((task) => task.status === "completed") && String(session.output || "").length >= 1000,
  };
}

async function createWorkflow() {
  const res = await request("/api/workflows", {
    method: "POST",
    body: JSON.stringify({
      name: `Eval Weak-to-Strong ${runId}`,
      description: "用多个 Profile 复用弱模型+强模型审查流程完成一次产品方案任务",
      cwd,
      reviewPolicy: "lead_only",
      tasks: [
        {
          id: "wf-user",
          name: "用户与场景 Profile",
          profileId: "general-executor",
          model: "opencode-go/deepseek-v4-flash",
          prompt: "定义目标用户、任务场景和成功/失败边界。",
          deps: [],
          acceptanceCriteria: ["覆盖目标用户", "覆盖场景", "给下游交接包"],
        },
        {
          id: "wf-loop",
          name: "闭环机制 Profile",
          profileId: "artifact-flow",
          model: "opencode-go/deepseek-v4-flash",
          prompt: "设计 MultiAgent、Workflow、Train/Coach 三个闭环如何协作。",
          deps: ["wf-user"],
          acceptanceCriteria: ["覆盖三套机制", "说明输入输出", "给下游交接包"],
        },
        {
          id: "wf-metrics",
          name: "指标与评测 Profile",
          profileId: "artifact-reviewer",
          model: "opencode-go/deepseek-v4-flash",
          prompt: "提出量化指标、真实评测方法、失败模式和修复策略。",
          deps: ["wf-loop"],
          acceptanceCriteria: ["至少 6 个指标", "真实评测方法", "失败修复"],
        },
      ],
    }),
  });
  return res.workflow;
}

async function runWorkflow() {
  const resultPath = join(runDir, "workflow-session.json");
  if (process.env.PI_EVAL_REUSE === "1") {
    try {
      const cached = JSON.parse(readFileSync(resultPath, "utf-8"));
      const session = cached.session;
      const workflow = cached.workflow;
      const childTasks = (session.tasks || []).filter((task) => task.id !== "lead-agent" && task.id !== "artifact-reviewer-agent");
      const profiles = new Set(childTasks.map((task) => task.profileId).filter(Boolean));
      const text = String(session.output || session.finalOutput || "");
      if (session.status === "done" && text) return { workflow, sessionId: session.id, session, text, pass: childTasks.length >= 3 && profiles.size >= 2 && text.length >= 1000 };
    } catch {}
  }
  const workflow = await createWorkflow();
  const sessionId = randomUUID();
  const started = await request(`/api/workflows/${encodeURIComponent(workflow.id)}/run`, {
    method: "POST",
    body: JSON.stringify({ input: caseSpec.task, cwd, sessionId }),
  });
  const session = await waitSession(started.sessionId || sessionId);
  writeFileSync(resultPath, JSON.stringify({ workflow, session }, null, 2));
  const childTasks = (session.tasks || []).filter((task) => task.id !== "lead-agent" && task.id !== "artifact-reviewer-agent");
  const profiles = new Set(childTasks.map((task) => task.profileId).filter(Boolean));
  return {
    workflow,
    sessionId: started.sessionId || sessionId,
    session,
    text: String(session.output || session.finalOutput || ""),
    pass: session.status === "done" && childTasks.length >= 3 && profiles.size >= 2 && String(session.output || "").length >= 1000,
  };
}

async function waitTraining(sessionId, targetRound, timeoutMs = 600000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const data = await request(`/api/train/${encodeURIComponent(sessionId)}`);
    const training = data.training;
    if (training?.status === "error") throw new Error(`train error: ${training.lastError}`);
    if (training?.currentRound >= targetRound && training?.status !== "running") return training;
    await wait(1500);
  }
  throw new Error(`train round ${targetRound} timed out`);
}

async function sessionIsActive(sessionId) {
  try {
    await request(`/api/train/${encodeURIComponent(sessionId)}`);
    return true;
  } catch {
    return false;
  }
}

async function runTrainOnSession(sessionId) {
  const resultPath = join(runDir, "train-result.json");
  if (process.env.PI_EVAL_REUSE === "1") {
    try {
      const cached = JSON.parse(readFileSync(resultPath, "utf-8"));
      const rounds = cached.round2?.rounds || [];
      const scores = rounds.map((round) => Number(round.alignment?.score || 0)).filter((score) => score > 0);
      const finalScore = Math.max(...scores, 0);
      if (rounds.length >= 2 && cached.saved?.profile?.id && finalScore >= 80) return { training: cached.round2, saved: cached.saved, pass: true, scores };
    } catch {}
  }
  await request(`/api/train/${encodeURIComponent(sessionId)}/start`, { method: "POST", body: JSON.stringify({}) });
  const round1 = await waitTraining(sessionId, 1);
  await request(`/api/train/${encodeURIComponent(sessionId)}/start`, { method: "POST", body: JSON.stringify({}) });
  const round2 = await waitTraining(sessionId, 2);
  const saved = await request(`/api/train/${encodeURIComponent(sessionId)}/save`, {
    method: "POST",
    body: JSON.stringify({ name: `Eval Trained Profile ${runId}` }),
  });
  writeFileSync(resultPath, JSON.stringify({ round1, round2, saved }, null, 2));
  const rounds = round2.rounds || [];
  const scores = rounds.map((round) => Number(round.alignment?.score || 0)).filter((score) => score > 0);
  const finalScore = Math.max(...scores, 0);
  return {
    training: round2,
    saved,
    pass: rounds.length >= 2 && Boolean(round2.hasChallengerOutput) && Boolean(saved.profile?.id) && finalScore >= 80,
    scores,
  };
}

async function judgeOutputs(weak, strong, multiagent, workflow, train) {
  const prompt = `你是严格评测员。请按 rubric 比较弱模型单跑、强模型单跑、MultiAgent 输出、Workflow 输出，并判断 Train/Coach 是否形成了弱模型靠齐强模型的闭环。
只返回 JSON，不要 markdown。

Rubric：${JSON.stringify(caseSpec.rubric, null, 2)}

弱模型单跑：
${weak.text}

强模型单跑：
${strong.text}

MultiAgent 输出：
${multiagent.text}

Workflow 输出：
${workflow.text}

Train/Coach 状态：
${JSON.stringify({ rounds: train.training.rounds, scores: train.scores, bestScore: Math.max(...train.scores, 0), savedProfileId: train.saved.profile?.id }, null, 2)}

返回格式：
{
  "weak_score": 0,
  "strong_score": 0,
  "multiagent_score": 0,
  "workflow_score": 0,
  "train_alignment_score": 0,
  "multiagent_pass": true,
  "workflow_pass": true,
  "train_pass": true,
  "overall_pass": true,
  "reasons": [""],
  "missing": [""],
  "fix_suggestions": [""]
}`;
  const judged = await runPiModel(strongModel, prompt, "judge", 240000);
  const match = judged.text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`judge did not return JSON: ${judged.text.slice(0, 1000)}`);
  const parsed = JSON.parse(match[0]);
  parsed.multiagent_pass = Boolean(parsed.multiagent_pass)
    && Number(parsed.multiagent_score) >= caseSpec.minScore
    && Number(parsed.multiagent_score) >= Number(parsed.strong_score) - caseSpec.maxStrongGap;
  parsed.workflow_pass = Boolean(parsed.workflow_pass)
    && Number(parsed.workflow_score) >= caseSpec.minScore - 2
    && Number(parsed.workflow_score) >= Number(parsed.strong_score) - caseSpec.maxStrongGap - 2;
  parsed.train_pass = Boolean(parsed.train_pass) && (Number(parsed.train_alignment_score) >= 70 || Math.max(...(train.scores || []), 0) >= 80);
  parsed.overall_pass = Boolean(parsed.overall_pass) && parsed.multiagent_pass && parsed.workflow_pass && parsed.train_pass;
  return { ...judged, parsed };
}

const summary = { runId, runDir, backend, cwd, weakModel, strongModel, case: caseSpec };
console.log(`Run dir: ${runDir}`);

console.log("\n== Weak single model ==");
const weak = await runPiModel(weakModel, caseSpec.task, "weak", 240000);
console.log(`weak chars=${weak.text.length} elapsed=${weak.elapsedMs}ms`);

console.log("\n== Strong single model ==");
const strong = await runPiModel(strongModel, caseSpec.task, "strong", 300000);
console.log(`strong chars=${strong.text.length} elapsed=${strong.elapsedMs}ms`);

console.log("\n== MultiAgent ==");
const multiagent = await runOrchestration();
console.log(`multiagent pass=${multiagent.pass} chars=${multiagent.text.length} tasks=${multiagent.session.tasks?.length || 0}`);

console.log("\n== Workflow ==");
const workflow = await runWorkflow();
console.log(`workflow pass=${workflow.pass} chars=${workflow.text.length} workflowId=${workflow.workflow.id}`);

console.log("\n== Train/Coach ==");
const trainSource = await sessionIsActive(multiagent.sessionId) ? multiagent : await runOrchestration({ force: true });
if (trainSource.sessionId !== multiagent.sessionId) {
  console.log(`multiagent active session refreshed for train: ${trainSource.sessionId}`);
  multiagent.sessionId = trainSource.sessionId;
  multiagent.session = trainSource.session;
  multiagent.text = trainSource.text;
  multiagent.pass = trainSource.pass;
}
const train = await runTrainOnSession(multiagent.sessionId);
console.log(`train pass=${train.pass} scores=${train.scores.join(",")}`);

console.log("\n== Judge ==");
const judge = await judgeOutputs(weak, strong, multiagent, workflow, train);
console.log(JSON.stringify(judge.parsed, null, 2));

summary.results = {
  weak: { elapsedMs: weak.elapsedMs, textChars: weak.text.length, usage: weak.usage },
  strong: { elapsedMs: strong.elapsedMs, textChars: strong.text.length, usage: strong.usage },
  multiagent: {
    pass: multiagent.pass,
    sessionId: multiagent.sessionId,
    status: multiagent.session.status,
    taskCount: multiagent.session.tasks?.length || 0,
    childTaskCount: (multiagent.session.tasks || []).filter((task) => task.id !== "lead-agent" && task.id !== "artifact-reviewer-agent").length,
    textChars: multiagent.text.length,
    modelUsage: multiagent.session.modelUsage || null,
  },
  workflow: {
    pass: workflow.pass,
    workflowId: workflow.workflow.id,
    sessionId: workflow.sessionId,
    status: workflow.session.status,
    taskCount: workflow.session.tasks?.length || 0,
    textChars: workflow.text.length,
    modelUsage: workflow.session.modelUsage || null,
  },
  train: {
    pass: train.pass,
    rounds: train.training.rounds?.length || 0,
    currentRound: train.training.currentRound,
    scores: train.scores,
    savedProfileId: train.saved.profile?.id || "",
  },
  judge: judge.parsed,
};
summary.pass = multiagent.pass && workflow.pass && train.pass && judge.parsed.overall_pass;
summary.cost = {
  weakSingle: Number(weak.usage?.cost?.total || 0),
  strongSingle: Number(strong.usage?.cost?.total || 0),
  multiagent: Number(multiagent.session.modelUsage?.totalCost || 0),
  workflow: Number(workflow.session.modelUsage?.totalCost || 0),
};
writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`\nSUMMARY ${summary.pass ? "PASS" : "FAIL"}`);
console.log(JSON.stringify(summary, null, 2));
if (!summary.pass) process.exit(1);
