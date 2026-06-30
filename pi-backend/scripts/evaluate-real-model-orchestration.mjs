import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const backend = process.env.PI_BACKEND_URL || "http://127.0.0.1:3000";
const weakModel = process.env.PI_EVAL_WEAK_MODEL || "opencode-go/deepseek-v4-flash";
const strongModel = process.env.PI_EVAL_STRONG_MODEL || "opencode-go/deepseek-v4-pro";
const cwd = process.env.PI_EVAL_CWD || process.cwd();
const outDir = process.env.PI_EVAL_OUT_DIR || join(cwd, "agent_memory", "eval_runs");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = join(outDir, runId);
mkdirSync(runDir, { recursive: true });

const cases = [
  {
    id: "product-design",
    title: "把弱模型变成强模型效果的产品方案",
    task: `你是产品架构师。请为一个 Agent 产品设计一套机制：目标是让弱模型在少量强模型 coach/challenger 的帮助下，达到接近强模型的任务完成质量。
要求输出：
1. 目标用户与使用场景
2. 核心闭环：MultiAgent、Workflow、Train/Coach 如何协作
3. 至少 5 个可量化验收指标
4. 失败模式与修复策略
5. 一页 MVP 落地计划`,
    rubric: ["覆盖目标用户", "说明三套机制协作", "给出量化验收指标", "列出失败模式", "给出 MVP 计划"],
    minScore: 82,
    minImprovement: 0,
  },
  {
    id: "code-review-plan",
    title: "代码审查与修复计划",
    task: `你是资深代码审查负责人。请审查一个假设变更：前端 session 列表从全量读取 JSONL 改为只扫 header 和前 200 行；后端 MultiAgent 新增 Train/Coach 状态机。请输出：
1. 主要风险清单
2. 必测用例
3. 性能回归指标
4. 回滚方案
5. 是否建议上线及条件`,
    rubric: ["风险清单", "必测用例", "性能回归指标", "回滚方案", "上线条件"],
    minScore: 80,
    minImprovement: 0,
  },
  {
    id: "longform-synthesis",
    title: "长文信息合成",
    task: `请把以下信息合成为一份执行备忘录：目标是让弱模型在少量强模型辅助下接近强模型效果；已有机制包括 MultiAgent 拆任务、Workflow 复用 profile、Train/Coach 用 challenger 输出调教弱模型、Profile 保存经验。请输出：
1. 决策摘要
2. 技术路径
3. 指标体系
4. 三阶段路线图
5. 当前最大风险`,
    rubric: ["决策摘要", "技术路径", "指标体系", "路线图", "最大风险"],
    minScore: 80,
    minImprovement: 0,
  },
  {
    id: "technical-diagnosis",
    title: "诊断 Session 加载慢并给修复方案",
    task: `你是全栈工程负责人。基于下面真实现象做诊断：Pi Web 浏览器转很久，出现 Loading sessions timed out。项目使用 Next.js 前端读取 ~/.pi/agent/sessions 下 jsonl 会话文件，后端有 MultiAgent monitor-server.js。
要求输出：
1. 至少 4 个可能根因，按概率排序
2. 每个根因的验证方法
3. 不依赖 next build 的最小修复方案
4. 性能指标：冷启动、热刷新、会话列表 API P95
5. 回滚策略`,
    rubric: ["根因排序", "验证方法", "最小修复", "性能指标", "回滚策略"],
    minScore: 80,
    minImprovement: 0,
  },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const res = await fetch(`${backend}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
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

async function runPiModel(model, prompt, label, timeoutMs = 180000) {
  const workDir = join(runDir, label);
  mkdirSync(workDir, { recursive: true });
  const child = spawn("pi", ["--print", "--mode", "json", "--model", model, "--no-tools"], { cwd: workDir });
  child.stdin.end(prompt);
  let buffer = "";
  let finalText = "";
  let thinkingChars = 0;
  let usage = null;
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.type === "message_update") {
          const ae = ev.assistantMessageEvent;
          if (ae?.type === "text_delta" && ae.delta) finalText += ae.delta;
          if (ae?.type === "thinking_delta" && ae.delta) thinkingChars += ae.delta.length;
        }
        if (ev.type === "agent_end") {
          const last = [...(ev.messages || [])].reverse().find((m) => m.role === "assistant");
          const text = extractAssistantText(last);
          if (text) finalText = text;
          if (last?.usage) usage = last.usage;
        }
      } catch {}
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const startedAt = Date.now();
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      const elapsedMs = Date.now() - startedAt;
      const result = { model, code, text: finalText.trim(), thinkingChars, usage, stderr, elapsedMs };
      writeFileSync(join(runDir, `${label}.json`), JSON.stringify(result, null, 2));
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
    if (session?.status === "error") throw new Error(`orchestration ${sessionId} error: ${session.error}`);
    await wait(1500);
  }
  throw new Error(`orchestration ${sessionId} timed out`);
}

async function runOrchestration(testCase) {
  const sessionId = randomUUID();
  const input = `真实评测任务：${testCase.title}\n\n请用 MultiAgent 拆解执行，不要只给泛泛建议。\n弱模型子 Agent 可以执行局部任务；Lead/Coach/Reviewer 使用强模型做少量规划、审查和合成。\n\n任务正文：\n${testCase.task}`;
  const res = await request("/api/orchestrate", {
    method: "POST",
    body: JSON.stringify({ input, cwd, sessionId }),
  });
  const session = await waitSession(res.sessionId || sessionId);
  writeFileSync(join(runDir, `${testCase.id}-orchestrated-session.json`), JSON.stringify(session, null, 2));
  return { sessionId: res.sessionId || sessionId, session, text: String(session.output || session.finalOutput || "") };
}

async function judgeCase(testCase, weak, strong, orchestrated) {
  const judgePrompt = `你是严格评测员。请按 rubric 比较三个输出：弱模型单跑、强模型单跑、弱模型+少量强模型编排。
只返回 JSON，不要 markdown。
评分标准：0-100，强模型单跑不是默认满分；重点看是否满足 rubric、结构、可执行性、具体性。

Rubric：${JSON.stringify(testCase.rubric, null, 2)}

输出 A：弱模型单跑
${weak.text}

输出 B：强模型单跑
${strong.text}

输出 C：编排输出
${orchestrated.text}

返回格式：
{
  "weak_score": 0,
  "strong_score": 0,
  "orchestrated_score": 0,
  "orchestrated_vs_strong": "better|similar|worse",
  "pass": true,
  "reasons": [""],
  "missing": [""],
  "fix_suggestions": [""]
}`;
  const judged = await runPiModel(strongModel, judgePrompt, `${testCase.id}-judge`, 180000);
  const match = judged.text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`judge did not return JSON for ${testCase.id}: ${judged.text.slice(0, 1000)}`);
  const parsed = JSON.parse(match[0]);
  parsed.pass = Boolean(parsed.pass)
    && Number(parsed.orchestrated_score) >= testCase.minScore
    && Number(parsed.orchestrated_score) >= Math.min(Number(parsed.weak_score) + testCase.minImprovement, 90)
    && Number(parsed.orchestrated_score) >= Number(parsed.strong_score) - 8;
  return { ...judged, parsed };
}

const summary = { runId, runDir, backend, cwd, weakModel, strongModel, cases: [] };
for (const testCase of cases) {
  console.log(`\n== ${testCase.id}: ${testCase.title} ==`);
  const weak = await runPiModel(weakModel, testCase.task, `${testCase.id}-weak`, 180000);
  console.log(`weak textLen=${weak.text.length} elapsed=${weak.elapsedMs}ms`);
  const strong = await runPiModel(strongModel, testCase.task, `${testCase.id}-strong`, 240000);
  console.log(`strong textLen=${strong.text.length} elapsed=${strong.elapsedMs}ms`);
  const orchestrated = await runOrchestration(testCase);
  console.log(`orchestrated textLen=${orchestrated.text.length} tasks=${orchestrated.session.tasks?.length || 0}`);
  const judge = await judgeCase(testCase, weak, strong, orchestrated);
  console.log(`scores weak=${judge.parsed.weak_score} strong=${judge.parsed.strong_score} orchestrated=${judge.parsed.orchestrated_score} pass=${judge.parsed.pass}`);
  summary.cases.push({
    id: testCase.id,
    title: testCase.title,
    thresholds: { minScore: testCase.minScore, minImprovement: testCase.minImprovement },
    weak: { elapsedMs: weak.elapsedMs, textChars: weak.text.length, usage: weak.usage },
    strong: { elapsedMs: strong.elapsedMs, textChars: strong.text.length, usage: strong.usage },
    orchestrated: {
      sessionId: orchestrated.sessionId,
      status: orchestrated.session.status,
      taskCount: orchestrated.session.tasks?.length || 0,
      childTaskCount: (orchestrated.session.tasks || []).filter((task) => task.id !== "lead-agent").length,
      textChars: orchestrated.text.length,
      models: [...new Set((orchestrated.session.tasks || []).map((task) => task.model).filter(Boolean))],
      profiles: [...new Set((orchestrated.session.tasks || []).map((task) => task.profileId).filter(Boolean))],
      modelUsage: orchestrated.session.modelUsage || null,
    },
    judge: judge.parsed,
  });
}
summary.pass = summary.cases.every((item) => item.judge.pass);
summary.cost = {
  weakSingleTotal: Number(summary.cases.reduce((sum, item) => sum + Number(item.weak.usage?.cost?.total || 0), 0).toFixed(8)),
  strongSingleTotal: Number(summary.cases.reduce((sum, item) => sum + Number(item.strong.usage?.cost?.total || 0), 0).toFixed(8)),
  orchestratedTotal: Number(summary.cases.reduce((sum, item) => sum + Number(item.orchestrated.modelUsage?.totalCost || 0), 0).toFixed(8)),
};
writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`\nSUMMARY ${summary.pass ? "PASS" : "FAIL"}`);
console.log(JSON.stringify(summary, null, 2));
if (!summary.pass) process.exit(1);
