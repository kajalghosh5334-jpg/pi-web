#!/usr/bin/env node
import express from "express";
import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID, createHash } from "crypto";

// ponytail: repo-root is the directory containing this file (pi-backend/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = __dirname;
const FRONTEND_ROOT = process.env.PI_FRONTEND_ROOT || resolve(__dirname, "../pi-frontend");

const app = express();
const PORT = Number(process.env.PI_MONITOR_PORT) || 3000;
const PI_BIN = process.env.PI_BIN_PATH || "/usr/local/bin/pi";
const PI_ENV = { ...process.env, PATH: (process.env.PI_PATH_PREFIX || "/usr/local/bin:") + process.env.PATH };
const WORKSPACE = process.env.PI_WORKSPACE_DIR || "/tmp/pi-multi-agent";
const LEAD_TASK_ID = "lead-agent";
const ARTIFACT_REVIEWER_TASK_ID = "artifact-reviewer-agent";
const LEAD_MODEL = "opencore-go/deepseek-v4-pro";
const PROFILE_STORE = join(REPO_ROOT, "agent-profiles.json");
const WORKFLOW_STORE = join(REPO_ROOT, "workflows.json");
const LEAD_POLICY_PATH = join(REPO_ROOT, "lead-agent.md");
const SUBAGENT_DEFAULTS_PATH = join(REPO_ROOT, "sub-agent-defaults.md");
const SKILL_ROOT = process.env.PI_MULTI_AGENT_SKILL_ROOT || join(REPO_ROOT, "skills");
const MEMORY_ROOT = process.env.PI_MULTI_AGENT_MEMORY_ROOT || join(REPO_ROOT, "agent_memory");
const PROJECT_MEMORY_ROOT = join(MEMORY_ROOT, "projects");
const CONTEXT_MEMORY_PATH = join(MEMORY_ROOT, "context.md");
const PROGRESS_MEMORY_PATH = join(MEMORY_ROOT, "progress.md");
const BUGS_MEMORY_PATH = join(MEMORY_ROOT, "bugs.md");
const MAX_SKILL_BLOCK_CHARS = 2600;
const MAX_PROFILE_SKILLS_CHARS = 9000;
const skillPromptCache = new Map();
const memoryWriteTimers = new Map();

app.use(express.json());
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ── State ──────────────────────────────────────────────────────────────────
const wsClients = new Set();
const activeSessions = new Map(); // sessionId → { input, tasks, status, output, error, startedAt, updatedAt, plan, pendingConfirmation }
const runningProcesses = new Map(); // sessionId → Set<{ proc, taskId, model, cwd }>
const guardianState = {
  status: "idle",
  model: "opencore-go/deepseek-v4-flash",
  lastCheck: 0,
  interventionCount: 0,
  lastPlan: null,
  lastError: null,
};
const modelSwitchLog = [];
const MAX_LOG = 100;

const DEFAULT_AGENT_PROFILES = {
  "backend-guardian": {
    id: "backend-guardian",
    name: "后端 Guardian / 路由 Agent",
    match: ["pi-backend", "后端", "Guardian", "路由", "monitor-server", "backend"],
    defaultModel: "opencore-go/glm-5.2",
    skills: ["engineering-mode", "output-spec"],
    availableSkills: ["engineering-mode", "output-spec", "stage-flow", "output-engine"],
    collaborationProtocol: "先做最小 Task Understanding，再执行后端修改；输出必须包含影响范围、验证结果、给下游的交付物；发现风险同步进 bugs/context/progress。",
    projectConfig: {
      preferredPaths: ["monitor-server.js"],
      qualityBar: "后端变更必须说明影响范围、状态流转和验证方式。",
    },
    systemPromptPatch: "你擅长后端路由、调度器、状态机、Express/WebSocket、模型 fallback 和守护进程设计。优先读取 monitor-server.js 和相关 API 代码。",
    experience: 0,
    successes: 0,
    failures: 0,
    recentTasks: [],
  },
  "frontend-monitor": {
    id: "frontend-monitor",
    name: "前端监控 / 会话 UI Agent",
    match: ["pi-frontend", "前端", "监控", "AppShell", "ChatWindow", "useOrchestrate", "SubAgentList", "frontend"],
    defaultModel: "opencore-go/glm-5.2",
    skills: ["engineering-mode", "output-spec", "frontend-design"],
    availableSkills: ["engineering-mode", "output-spec", "frontend-design", "stage-flow", "output-engine"],
    collaborationProtocol: "围绕会话 UI、监控面板、交互一致性执行；修改前先锁定影响文件，修改后必须说明用户侧行为变化、状态同步链路和验证方式。",
    projectConfig: {
      preferredPaths: ["../pi-frontend/components/AppShell.tsx", "../pi-frontend/hooks/useOrchestrate.ts"],
      qualityBar: "前端修改必须说明用户可见变化、状态同步链路和验证方式。",
    },
    systemPromptPatch: "你擅长 React/Next.js 前端状态管理、会话持久化、监控面板、WebSocket UI 和用户交互一致性。优先读取 AppShell、ChatWindow、useOrchestrate、monitor 组件。",
    experience: 0,
    successes: 0,
    failures: 0,
    recentTasks: [],
  },
  "artifact-flow": {
    id: "artifact-flow",
    name: "物料流转 / 协作协议 Agent",
    match: ["物料", "artifact", "registry", "交付物", "流转", "协作", "handoff"],
    defaultModel: "opencore-go/glm-5.2",
    skills: ["output-spec", "output-engine"],
    availableSkills: ["stage-manager", "stage-flow", "output-engine", "output-spec"],
    collaborationProtocol: "专注 producer/consumer/status/issues/version；必须把上下游关系、缺口、可复用交付物说清楚，不能只给模糊摘要。",
    projectConfig: {
      preferredPaths: ["<WORKSPACE>/<sessionId>/artifacts", "monitor-server.js"],
      qualityBar: "交付物必须清楚标出 producer/consumer/status/issues。",
    },
    systemPromptPatch: "你擅长多 Agent 物料协议、artifact registry、上下游交付、质量门、修订循环和任务状态流转。输出必须关注 producer/consumer/status/issues。",
    experience: 0,
    successes: 0,
    failures: 0,
    recentTasks: [],
  },
  "artifact-reviewer": {
    id: "artifact-reviewer",
    name: "审稿 / 可用性裁决助手",
    match: ["review", "审稿", "usable", "可用性", "artifact review", "质量门", "验收"],
    defaultModel: "opencore-go/deepseek-v4-flash",
    skills: ["output-spec", "output-engine"],
    availableSkills: ["stage-manager", "output-spec", "output-engine", "artifact-storage"],
    collaborationProtocol: "只负责为 Lead 生成审稿备忘，不直接替 Lead 做最终 accept/reject。必须按 usable 标准指出可用、不可用、缺口和建议。",
    projectConfig: {
      preferredPaths: ["/tmp/pi-multi-agent/<sessionId>/artifacts"],
      qualityBar: "审稿输出必须明确 usable 判断依据、关键缺口、建议动作。",
    },
    systemPromptPatch: "你是 Lead 的审稿助手。你的职责是替 Lead 先做一轮 artifact 可用性梳理，输出审稿备忘，而不是越权做最终裁决。",
    experience: 0,
    successes: 0,
    failures: 0,
    recentTasks: [],
  },
  "session-memory": {
    id: "session-memory",
    name: "会话记忆 / 阶段状态 Agent",
    match: ["memory", "context.md", "progress.md", "bugs.md", "记忆", "阶段状态", "上下文"],
    defaultModel: "opencore-go/deepseek-v4-flash",
    skills: ["output-spec"],
    availableSkills: ["stage-flow", "stage-manager", "output-spec", "output-engine"],
    collaborationProtocol: "专注长期状态维护；任何输出都要落到 context/progress/bugs 三份记忆文件，保证下一轮 Agent 可直接接力。",
    projectConfig: {
      preferredPaths: ["agent_memory/context.md", "agent_memory/progress.md", "agent_memory/bugs.md"],
      qualityBar: "记忆更新必须能支撑下一轮 Agent 直接接手。",
    },
    systemPromptPatch: "你擅长 session/context/progress/bugs 维护、阶段状态归档、长期上下文压缩与恢复。优先关注 agent_memory 与 flowState 的一致性。",
    experience: 0,
    successes: 0,
    failures: 0,
    recentTasks: [],
  },
  "debug-teacher": {
    id: "debug-teacher",
    name: "调教 / 强模型修复 Agent",
    match: ["debug", "调教", "修复", "bugfix", "不可用", "复盘", "teaching"],
    defaultModel: LEAD_MODEL,
    skills: ["engineering-mode", "output-spec"],
    availableSkills: ["engineering-mode", "output-spec", "output-engine", "stage-flow"],
    collaborationProtocol: "当原子 Agent 结果不可用时，按 Lead 的可用标准执行一次强模型修复；必须返回修改内容、修改原因、原子 Agent 以后应该避免什么。",
    projectConfig: {
      preferredPaths: ["monitor-server.js", "../pi-frontend/components/AppShell.tsx"],
      qualityBar: "修复结果必须说明改了什么、为什么这样改、以后如何避免。",
    },
    systemPromptPatch: "你不是普通执行 Agent，而是强模型纠偏器。目标是修复明确 bug、给出修改原因，并沉淀成可复用的 teaching note。若执行代码修改，默认只允许增改，不允许自由删减；必须先列出保留代码块，若必须删除则先声明删除理由，并尽量用 diff/最小替换块表达修改。",
    experience: 0,
    successes: 0,
    failures: 0,
    recentTasks: [],
  },
  "agent-coach": {
    id: "agent-coach",
    name: "Lead 调教链路 / 强模型示范助手",
    match: ["coach", "调教", "compare", "差异", "不满意", "继续优化", "teaching"],
    defaultModel: LEAD_MODEL,
    skills: ["output-engine", "output-spec"],
    availableSkills: ["engineering-mode", "output-engine", "output-spec", "stage-flow"],
    collaborationProtocol: "只有在用户明确表示对当前最终呈现不满意时才进入。负责比较原任务目标、原子 Agent 输出、用户指出的不满意点，给出更强版本和 teaching note。",
    projectConfig: {
      preferredPaths: ["/tmp/pi-multi-agent/<sessionId>/artifacts"],
      qualityBar: "必须明确指出差别、改动原因、回灌经验。",
    },
    systemPromptPatch: "你是 Lead 调教链路中的强模型示范助手。不要包办整个调教流程；你的职责是先示范理想方案、分析原子 Agent 失误原因，并给出可回灌的 teaching note。",
    experience: 0,
    successes: 0,
    failures: 0,
    recentTasks: [],
  },
  "memory-curator": {
    id: "memory-curator",
    name: "记忆整理 / 沉淀助手",
    match: ["memory", "curator", "context", "progress", "bugs", "沉淀", "总结"],
    defaultModel: "opencore-go/deepseek-v4-flash",
    skills: ["output-spec"],
    availableSkills: ["output-spec", "output-engine", "stage-flow", "stage-manager"],
    collaborationProtocol: "负责把本轮已确认结论、阶段推进、bug 和经验整理成给 memory 系统消费的摘要，不替代 Lead 做最终结论。",
    projectConfig: {
      preferredPaths: ["agent_memory/context.md", "agent_memory/progress.md", "agent_memory/bugs.md"],
      qualityBar: "摘要必须可直接写回 context/progress/bugs。",
    },
    systemPromptPatch: "你是记忆整理助手。职责是把本轮确认过的信息沉淀成可复用 memory 摘要。",
    experience: 0,
    successes: 0,
    failures: 0,
    recentTasks: [],
  },
  "general-executor": {
    id: "general-executor",
    name: "通用执行 Agent",
    match: [],
    defaultModel: "opencore-go/deepseek-v4-flash",
    skills: ["output-engine", "output-spec"],
    availableSkills: ["output-engine", "output-spec"],
    collaborationProtocol: "任务不明确时先收敛边界；执行后必须给出可交接结果、风险和下一步建议。",
    projectConfig: {
      preferredPaths: [],
      qualityBar: "至少给出可交接结果、风险和下一步建议。",
    },
    systemPromptPatch: "你是通用执行 Agent。任务不明确时先给出最小可执行结果，并标注缺失信息。",
    experience: 0,
    successes: 0,
    failures: 0,
    recentTasks: [],
  },
};

function mergeProfile(base, override = {}) {
  return {
    ...base,
    ...override,
    skills: Array.from(new Set([...(base.skills || []), ...(override.skills || [])])),
    availableSkills: Array.from(new Set([...(base.availableSkills || []), ...(override.availableSkills || []), ...(base.skills || []), ...(override.skills || [])])),
    match: Array.from(new Set([...(base.match || []), ...(override.match || [])])),
    projectConfig: {
      ...(base.projectConfig || {}),
      ...(override.projectConfig || {}),
      preferredPaths: Array.from(new Set([...(base.projectConfig?.preferredPaths || []), ...(override.projectConfig?.preferredPaths || [])])),
    },
  };
}

function loadAgentProfiles() {
  if (!existsSync(PROFILE_STORE)) return structuredClone(DEFAULT_AGENT_PROFILES);
  try {
    const stored = JSON.parse(readFileSync(PROFILE_STORE, "utf-8"));
    const merged = structuredClone(DEFAULT_AGENT_PROFILES);
    for (const [profileId, profile] of Object.entries(stored || {})) {
      merged[profileId] = merged[profileId] ? mergeProfile(merged[profileId], profile) : profile;
    }
    return merged;
  } catch {
    return structuredClone(DEFAULT_AGENT_PROFILES);
  }
}

function saveAgentProfiles(profiles) {
  writeFileSync(PROFILE_STORE, JSON.stringify(profiles, null, 2));
}

function loadWorkflows() {
  if (!existsSync(WORKFLOW_STORE)) return {};
  try {
    return JSON.parse(readFileSync(WORKFLOW_STORE, "utf-8")) || {};
  } catch {
    return {};
  }
}

function saveWorkflows(workflows) {
  writeFileSync(WORKFLOW_STORE, JSON.stringify(workflows, null, 2));
}

function stripSkillFrontmatter(text) {
  return String(text || "").replace(/^---[\s\S]*?---\s*/m, "").trim();
}

function compactSkillText(skillId, rawText) {
  const text = stripSkillFrontmatter(rawText)
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = text.split("\n").map((line) => line.trimEnd());
  const important = [];
  let inCode = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) inCode = !inCode;
    if (!trimmed) continue;
    if (
      inCode ||
      /^#{1,3}\s/.test(trimmed) ||
      /^(角色|覆盖|激活|约束|禁止|必须|输出|执行|触发|规则|Step|Q\d|P\d|完成|验证|风险|物料|阶段)/.test(trimmed) ||
      /^[①②③④⑤⑥⑦⑧⑨⑩一二三四五六七八九十]/.test(trimmed) ||
      /^[-*]\s/.test(trimmed) ||
      /^\d+[.)、]/.test(trimmed)
    ) important.push(line);
    if (important.join("\n").length > MAX_SKILL_BLOCK_CHARS) break;
  }
  const compacted = (important.join("\n") || text).slice(0, MAX_SKILL_BLOCK_CHARS);
  return `### Skill: ${skillId}\n${compacted}`;
}

function loadSkillPromptBlock(skillIds = []) {
  const blocks = [];
  let total = 0;
  for (const skillId of Array.from(new Set(skillIds.filter(Boolean)))) {
    if (skillPromptCache.has(skillId)) {
      const cached = skillPromptCache.get(skillId);
      if (total + cached.length <= MAX_PROFILE_SKILLS_CHARS) {
        blocks.push(cached);
        total += cached.length;
      }
      continue;
    }
    const skillPath = join(SKILL_ROOT, skillId, "SKILL.md");
    if (!existsSync(skillPath)) {
      const missing = `### Skill: ${skillId}\n未找到本地 skill 文件：${skillPath}`;
      skillPromptCache.set(skillId, missing);
      blocks.push(missing);
      total += missing.length;
      continue;
    }
    try {
      const block = compactSkillText(skillId, readFileSync(skillPath, "utf-8"));
      skillPromptCache.set(skillId, block);
      if (total + block.length <= MAX_PROFILE_SKILLS_CHARS) {
        blocks.push(block);
        total += block.length;
      }
    } catch (err) {
      const failed = `### Skill: ${skillId}\n读取失败：${err.message}`;
      skillPromptCache.set(skillId, failed);
      blocks.push(failed);
      total += failed.length;
    }
  }
  return blocks.length ? `==== 已加载 Profile Skills（压缩版） ====\n${blocks.join("\n\n")}\n==== Profile Skills 结束 ====` : "";
}

function loadSkillBlock(skillName) {
  const path = join(SKILL_ROOT, skillName, "SKILL.md");
  if (!existsSync(path)) return "";
  const raw = readFileSync(path, "utf-8");
  const withoutFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, "");
  const lines = withoutFrontmatter.split("\n");
  const important = [];
  for (const line of lines) {
    if (/^#|<角色>|<覆盖|<规则|<约束|<触发|<输出|必须|禁止|交付|验证|状态|流程/.test(line.trim())) {
      important.push(line);
    }
    if (important.join("\n").length > 1800) break;
  }
  const body = important.length ? important.join("\n") : withoutFrontmatter.slice(0, 1800);
  return `\n### Skill: ${skillName}\n${body.slice(0, 1800)}`;
}

const SKILL_ROUTING = {
  leadPlan: ["output-engine", "stage-flow", "sub-model-call", "topic-memory"],
  leadReview: ["stage-manager", "artifact-storage", "output-engine"],
  leadFinalReport: ["output-engine", "stage-flow", "artifact-storage"],
  leadCoaching: ["output-engine", "artifact-storage", "stage-flow"],
  subAgentEngineering: ["engineering-mode", "output-spec"],
  subAgentArtifact: ["artifact-storage", "output-spec"],
  subAgentGeneral: ["output-spec"],
};

function inferTaskSkillScope(task) {
  const text = `${task.name || ""}\n${task.prompt || ""}`;
  if (/代码|编程|工程|bug|修复|实现|接口|状态|React|Next|Express|WebSocket|文件|route|component|hook|monitor-server|AppShell|useOrchestrate/i.test(text)) {
    return "subAgentEngineering";
  }
  if (/物料|artifact|registry|交付物|流转|handoff|producer|consumer|version|质量|审查/i.test(text)) {
    return "subAgentArtifact";
  }
  return "subAgentGeneral";
}

function getRoutedSkillIds(scope, extraSkills = []) {
  const routed = SKILL_ROUTING[scope] || [];
  return Array.from(new Set([...routed, ...extraSkills]));
}

function buildRoutedSkillPrompt(scope, extraSkills = []) {
  return loadSkillPromptBlock(getRoutedSkillIds(scope, extraSkills));
}

function selectAgentProfile(task) {
  const profiles = loadAgentProfiles();
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

function recordAgentProfileResult(profileId, task, success, details = {}) {
  const profiles = loadAgentProfiles();
  const profile = profiles[profileId];
  if (!profile) return;
  profile.experience = (profile.experience || 0) + 1;
  if (success) profile.successes = (profile.successes || 0) + 1;
  else profile.failures = (profile.failures || 0) + 1;

  const runRecord = {
    name: task.name || task.id,
    taskId: task.id,
    success,
    timestamp: Date.now(),
    ...details,
  };
  profile.recentTasks = [runRecord, ...(profile.recentTasks || [])].slice(0, 20);
  profile.runHistory = [runRecord, ...(profile.runHistory || [])].slice(0, 100);

  const model = details.modelUsed || task.model || profile.defaultModel || "unknown";
  profile.modelStats ||= {};
  profile.modelStats[model] ||= { uses: 0, successes: 0, failures: 0, timeouts: 0, totalDurationMs: 0, avgDurationMs: 0 };
  const ms = profile.modelStats[model];
  ms.uses++;
  if (success) ms.successes++; else ms.failures++;
  if (details.status === "timeout") ms.timeouts++;
  if (typeof details.durationMs === "number") {
    ms.totalDurationMs += details.durationMs;
    ms.avgDurationMs = Math.round(ms.totalDurationMs / ms.uses);
  }

  profile.skillStats ||= {};
  for (const skill of details.equippedSkills || []) {
    profile.skillStats[skill] ||= { uses: 0, successes: 0, failures: 0 };
    profile.skillStats[skill].uses++;
    if (success) profile.skillStats[skill].successes++;
    else profile.skillStats[skill].failures++;
  }

  saveAgentProfiles(profiles);
}

function saveProfileExperience(profileId, payload) {
  const profiles = loadAgentProfiles();
  const profile = profiles[profileId];
  if (!profile) return;
  const lesson = cleanInlineText(payload.lesson, 400);
  profile.savedExperiences ||= [];
  profile.savedExperiences = [{
    taskId: payload.taskId,
    taskName: payload.taskName,
    lesson,
    skills: payload.skills || [],
    model: payload.model,
    artifactId: payload.artifactId,
    debugValidated: true,
    savedAt: Date.now(),
  }, ...(profile.savedExperiences || [])].slice(0, 50);
  profile.skills = Array.from(new Set([...(profile.skills || []), ...(payload.skills || [])]));
  if (lesson) {
    profile.systemPromptPatch = `${profile.systemPromptPatch || ""}\n\n经验沉淀：${lesson}`.trim();
  }
  saveAgentProfiles(profiles);
}

function cleanInlineText(text, max = 160) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function slugProfileId(text) {
  const slug = cleanInlineText(text, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `profile-${Date.now()}`;
}

function makeUniqueProfileId(baseId, profiles) {
  if (!profiles[baseId]) return baseId;
  let i = 2;
  while (profiles[`${baseId}-${i}`]) i += 1;
  return `${baseId}-${i}`;
}

function buildProfileMatch(task, profileName, description) {
  return Array.from(new Set([
    cleanInlineText(profileName, 80),
    cleanInlineText(task?.name, 80),
    ...String(description || "").split(/[，,。；;\n]/).map((item) => cleanInlineText(item, 40)),
    ...((task?.skills || []).map((item) => cleanInlineText(item, 40))),
  ].filter(Boolean)));
}

function createProfileFromTask(sessionId, task, options = {}) {
  const profiles = loadAgentProfiles();
  const session = activeSessions.get(sessionId);
  const sourceProfile = task.profileId && profiles[task.profileId]
    ? profiles[task.profileId]
    : selectAgentProfile(task);
  const derivedName = cleanInlineText(options.name || `${task.name || sourceProfile?.name || "子Agent"} Profile`, 80);
  const profileId = makeUniqueProfileId(slugProfileId(derivedName), profiles);
  const coaching = session?.coaching?.sourceTaskId === task.id ? session.coaching : null;
  const userDescription = cleanInlineText(options.description, 400);
  const coachingNote = cleanInlineText(coaching?.teachingNote, 400);
  const lesson = [userDescription, coachingNote].filter(Boolean).join(" | ");
  const skills = Array.from(new Set([...(task.skills || []), ...(sourceProfile?.skills || [])]));
  const availableSkills = Array.from(new Set([...(task.skills || []), ...(sourceProfile?.skills || []), ...(sourceProfile?.availableSkills || [])]));
  const profile = {
    id: profileId,
    name: derivedName,
    match: buildProfileMatch(task, derivedName, userDescription),
    defaultModel: task.model || sourceProfile?.defaultModel || "opencore-go/deepseek-v4-flash",
    skills,
    availableSkills,
    collaborationProtocol: sourceProfile?.collaborationProtocol || "围绕该类任务执行，并输出可交接结果、风险与下一步建议。",
    projectConfig: sourceProfile?.projectConfig || { preferredPaths: [] },
    systemPromptPatch: [
      sourceProfile?.systemPromptPatch || "",
      userDescription ? `派生说明：${userDescription}` : "",
      coachingNote ? `教练确认沉淀：${coachingNote}` : "",
    ].filter(Boolean).join("\n\n").trim(),
    experience: 0,
    successes: 0,
    failures: 0,
    recentTasks: [{
      name: task.name || task.id,
      taskId: task.id,
      success: true,
      timestamp: Date.now(),
      sessionId,
      derivedFromProfileId: sourceProfile?.id,
    }],
    runHistory: [],
    savedExperiences: lesson ? [{
      taskId: task.id,
      taskName: task.name || task.id,
      lesson,
      skills,
      model: task.model,
      artifactId: task.artifactId,
      debugValidated: true,
      savedAt: Date.now(),
    }] : [],
    sourceProfileId: sourceProfile?.id,
    generatedFromTaskId: task.id,
    generatedFromSessionId: sessionId,
    generatedAt: Date.now(),
    generatedBy: coaching ? "coach_confirmed" : "user_confirmed",
  };
  profiles[profileId] = profile;
  saveAgentProfiles(profiles);
  return profile;
}

function createProfileFromSession(sessionId, options = {}) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    const profiles = loadAgentProfiles();
    const derivedName = cleanInlineText(options.name || `${options.sessionName || "Session"} Profile`, 80);
    const profileId = makeUniqueProfileId(slugProfileId(derivedName), profiles);
    const description = cleanInlineText(options.description || options.firstMessage || "", 400);
    const profile = {
      id: profileId,
      name: derivedName,
      match: buildProfileMatch({ name: options.sessionName || derivedName, skills: [] }, derivedName, description),
      defaultModel: options.model || "opencore-go/deepseek-v4-flash",
      skills: [],
      availableSkills: [],
      collaborationProtocol: "从一次对话 session 提炼出的可复用工作方式。",
      projectConfig: { preferredPaths: options.cwd ? [options.cwd] : [] },
      systemPromptPatch: description ? `Session 提炼说明：${description}` : "",
      experience: 0,
      successes: 0,
      failures: 0,
      recentTasks: [],
      runHistory: [],
      savedExperiences: description ? [{ taskId: sessionId, taskName: options.sessionName || sessionId, lesson: description, skills: [], model: options.model, debugValidated: true, savedAt: Date.now() }] : [],
      generatedFromSessionId: sessionId,
      generatedAt: Date.now(),
      generatedBy: "user_confirmed",
    };
    profiles[profileId] = profile;
    saveAgentProfiles(profiles);
    return profile;
  }
  const tasks = (session.tasks || []).filter((task) => task.id !== LEAD_TASK_ID && task.profileId && task.status === "completed");
  if (!tasks.length) throw new Error("no completed sub-agent tasks available");
  const baseTask = tasks[tasks.length - 1];
  const summary = cleanInlineText(options.description || session.output || session.finalOutput || session.input, 400);
  return createProfileFromTask(sessionId, baseTask, {
    name: options.name || `${baseTask.name || "Session"} Profile`,
    description: summary,
  });
}

function createWorkflowFromSession(sessionId, options = {}) {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error("session not found");
  const plan = session.plan;
  if (!plan?.tasks?.length) throw new Error("no planned multi-agent workflow available");
  const workflows = loadWorkflows();
  const name = cleanInlineText(options.name || `${cleanInlineText(session.input || "workflow", 60)} Workflow`, 80);
  const workflowId = makeUniqueProfileId(slugProfileId(name), workflows);
  const workflow = {
    id: workflowId,
    name,
    description: cleanInlineText(options.description || session.output || session.finalOutput || session.input, 400),
    leadProfileId: "lead-agent",
    reviewPolicy: plan.reviewPolicy || "lead_plus_reviewer",
    sourceSessionId: sessionId,
    cwd: session.cwd || "",
    projectId: session.projectId || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tasks: (plan.tasks || []).map((task) => ({
      id: task.id,
      name: task.name,
      profileId: task.profileId || task.profileHint || "general-executor",
      skills: task.skills || [],
      model: task.model,
      modelSource: task.modelSource,
      modelReason: task.modelReason,
      prompt: task.prompt,
      deps: task.deps || [],
    })),
  };
  workflows[workflowId] = workflow;
  saveWorkflows(workflows);
  return workflow;
}

function escapePipe(text) {
  return cleanInlineText(text, 240).replace(/\|/g, "\\|");
}

function uniqueLines(items = []) {
  return Array.from(new Set(items.map((item) => cleanInlineText(item)).filter(Boolean)));
}

function inferSceneDomain(session) {
  const text = `${session?.input || ""}\n${JSON.stringify(session?.plan || {})}\n${JSON.stringify(session?.tasks || [])}`;
  const hasFrontend = /pi-frontend|frontend|AppShell|ChatWindow|useOrchestrate|Next\.js|React/i.test(text);
  const hasBackend = /pi-backend|backend|monitor-server|Express|WebSocket|route/i.test(text);
  if (hasFrontend && hasBackend) return "全栈开发";
  if (hasFrontend) return "前端开发";
  if (hasBackend) return "后端开发";
  if (/架构|workflow|多Agent|协作|orchestr/i.test(text)) return "系统架构";
  return "技术实现";
}

function inferTaskType(session) {
  if (session?.status === "synthesizing") return "review";
  if (["running", "planned", "waiting_confirmation", "done"].includes(session?.status)) return "execute";
  return "design";
}

function inferClarity(session) {
  if (session?.plan?.tasks?.length) return "high";
  if (session?.input && String(session.input).length > 20) return "mid";
  return "low";
}

function inferProgressLabel(session) {
  if (session?.status === "done") return "已完成汇总";
  if (session?.status === "synthesizing") return "Lead 审查与汇报中";
  if (session?.status === "waiting_confirmation") return "等待用户确认";
  if (session?.status === "running") return `${session?.flowState?.currentStage || "执行"}进行中`;
  if (session?.status === "planned") return "任务已拆分，等待执行";
  return session?.flowState?.currentStage || "方案讨论中";
}

function inferTechStack(session) {
  const text = `${session?.input || ""}\n${JSON.stringify(session?.tasks || [])}`;
  const items = [];
  if (/pi-frontend|frontend|AppShell|ChatWindow|useOrchestrate|Next\.js|React/i.test(text)) {
    items.push("Frontend：Next.js / React / TypeScript");
  }
  if (/pi-backend|backend|monitor-server|Express|WebSocket|Node/i.test(text)) {
    items.push("Backend：Node.js / Express / WebSocket");
  }
  if (/多Agent|multi-agent|artifact|Lead Agent|Guardian|orchestr/i.test(text)) {
    items.push("Orchestration：Pi CLI 子进程 / Artifact Registry / WebSocket Monitor");
  }
  if (!items.length) items.push("待从后续任务中补全");
  return items;
}

function collectOpenIssues(session) {
  const items = [];
  for (const task of session?.tasks || []) {
    if (task?.status === "error" && task?.error) {
      items.push(`任务 ${task.name || task.id} 执行失败：${cleanInlineText(task.error, 120)}`);
    }
  }
  for (const artifact of session?.artifacts || []) {
    if (artifact?.status === "incomplete") {
      items.push(`物料 ${artifact.id} 不完整：${(artifact.issues || []).join(", ") || "待补齐"}`);
    }
  }
  if (session?.error) items.push(`会话错误：${cleanInlineText(session.error, 120)}`);
  if (session?.pendingConfirmation?.question) items.push(`待确认：${cleanInlineText(session.pendingConfirmation.question, 120)}`);
  return uniqueLines(items);
}

function buildMemoryKeyDecisions(session) {
  const items = [];
  if (session?.plan?.summary) items.push(`已确认目标：${cleanInlineText(session.plan.summary, 180)}`);
  if (session?.plan?.reason) items.push(`拆分依据：${cleanInlineText(session.plan.reason, 180)}`);
  if (session?.flowState?.currentStage) items.push(`当前全局阶段：${session.flowState.currentStage}`);
  if (session?.review?.summary) items.push(`审查结论：${cleanInlineText(session.review.summary, 180)}`);
  if (session?.review?.accepted) items.push("Lead 审查通过，允许进入最终汇报");
  return uniqueLines([...(session?.flowState?.keyDecisions || []), ...items]);
}

function buildMemoryOpenThreads(session) {
  return uniqueLines([...(session?.flowState?.openThreads || []), ...collectOpenIssues(session)]);
}

function normalizeProjectCwd(cwd) {
  const value = String(cwd || "").trim();
  return value || process.cwd();
}

function projectIdFromCwd(cwd) {
  const normalized = normalizeProjectCwd(cwd);
  const slug = normalized.split(/[\\/]+/).filter(Boolean).slice(-2).join("__") || "default";
  const hash = createHash("sha1").update(normalized).digest("hex").slice(0, 10);
  return `${slug.replace(/[^a-zA-Z0-9_.-]+/g, "_")}__${hash}`;
}

function getSessionMemoryPaths(session) {
  const cwd = normalizeProjectCwd(session?.cwd || session?.projectCwd);
  const projectId = session?.projectId || projectIdFromCwd(cwd);
  const dir = join(PROJECT_MEMORY_ROOT, projectId);
  const summariesDir = join(dir, "summaries");
  return {
    cwd,
    projectId,
    dir,
    context: join(dir, "context.md"),
    progress: join(dir, "progress.md"),
    bugs: join(dir, "bugs.md"),
    summariesDir,
    summaryIndex: join(summariesDir, "index.json"),
  };
}

function readSummaryIndex(summaryIndexPath) {
  if (!existsSync(summaryIndexPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(summaryIndexPath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSummaryIndex(summaryIndexPath, items) {
  writeFileSync(summaryIndexPath, JSON.stringify(items, null, 2));
}

function readProjectMemorySnapshot(session, query = "") {
  const paths = getSessionMemoryPaths(session);
  const readMaybe = (path) => existsSync(path) ? readFileSync(path, "utf-8").slice(0, 5000) : "";
  const summaryIndex = readSummaryIndex(paths.summaryIndex);
  const keywords = Array.from(new Set(String(query || "").toLowerCase().split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/).filter((item) => item.length >= 2))).slice(0, 10);
  const scored = summaryIndex.map((item) => {
    const body = item.path && existsSync(item.path) ? readFileSync(item.path, "utf-8").slice(0, 2400) : "";
    const haystack = `${item.title || ""}\n${body}`.toLowerCase();
    const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0);
    return { ...item, body, score };
  });
  const selected = (keywords.length ? scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score || (b.createdAt || 0) - (a.createdAt || 0)) : scored.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))).slice(0, 3);
  return {
    projectId: paths.projectId,
    cwd: paths.cwd,
    context: readMaybe(paths.context),
    progress: readMaybe(paths.progress),
    bugs: readMaybe(paths.bugs),
    recentSummaries: selected,
  };
}

function slugifySummaryTitle(text) {
  return cleanInlineText(text || "summary", 80).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "summary";
}

function writeProjectSummary(sessionId, kind, title, body, meta = {}) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  const paths = getSessionMemoryPaths(session);
  mkdirSync(paths.summariesDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${timestamp}-${kind}-${slugifySummaryTitle(title)}.md`;
  const path = join(paths.summariesDir, filename);
  writeFileSync(path, body);
  const index = readSummaryIndex(paths.summaryIndex);
  index.push({
    id: `${kind}-${timestamp}`,
    kind,
    title: cleanInlineText(title, 160),
    path,
    createdAt: Date.now(),
    ...meta,
  });
  writeSummaryIndex(paths.summaryIndex, index.slice(-50));
  return { path, filename, projectId: paths.projectId };
}

function renderContextMemory(sessionId, session) {
  const sceneDomain = inferSceneDomain(session);
  const taskType = inferTaskType(session);
  const clarity = inferClarity(session);
  const progress = inferProgressLabel(session);
  const isEngineering = /开发|工程|代码|frontend|backend|AppShell|monitor-server|route|hook/i.test(`${session?.input || ""}\n${JSON.stringify(session?.tasks || [])}`) ? "true" : "false";
  const keyDecisions = buildMemoryKeyDecisions(session);
  const openThreads = buildMemoryOpenThreads(session);
  const activeRoles = uniqueLines((session?.tasks || []).filter((task) => task.id !== LEAD_TASK_ID).slice(0, 3).map((task) => `${task.profileName || task.name || task.id}：${task.collaborationStatus || task.status || "待执行"}`));
  const knownPitfalls = uniqueLines([
    ...collectOpenIssues(session),
    ...(session?.artifacts || []).filter((artifact) => artifact?.issues?.length).map((artifact) => `物料 ${artifact.id}：${artifact.issues.join(", ")}`),
  ]);

  return `# context.md

## 项目概述
- Project ID：${session?.projectId || projectIdFromCwd(session?.cwd)}
- Project CWD：${normalizeProjectCwd(session?.cwd)}
- 当前会话：${cleanInlineText(session?.input || session?.plan?.summary || sessionId, 220)}
- 目标摘要：${cleanInlineText(session?.plan?.summary || session?.input || "待补充", 220)}

## 技术栈
${inferTechStack(session).map((item) => `- ${item}`).join("\n")}

## 依赖服务
- Pi CLI：\`${PI_BIN}\`
- Guardian：\`${guardianState.model}\`
- Lead：\`${LEAD_MODEL}\`

## 强制约定
所有非简单问题必须经过 output-engine skill 处理。
简单/非简单的判断标准在 output-engine/SKILL.md 快检规则里。
未经快检直接输出内容 = 裸奔，禁止。

## 已知坑位
${knownPitfalls.length ? knownPitfalls.map((item) => `- ${item}`).join("\n") : "- 暂无"}

---

## topic_stack

active:
  id: topic_${sessionId.slice(0, 8)}
  scene_domain: ${sceneDomain}
  task_type: ${taskType}
  clarity: ${clarity}
  progress: ${progress}
  is_engineering: ${isEngineering}
  biz_scene:
    user_role: 开发者
    stage: ${session?.status === "done" ? "结果汇报" : session?.status === "planned" ? "方案拆分" : "开发进行中"}
    stakeholders:
      - role: Lead Agent
        focus: 任务拆分与交付审查
      - role: Guardian
        focus: 入口判断与模型守护
  active_roles:
${activeRoles.length ? activeRoles.map((item) => `    - role_name: ${item.split("：")[0]}\n      focus: ${item.split("：")[1] || "执行中"}`).join("\n") : "    - role_name: Lead Agent\n      focus: 规划与汇报"}
  key_decisions:
${keyDecisions.length ? keyDecisions.map((item) => `    - ${item}`).join("\n") : "    - 待补充"}
  open_threads:
${openThreads.length ? openThreads.map((item) => `    - ${item}`).join("\n") : "    - 暂无"}
  stage_history:
    - { scene_domain: ${sceneDomain}, task_type: ${taskType}, clarity: ${clarity}, entered_at: ${JSON.stringify(new Date(session?.startedAt || Date.now()).toISOString())}, completed_at: ${session?.status === "done" ? JSON.stringify(new Date(session?.updatedAt || Date.now()).toISOString()) : "null"} }

suspended: []
archived: []
`;
}

function renderProgressMemory(sessionId, session) {
  const deliverables = session?.flowState?.stageDeliverables || [];
  const completedTasks = uniqueLines((session?.tasks || []).filter((task) => task.status === "completed" && task.id !== LEAD_TASK_ID).map((task) => task.name || task.id));
  const pendingTasks = uniqueLines((session?.tasks || []).filter((task) => !["completed", "aborted"].includes(task.status) && task.id !== LEAD_TASK_ID).map((task) => task.name || task.id));
  const risks = collectOpenIssues(session);
  const stageHistory = session?.flowState?.stageMap || [];

  return `# progress.md

## Stage Deliverables

| # | 物料名称 | 产出标准 | 优先级 | 状态 |
|---|---------|---------|--------|------|
${deliverables.length ? deliverables.map((item, index) => `| ${index + 1} | ${escapePipe(item.name || item.id)} | ${escapePipe(item.standard || "子 Agent 输出可用于下游或 Lead 审查")} | ${item.priority || "P0"} | ${item.status === "completed" ? "✓" : "□"} |`).join("\n") : "| 1 | 待 Lead 规划生成 | 待补充 | P0 | □ |"}

---

## Task State Machine

\`\`\`yaml
Goal: ${cleanInlineText(session?.plan?.summary || session?.input || "待补充", 220)}
Current Step: ${cleanInlineText(session?.status === "done" ? "结果已汇总" : session?.flowState?.currentStage || session?.status || "方案讨论中", 120)}
Completed: [${completedTasks.join(", ")}]
Pending: [${pendingTasks.join(", ")}]
Risks: [${risks.join(", ")}]
\`\`\`

---

## Stage History

${stageHistory.length ? stageHistory.map((item) => `- { stage: ${item.stage}, status: ${item.status}, goal: ${JSON.stringify(cleanInlineText(item.goal || "", 120))} }`).join("\n") : `- { stage: ${session?.flowState?.currentStage || "方案讨论"}, status: ${session?.status || "running"}, goal: ${JSON.stringify(cleanInlineText(session?.plan?.summary || session?.input || "待补充", 120))} }`}

## Session Snapshot

- sessionId: ${sessionId}
- projectId: ${session?.projectId || projectIdFromCwd(session?.cwd)}
- projectCwd: ${normalizeProjectCwd(session?.cwd)}
- updatedAt: ${new Date(session?.updatedAt || Date.now()).toISOString()}
- gateStatus: ${session?.flowState?.gateStatus || "unknown"}
`;
}

function renderBugsMemory(sessionId, session) {
  const openIssues = uniqueLines([
    ...collectOpenIssues(session),
    ...(session?.artifacts || []).filter((artifact) => artifact?.status === "incomplete").map((artifact) => `物料 ${artifact.id} 未达交付标准 · 触发条件：artifact status = incomplete · 来源：${artifact.producerTaskId || sessionId}`),
  ]);

  return `# bugs.md

## 待处理

\`\`\`yaml
${openIssues.length ? openIssues.map((item) => {
    const priority = /执行失败|会话错误/.test(item) ? "P0" : /待确认/.test(item) ? "P2" : "P1";
    return `${priority}：${cleanInlineText(item, 180)} · 触发条件：当前会话仍未收敛 · 来源：${sessionId}`;
  }).join("\n") : "# 暂无开放风险"}
\`\`\`

## 已解决

<!-- 风险解除后从「待处理」移至此处，追加解除时间 -->

---

## 写入触发规则（由 engineering-mode 强制执行，所有写入通过 Memory Diff [静默] 写回）

| 触发场景 | 来源 | 默认优先级 |
|---|---|---|
| Verification「新增风险」有内容 | engineering-mode 规则七 | P1 |
| Impact Analysis 风险等级 = 高 | engineering-mode 规则三 | P0 |
| 用户或 Agent 明确识别到新风险 | engineering-mode 规则十一 | P2 |
| 用户手动标记 | - | 由用户指定 |

## 与 progress.md 的关系

- \`progress.md\` 的 Task State Machine Risks 字段记录当前任务进行中的风险
- \`bugs.md\` 记录已确认、待处理或已解决的风险，是持久化清单
`;
}

function persistSessionMemory(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  const paths = getSessionMemoryPaths(session);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.context, renderContextMemory(sessionId, { ...session, projectId: paths.projectId, cwd: paths.cwd }));
  writeFileSync(paths.progress, renderProgressMemory(sessionId, { ...session, projectId: paths.projectId, cwd: paths.cwd }));
  writeFileSync(paths.bugs, renderBugsMemory(sessionId, { ...session, projectId: paths.projectId, cwd: paths.cwd }));
}

function scheduleSessionMemorySync(sessionId) {
  if (!sessionId) return;
  const prev = memoryWriteTimers.get(sessionId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    memoryWriteTimers.delete(sessionId);
    try {
      persistSessionMemory(sessionId);
    } catch (err) {
      console.error(`[memory] Failed to persist session ${sessionId}:`, err.message);
    }
  }, 80);
  memoryWriteTimers.set(sessionId, timer);
}

function touchSession(sessionId, patch) {
  const prev = activeSessions.get(sessionId) || { tasks: [], status: "idle", startedAt: Date.now() };
  activeSessions.set(sessionId, { ...prev, ...patch, updatedAt: Date.now() });
  scheduleSessionMemorySync(sessionId);
}

function classifyComplexity(input) {
  const text = String(input || "");
  if (text.length < 20 && !/项目|系统|实现|修复|多Agent|工作流|前端|后端|代码|架构/.test(text)) return "L0_chat";
  if (/项目|系统|多Agent|工作流|架构|前端.*后端|后端.*前端|跨模块|物料|协作|session|状态/.test(text)) return "L2_complex";
  return "L1_simple";
}

function createFlowState(input) {
  const complexity = classifyComplexity(input);
  const isComplex = complexity === "L2_complex";
  const baseStages = [
    { stage: "目标确认", status: "completed", goal: "明确用户目标、边界、约束和成功标准" },
    { stage: "方案讨论", status: "current", goal: "与用户/Lead 多轮讨论方案、拆分路径和执行策略" },
  ];
  return {
    complexity,
    flowDomain: "lead_generated",
    currentStage: isComplex ? "方案讨论" : "single_turn",
    stageMap: isComplex ? baseStages : [],
    stageDeliverables: [],
    gateStatus: isComplex ? "open" : "not_applicable",
    keyDecisions: [],
    openThreads: [],
    handoff: null,
  };
}

function applyLeadGeneratedStages(flowState, plan) {
  if (!flowState) return flowState;
  const base = [
    { stage: "目标确认", status: "completed", goal: "明确用户目标、边界、约束和成功标准" },
    { stage: "方案讨论", status: "completed", goal: "与用户/Lead 多轮讨论方案、拆分路径和执行策略" },
  ];
  const dynamic = Array.isArray(plan?.stages) ? plan.stages : [];
  const normalized = dynamic
    .map((s, i) => typeof s === "string" ? { stage: s, goal: "Lead 生成的执行阶段" } : s)
    .filter((s) => s?.stage || s?.name)
    .map((s, i) => ({
      stage: s.stage || s.name,
      status: i === 0 ? "current" : "locked",
      goal: s.goal || s.description || "Lead 生成的执行阶段",
    }));
  return {
    ...flowState,
    flowDomain: plan?.flowDomain || "lead_generated",
    currentStage: normalized[0]?.stage || "方案讨论",
    stageMap: normalized.length ? [...base, ...normalized] : flowState.stageMap,
  };
}

function applyPlanKnowledgeToFlowState(flowState, plan) {
  if (!flowState) return flowState;
  return {
    ...flowState,
    keyDecisions: uniqueLines([
      ...(flowState.keyDecisions || []),
      plan?.summary ? `已确认目标：${cleanInlineText(plan.summary, 180)}` : "",
      plan?.reason ? `拆分依据：${cleanInlineText(plan.reason, 180)}` : "",
      Array.isArray(plan?.tasks) && plan.tasks.length ? `执行拆分：${plan.tasks.map((task) => task.name || task.id).join("、")}` : "",
    ]),
    openThreads: uniqueLines([
      ...(flowState.openThreads || []),
      plan?.requiresUserConfirmation ? "Lead 判断仍需用户确认后再继续" : "",
    ]),
  };
}

function applyReviewKnowledgeToFlowState(flowState, review) {
  if (!flowState) return flowState;
  return {
    ...flowState,
    keyDecisions: uniqueLines([
      ...(flowState.keyDecisions || []),
      review?.summary ? `审查结论：${cleanInlineText(review.summary, 180)}` : "",
      review?.accepted ? "Lead 审查通过，可进入最终汇报" : "Lead 审查未完全通过，仍需修订或确认",
    ]),
    openThreads: uniqueLines([
      ...(flowState.openThreads || []),
      ...((review?.issues || []).map((issue) => `审查问题：${cleanInlineText(issue, 180)}`)),
      ...((review?.revisionTasks || []).map((task) => `待修订任务：${task.name || task.id}`)),
    ]),
  };
}

function applyFinalKnowledgeToFlowState(flowState, finalOutput) {
  if (!flowState) return flowState;
  return {
    ...flowState,
    handoff: {
      summary: cleanInlineText(finalOutput, 240),
      updatedAt: Date.now(),
    },
  };
}

function buildMemoryCuratorSummary(sessionId, session, kind, payload = {}) {
  return `# ${kind} summary\n\n- projectId: ${session?.projectId || projectIdFromCwd(session?.cwd)}\n- cwd: ${normalizeProjectCwd(session?.cwd)}\n- sessionId: ${sessionId}\n- stage: ${session?.flowState?.currentStage || session?.status || "unknown"}\n- title: ${cleanInlineText(payload.title || session?.plan?.summary || session?.input || kind, 180)}\n\n## decisions\n${buildMemoryKeyDecisions(session).map((item) => `- ${item}`).join("\n") || "- 无"}\n\n## open threads\n${buildMemoryOpenThreads(session).map((item) => `- ${item}`).join("\n") || "- 无"}\n\n## payload\n${typeof payload.body === "string" ? payload.body : JSON.stringify(payload, null, 2)}\n`;
}

function recordProjectSummary(sessionId, kind, title, body, meta = {}) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  const summaryBody = buildMemoryCuratorSummary(sessionId, session, kind, { title, body, ...meta });
  return writeProjectSummary(sessionId, kind, title, summaryBody, meta);
}

function deriveDeliverablesFromPlan(plan) {
  return (plan.tasks || []).map((t) => ({

    id: `${t.id}-output`,
    name: t.name || t.id,
    producerTaskId: t.id,
    priority: "P0",
    mustComplete: true,
    status: "pending",
    standard: "子 Agent 完成任务并产出可供下游/Lead 审查的 artifact",
  }));
}

function promoteTaskSkillsIntoProfile(sessionId, taskId, requestedSkills = [], source = "user") {
  const state = activeSessions.get(sessionId);
  const task = state?.tasks?.find((t) => t.id === taskId);
  if (!state || !task) throw new Error("Task/session not found");
  const profiles = loadAgentProfiles();
  const profileId = task.profileId || selectAgentProfile(task).id;
  const profile = profiles[profileId];
  if (!profile) throw new Error("Profile not found");
  const skills = Array.from(new Set((requestedSkills.length ? requestedSkills : (task.skills || [])).filter(Boolean)));
  if (!skills.length) throw new Error("No skills to promote");
  profile.skills = Array.from(new Set([...(profile.skills || []), ...skills]));
  profile.availableSkills = Array.from(new Set([...(profile.availableSkills || []), ...profile.skills, ...skills]));
  profile.savedExperiences ||= [];
  profile.savedExperiences = [{
    taskId,
    taskName: task.name || taskId,
    lesson: source === "lead" ? `Lead 将本轮临时技能升级为默认技能：${skills.join(", ")}` : `用户将本轮临时技能升级为默认技能：${skills.join(", ")}`,
    skills,
    model: task.model,
    artifactId: task.artifactId,
    debugValidated: true,
    savedAt: Date.now(),
  }, ...profile.savedExperiences].slice(0, 50);
  saveAgentProfiles(profiles);
  const tasks = (state.tasks || []).map((t) => t.id === taskId ? {
    ...t,
    profileId,
    profileName: profile.name,
    profileSkills: profile.skills,
    profileAvailableSkills: profile.availableSkills,
    promotedProfileSkills: skills,
  } : t);
  touchSession(sessionId, { tasks });
  broadcast({ type: "profile_skills_promoted", sessionId, taskId, profileId, skills, profile });
  return { profileId, profile, skills, tasks };
}

function applyAgentDecisions(sessionId, review) {
  const decisions = Array.isArray(review?.agentDecisions) ? review.agentDecisions : [];
  if (!decisions.length) return;
  for (const decision of decisions) {
    if (Array.isArray(decision?.promoteSkillsToProfile) && decision.promoteSkillsToProfile.length && decision?.taskId) {
      try {
        promoteTaskSkillsIntoProfile(sessionId, decision.taskId, decision.promoteSkillsToProfile, "lead");
      } catch {}
    }
  }
  const byTask = new Map(decisions.map((d) => [d.taskId, d]));
  const tasks = (activeSessions.get(sessionId)?.tasks || []).map((t) => {
    const d = byTask.get(t.id);
    if (!d) return t;
    return {
      ...t,
      collaborationStatus: d.collaborationStatus,
      leadDecision: d.decision,
      leadDecisionReason: d.reason,
      nextAction: d.nextAction,
      promotedProfileSkills: Array.isArray(d.promoteSkillsToProfile) && d.promoteSkillsToProfile.length ? d.promoteSkillsToProfile : t.promotedProfileSkills,
    };
  });
  touchSession(sessionId, { tasks });
  broadcast({ type: "agent_decisions", sessionId, decisions, tasks });
}

function updateFlowDeliverablesFromArtifacts(flowState, artifacts = []) {
  if (!flowState?.stageDeliverables) return flowState;
  const artifactById = new Map(artifacts.map((a) => [a.id, a]));
  const stageDeliverables = flowState.stageDeliverables.map((d) => {
    const artifact = artifactById.get(d.id);
    if (!artifact) return d;
    return {
      ...d,
      status: artifact.status === "ready" ? "completed" : "incomplete",
      artifactStatus: artifact.status,
      issues: artifact.issues || [],
    };
  });
  const blocked = stageDeliverables.some((d) => d.mustComplete && d.status !== "completed");
  return {
    ...flowState,
    stageDeliverables,
    gateStatus: blocked ? "blocked" : "open",
  };
}

function normalizeRevisionTask(task, index, planTasks = []) {
  const sourceTask = planTasks.find((item) => item.id === task.sourceTaskId) || null;
  const revisionKind = task.revisionKind || (/bug|错误|修复|不可用/i.test(`${task.reason || ""}\n${task.name || ""}`) ? "bugfix" : "material_completion");
  return {
    id: task.id || `rev${index + 1}`,
    name: task.name || `修订任务 ${index + 1}`,
    prompt: task.prompt || task.name || "执行修订任务",
    deps: Array.isArray(task.deps) ? task.deps : (task.sourceTaskId ? [task.sourceTaskId] : []),
    sourceTaskId: task.sourceTaskId,
    revisionKind,
    reason: task.reason || "Lead 审查要求修订",
    teachingNote: task.teachingNote || "",
    profileId: task.profileId || sourceTask?.profileId || "general-executor",
    model: task.model || (revisionKind === "bugfix" ? LEAD_MODEL : sourceTask?.model || "opencore-go/glm-5.2"),
    skills: Array.isArray(task.skills) && task.skills.length ? task.skills : (revisionKind === "bugfix" ? ["engineering-mode", "output-spec"] : sourceTask?.skills || []),
    needsDebugging: true,
    taskStages: Array.isArray(task.taskStages) ? task.taskStages : sourceTask?.taskStages || [],
    currentTaskStage: task.currentTaskStage || sourceTask?.currentTaskStage || "修订",
    needsPlanDiscussion: false,
  };
}

function mergeRevisionArtifactsIntoRegistry(artifactsDir, revisionTask, result) {
  if (!result?.output) return readArtifactRegistry(artifactsDir);
  const sourceArtifactId = revisionTask.sourceTaskId ? `${revisionTask.sourceTaskId}-output` : null;
  if (!sourceArtifactId) return readArtifactRegistry(artifactsDir);
  const sourceArtifactPath = join(artifactsDir, `${revisionTask.sourceTaskId}-output.md`);
  writeFileSync(sourceArtifactPath, result.output);
  const quality = evaluateArtifactOutput(result.output);
  return upsertArtifact(artifactsDir, {
    id: sourceArtifactId,
    type: "markdown",
    status: quality.status,
    issues: quality.issues,
    path: sourceArtifactPath,
    producerTaskId: revisionTask.sourceTaskId,
    producerTaskName: revisionTask.name,
    size: result.output.length,
    summary: result.output.slice(0, 240),
    revisedByTaskId: revisionTask.id,
    revisionKind: revisionTask.revisionKind,
  });
}

function selectCoachSourceTask(session, targetTaskId) {
  const tasks = (session?.tasks || []).filter((task) => task.id !== LEAD_TASK_ID);
  if (targetTaskId) return tasks.find((task) => task.id === targetTaskId) || null;
  const revised = [...tasks].reverse().find((task) => task.status === "completed" && task.artifactId && task.profileId && task.profileId !== "agent-coach");
  return revised || [...tasks].reverse().find((task) => task.status === "completed" && task.profileId) || null;
}

async function runLeadDirectedRevision(sessionId, artifactsDir, plan, review) {
  const revisions = Array.isArray(review?.revisionTasks) ? review.revisionTasks : [];
  if (!revisions.length) return { executed: false, review };

  const normalized = revisions.map((task, index) => normalizeRevisionTask(task, index, plan.tasks || []));
  const currentTasks = activeSessions.get(sessionId)?.tasks || [];
  touchSession(sessionId, {
    status: "running",
    tasks: ensureLeadTask([
      ...currentTasks.filter((task) => !normalized.some((revision) => revision.id === task.id)),
      ...normalized.map((task) => ({ ...task, status: "pending", collaborationStatus: "debugging" })),
    ]),
  });
  broadcast({ type: "tasks_planned", sessionId, tasks: activeSessions.get(sessionId)?.tasks || [] });

  for (const revisionTask of normalized) {
    const sourceTask = (activeSessions.get(sessionId)?.tasks || []).find((task) => task.id === revisionTask.sourceTaskId);
    const sourceArtifactPath = revisionTask.sourceTaskId ? join(artifactsDir, `${revisionTask.sourceTaskId}-output.md`) : null;
    const sourceArtifact = sourceArtifactPath && existsSync(sourceArtifactPath) ? readFileSync(sourceArtifactPath, "utf-8") : "";
    const revisionPrompt = `${revisionTask.prompt}

==== Lead 修订上下文 ====
原始任务ID：${revisionTask.sourceTaskId || "未知"}
修订类型：${revisionTask.revisionKind}
修订原因：${revisionTask.reason}
原始子 Agent：${sourceTask?.profileName || sourceTask?.name || revisionTask.sourceTaskId || "未知"}
Lead 的可用标准：结果必须可用，不要求完美；但不能保留关键 bug、错误实现、缺失核心交付物。
如果你修复了 bug，必须明确说明：
1. 你改了什么
2. 为什么这样改
3. 原始子 Agent 以后应该避免什么

==== 原始输出 ====
${sourceArtifact || "无"}

==== 教学沉淀要求 ====
${revisionTask.teachingNote || "请总结这次修复能沉淀给原始子 Agent 的经验。"}`;
    const result = await executeTask({ ...revisionTask, prompt: revisionPrompt }, sessionId, artifactsDir);
    if (!result.success) continue;
    const mergedRegistry = mergeRevisionArtifactsIntoRegistry(artifactsDir, revisionTask, result);
    const updatedTasks = (activeSessions.get(sessionId)?.tasks || []).map((task) => {
      if (task.id === revisionTask.sourceTaskId) {
        return {
          ...task,
          status: "completed",
          collaborationStatus: "ready_for_review",
          output: result.output,
          artifactId: `${revisionTask.sourceTaskId}-output`,
          revisedByTaskId: revisionTask.id,
          revisedByModel: revisionTask.model,
          revisionReason: revisionTask.reason,
        };
      }
      if (task.id === revisionTask.id) {
        return {
          ...task,
          status: "completed",
          collaborationStatus: "accepted",
          output: result.output,
        };
      }
      return task;
    });
    touchSession(sessionId, {
      artifacts: mergedRegistry.artifacts,
      tasks: updatedTasks,
      flowState: updateFlowDeliverablesFromArtifacts(activeSessions.get(sessionId)?.flowState, mergedRegistry.artifacts),
    });
    if (sourceTask?.profileId) {
      saveProfileExperience(sourceTask.profileId, {
        taskId: sourceTask.id,
        taskName: sourceTask.name || sourceTask.id,
        lesson: revisionTask.teachingNote || revisionTask.reason || "Lead 指导下完成一次强模型修复",
        skills: sourceTask.skills || [],
        model: sourceTask.model,
        artifactId: `${sourceTask.id}-output`,
      });
    }
  }

  const reReview = await leadReviewArtifacts(sessionId, artifactsDir, {
    ...plan,
    tasks: [...(plan.tasks || []), ...normalized],
  });
  return { executed: true, review: reReview };
}

function extractTeachingNote(output, fallback) {
  const text = String(output || "");
  const explicit = text.match(/teachingNote\s*[:：]\s*([\s\S]{1,800})/i)?.[1]
    || text.match(/教学沉淀\s*[:：]\s*([\s\S]{1,800})/)?.[1]
    || text.match(/经验沉淀\s*[:：]\s*([\s\S]{1,800})/)?.[1];
  return cleanInlineText(explicit || fallback || "Lead 调教链路完成一次强模型示范与经验回灌", 500);
}


function extractJsonObjectSafe(text, fallback = {}) {
  try {
    return extractJsonObject(text);
  } catch {
    return fallback;
  }
}

async function leadJudgeCoachingNeed(sessionId, sourceTask, userFeedback, sourceOutput, finalOutput) {
  const session = activeSessions.get(sessionId);
  const projectMemory = readProjectMemorySnapshot(session, userFeedback);
  const raw = await runPi({
    model: LEAD_MODEL,
    cwd: join(WORKSPACE, sessionId, "lead-coach-judge"),
    noTools: true,
    timeoutMs: 45000,
    systemPrompt: buildLeadSystemPrompt("leadFinalReport"),
    prompt: `阶段：coach-judge

你是 Lead Agent。用户指出当前最终作品某些部分做得不够好。
请判断：
1. 是否真的需要进入调教链路
2. 最值得强化的 focus areas 是什么
3. 如果要调教，为什么值得升级给最强模型先重做

只返回 JSON：
{
  "shouldCoach": true,
  "reason": "",
  "focusAreas": [""],
  "sourceTaskId": ${JSON.stringify(sourceTask?.id || "")},
  "upgradeModel": ${JSON.stringify(LEAD_MODEL)}
}

用户反馈：
${userFeedback}

原始子 Agent 输出：
${sourceOutput || "无"}

当前最终呈现：
${finalOutput || "无"}

项目记忆：
${JSON.stringify(projectMemory, null, 2)}`,
  });
  const parsed = extractJsonObjectSafe(raw, { shouldCoach: true, reason: cleanInlineText(userFeedback, 180), focusAreas: [] });
  return {
    shouldCoach: parsed.shouldCoach !== false,
    reason: parsed.reason || cleanInlineText(userFeedback, 180),
    focusAreas: Array.isArray(parsed.focusAreas) ? parsed.focusAreas : [],
    sourceTaskId: parsed.sourceTaskId || sourceTask?.id,
    upgradeModel: parsed.upgradeModel || LEAD_MODEL,
  };
}

async function runLeadCoachUpgrade(sessionId, sourceTask, userFeedback, sourceOutput, finalOutput, focusAreas = []) {
  const session = activeSessions.get(sessionId);
  const projectMemory = readProjectMemorySnapshot(session, `${userFeedback}\n${focusAreas.join("\n")}`);
  const coachTask = {
    id: `coach-${Date.now()}`,
    name: `调教 ${sourceTask.name || sourceTask.id}`,
    profileId: "agent-coach",
    model: LEAD_MODEL,
    skills: ["output-engine", "output-spec"],
    needsDebugging: true,
    currentTaskStage: "Lead 强模型重做",
    prompt: `你是 Lead 调教链路中的最强模型示范助手。

用户指出当前最终作品有问题。请先直接做一版更好的结果，再告诉 Lead：
1. 这版成果好在哪里
2. 你推测原子 Agent 为什么做不好
3. 你希望原子 Agent 下一轮怎样改
4. 输出 teachingNote

只输出以下结构：

## 改进版结果
...

## 这份成果好在哪里
- ...

## 原子 Agent 失败原因推测
- ...

## 给原子 Agent 的修正要求
- ...

## teachingNote
...

## 给下游的交付物
...

用户反馈：
${userFeedback}

focus areas：
${focusAreas.join("\n") || "无"}

原始子 Agent 输出：
${sourceOutput || "无"}

当前最终呈现：
${finalOutput || "无"}

项目记忆：
${JSON.stringify(projectMemory, null, 2)}`,
    deps: sourceTask.id ? [sourceTask.id] : [],
  };
  touchSession(sessionId, {
    tasks: ensureLeadTask([
      ...(activeSessions.get(sessionId)?.tasks || []),
      { ...coachTask, status: "pending", collaborationStatus: "debugging" },
    ]),
  });
  broadcast({ type: "coaching_start", sessionId, sourceTaskId: sourceTask.id, userFeedback, task: coachTask });
  const result = await executeTask(coachTask, sessionId, join(WORKSPACE, sessionId, 'artifacts'));
  if (!result.success) throw new Error(result.error || 'agent-coach failed');
  const output = result.output || '';
  const improved = output.match(/## 改进版结果\n([\s\S]*?)\n## /)?.[1]?.trim() || output;
  const strengths = output.match(/## 这份成果好在哪里\n([\s\S]*?)\n## /)?.[1]?.trim() || '';
  const causes = output.match(/## 原子 Agent 失败原因推测\n([\s\S]*?)\n## /)?.[1]?.trim() || '';
  const correction = output.match(/## 给原子 Agent 的修正要求\n([\s\S]*?)\n## /)?.[1]?.trim() || '';
  const teachingNote = extractTeachingNote(output, userFeedback);
  return { coachTaskId: coachTask.id, output, improved, strengths, causes, correction, teachingNote };
}

async function leadJudgeSimilarity(sessionId, targetResult, retrainedOutput, userFeedback) {
  const raw = await runPi({
    model: LEAD_MODEL,
    cwd: join(WORKSPACE, sessionId, `lead-similarity-${Date.now()}`),
    noTools: true,
    timeoutMs: 45000,
    systemPrompt: buildLeadSystemPrompt("leadReview"),
    prompt: `阶段：coach-compare

你是 Lead Agent。判断原子 Agent 新输出是否已经与理想方案足够相似。
只返回 JSON：{ "similar": true, "reason": "", "gap": "" }

用户反馈：
${userFeedback}

理想方案：
${targetResult}

原子 Agent 新输出：
${retrainedOutput}`,
  });
  const parsed = extractJsonObjectSafe(raw, { similar: false, reason: '无法解析，默认继续调教', gap: '' });
  return {
    similar: Boolean(parsed.similar),
    reason: parsed.reason || '',
    gap: parsed.gap || '',
  };
}

async function makeSourceAgentSummarizeLesson(sessionId, sourceTask, improvedResult, userFeedback) {
  const profile = selectAgentProfile(sourceTask);
  const taskDir = getTaskCwd(sourceTask) || join(WORKSPACE, sessionId, `${sourceTask.id}-lesson`);
  const raw = await runPi({
    model: sourceTask.model || profile.defaultModel || 'opencore-go/glm-5.2',
    cwd: taskDir,
    noTools: true,
    timeoutMs: 45000,
    systemPrompt: SUBAGENT_SYSTEM,
    prompt: `你是原子 Agent。请基于这次被 Lead 调教后的结果，总结下次复用的经验。

用户指出的问题：
${userFeedback}

最终理想方案：
${improvedResult}

请只输出：
1. 这次你原来错在哪里
2. 下次遇到类似任务应该怎么做
3. 建议保留哪些 skills/检查步骤

末尾明确写出：
teachingNote: ...`,
  });
  return extractTeachingNote(raw, userFeedback);
}

async function runUserTriggeredCoaching(sessionId, userFeedback, options = {}) {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error("session not found");
  const artifactsDir = join(WORKSPACE, sessionId, "artifacts");
  const sourceTask = selectCoachSourceTask(session, options.taskId);
  if (!sourceTask) throw new Error("no completed sub-agent task available for coaching");

  const registry = readArtifactRegistry(artifactsDir);
  const sourceArtifactId = sourceTask.artifactId || `${sourceTask.id}-output`;
  const sourceArtifact = registry.artifacts.find((artifact) => artifact.id === sourceArtifactId);
  const sourceOutputPath = sourceArtifact?.path || join(artifactsDir, `${sourceTask.id}-output.md`);
  const sourceOutput = existsSync(sourceOutputPath) ? readFileSync(sourceOutputPath, "utf-8") : sourceTask.output || "";
  const finalOutput = session.finalOutput || session.output || "";

  const coachDecision = await leadJudgeCoachingNeed(sessionId, sourceTask, userFeedback, sourceOutput, finalOutput);
  if (!coachDecision.shouldCoach) {
    const skipped = `Lead 判断当前反馈暂不需要进入调教链路。

原因：${coachDecision.reason}`;
    touchSession(sessionId, { status: "done", output: skipped, finalOutput: skipped, coaching: { status: "skipped", reason: coachDecision.reason, completedAt: Date.now() } });
    broadcast({ type: "coaching_done", sessionId, sourceTaskId: sourceTask.id, output: skipped });
    broadcast({ type: "session_done", sessionId, output: skipped, tasks: activeSessions.get(sessionId)?.tasks || [] });
    return { output: skipped, sourceTaskId: sourceTask.id };
  }

  const upgraded = await runLeadCoachUpgrade(sessionId, sourceTask, userFeedback, sourceOutput, finalOutput, coachDecision.focusAreas || []);

  let childAttempt = null;
  let similarity = { similar: false, reason: '', gap: '' };
  let attempt = 0;
  let retryPrompt = `${sourceTask.prompt || sourceTask.name || ''}

==== Lead 调教要求 ====
用户指出的问题：${userFeedback}

Lead 的理想方案：
${upgraded.improved}

这份成果好在哪里：
${upgraded.strengths || '无'}

Lead 推测你之前做不好的原因：
${upgraded.causes || '无'}

本轮请严格对齐以下修正要求：
${upgraded.correction || '请尽可能贴近 Lead 的理想方案。'}`;

  while (attempt < 3) {
    attempt += 1;
    childAttempt = await executeTask({
      ...sourceTask,
      prompt: retryPrompt,
      needsDebugging: true,
      currentTaskStage: `调教回灌第${attempt}轮`,
      promptAppend: `

请根据 Lead 的理想方案重做，并尽量给出相似方案。`,
    }, sessionId, artifactsDir);
    if (!childAttempt.success) break;
    similarity = await leadJudgeSimilarity(sessionId, upgraded.improved, childAttempt.output || '', userFeedback);
    if (similarity.similar) break;
    retryPrompt = `${retryPrompt}

==== Lead 第${attempt}轮继续纠偏 ====
仍未足够相似。差距：${similarity.gap || similarity.reason || '请进一步贴近理想方案。'}
请继续改。`;
  }

  const sourceTeachingNote = childAttempt?.success && similarity.similar
    ? await makeSourceAgentSummarizeLesson(sessionId, sourceTask, upgraded.improved, userFeedback)
    : upgraded.teachingNote;

  if (sourceTask.profileId) {
    saveProfileExperience(sourceTask.profileId, {
      taskId: sourceTask.id,
      taskName: sourceTask.name || sourceTask.id,
      lesson: sourceTeachingNote,
      skills: sourceTask.skills || [],
      model: sourceTask.model,
      artifactId: sourceArtifactId,
    });
  }

  const finalSummary = `## Lead 调教后的最终方案

${upgraded.improved}

## 这份工作成果好在哪里
${upgraded.strengths || '- Lead 已重做并强化关键部分'}

## 主 Agent 对子 Agent 做不好的原因推测
${upgraded.causes || '- 原子 Agent 在细节对齐、验收标准或问题聚焦上不足'}

## 子 Agent 回灌结果
- 是否已接近理想方案：${similarity.similar ? '是' : '否'}
- Lead 判断：${similarity.reason || '见上文'}
- 写回 Profile 的经验：${sourceTeachingNote}

${childAttempt?.success ? `## 子 Agent 最新输出

${childAttempt.output}` : ''}`;

  touchSession(sessionId, {
    status: "done",
    output: finalSummary,
    finalOutput: finalSummary,
    flowState: applyFinalKnowledgeToFlowState(activeSessions.get(sessionId)?.flowState, finalSummary),
    coaching: {
      status: "completed",
      sourceTaskId: sourceTask.id,
      coachTaskId: upgraded.coachTaskId,
      userFeedback,
      teachingNote: sourceTeachingNote,
      similarity,
      completedAt: Date.now(),
    },
  });
  broadcast({ type: "coaching_done", sessionId, sourceTaskId: sourceTask.id, coachTaskId: upgraded.coachTaskId, teachingNote: sourceTeachingNote, output: finalSummary });
  broadcast({ type: "session_done", sessionId, output: finalSummary, tasks: activeSessions.get(sessionId)?.tasks || [] });
  return { output: finalSummary, teachingNote: sourceTeachingNote, sourceTaskId: sourceTask.id, coachTaskId: upgraded.coachTaskId };
}

function ensureSystemTask(tasks = [], taskDef) {
  if (tasks.some((task) => task.id === taskDef.id)) return tasks;
  return [taskDef, ...tasks];
}

function ensureLeadTask(tasks = []) {
  return ensureSystemTask(tasks, {
    id: LEAD_TASK_ID,
    name: "Lead Agent / 主模型",
    model: LEAD_MODEL,
    status: "pending",
    profileId: "lead-agent",
    profileName: "主模型 / 汇报与审查",
    skills: ["planning", "artifact-review", "delegation", "final-report"],
  });
}

function ensureArtifactReviewerTask(tasks = []) {
  const profile = loadAgentProfiles()["artifact-reviewer"];
  return ensureSystemTask(tasks, {
    id: ARTIFACT_REVIEWER_TASK_ID,
    name: "Artifact Reviewer / 审稿助手",
    model: profile?.defaultModel || "opencore-go/glm-5.2",
    status: "pending",
    profileId: "artifact-reviewer",
    profileName: "审稿 / 可用性裁决助手",
    skills: ["output-spec", "output-engine"],
  });
}

function updateLeadTask(sessionId, patch) {
  const current = activeSessions.get(sessionId)?.tasks || [];
  touchSession(sessionId, {
    tasks: ensureLeadTask(current).map((t) => t.id === LEAD_TASK_ID ? { ...t, ...patch, updatedAt: Date.now() } : t),
  });
}

function updateArtifactReviewerTask(sessionId, patch) {
  const current = activeSessions.get(sessionId)?.tasks || [];
  touchSession(sessionId, {
    tasks: ensureArtifactReviewerTask(ensureLeadTask(current)).map((t) => t.id === ARTIFACT_REVIEWER_TASK_ID ? { ...t, ...patch, updatedAt: Date.now() } : t),
  });
}

function recordSwitch(record) {
  modelSwitchLog.push({ timestamp: Date.now(), ...record });
  if (modelSwitchLog.length > MAX_LOG) modelSwitchLog.shift();
}

function registryPath(artifactsDir) {
  return join(artifactsDir, "registry.json");
}

function readArtifactRegistry(artifactsDir) {
  const path = registryPath(artifactsDir);
  if (!existsSync(path)) return { artifacts: [] };
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { artifacts: [] };
  }
}

function writeArtifactRegistry(artifactsDir, registry) {
  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(registryPath(artifactsDir), JSON.stringify(registry, null, 2));
}

function detectConfirmationRequest(output) {
  const text = String(output || "");
  if (!text.includes("[USER_CONFIRMATION_REQUIRED]")) return null;
  const after = text.split("[USER_CONFIRMATION_REQUIRED]").slice(1).join("[USER_CONFIRMATION_REQUIRED]").trim();
  const question = after.match(/问题[:：]\s*([^\n]+)/)?.[1]?.trim() || "子 Agent 需要用户确认后才能继续。";
  const options = after.match(/选项[:：]\s*([^\n]+)/)?.[1]?.trim() || "确认继续 / 调整方案 / 停止";
  const recommendation = after.match(/默认建议[:：]\s*([^\n]+)/)?.[1]?.trim() || "确认后继续执行当前 DAG。";
  return { question, options, recommendation, raw: after.slice(0, 1200) };
}

function evaluateArtifactOutput(output) {
  const issues = [];
  const text = String(output || "").trim();
  if (text.length < 80) issues.push("output_too_short");
  if (!/给下游的交付物|下游交付物|交付物/.test(text)) issues.push("missing_downstream_deliverable_section");
  return {
    status: issues.length ? "incomplete" : "ready",
    issues,
  };
}

function upsertArtifact(artifactsDir, artifact) {
  const registry = readArtifactRegistry(artifactsDir);
  const idx = registry.artifacts.findIndex((a) => a.id === artifact.id);
  if (idx >= 0) registry.artifacts[idx] = { ...registry.artifacts[idx], ...artifact, updatedAt: Date.now() };
  else registry.artifacts.push({ consumers: [], version: 1, createdAt: Date.now(), updatedAt: Date.now(), ...artifact });
  writeArtifactRegistry(artifactsDir, registry);
  return registry;
}

function recordArtifactConsumer(artifactsDir, artifactId, consumerTaskId) {
  const registry = readArtifactRegistry(artifactsDir);
  const artifact = registry.artifacts.find((a) => a.id === artifactId);
  if (artifact) {
    artifact.consumers = Array.from(new Set([...(artifact.consumers || []), consumerTaskId]));
    artifact.updatedAt = Date.now();
    writeArtifactRegistry(artifactsDir, registry);
  }
  return registry;
}

function buildMonitorPayload() {
  const sessions = [...activeSessions.entries()].map(([id, s]) => ({ id, ...s }));
  const latest = sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const tasks = latest?.tasks || [];
  const artifacts = latest?.artifacts || [];
  const running = tasks.filter((t) => t.status === "running");
  const completed = tasks.filter((t) => t.status === "completed");
  const pending = tasks.filter((t) => !t.status || t.status === "pending");
  const progress = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;

  return {
    sessions,
    agentStatus: {
      planner: { status: guardianState.status === "watching" ? "working" : "idle", model: "opencore-go/deepseek-v4-flash" },
      executor: { status: running.length ? "working" : "idle", model: running[0]?.model || "opencore-go/glm-5.2" },
      reviewer: { status: latest?.status === "synthesizing" ? "working" : "idle", model: "opencore-go/deepseek-v4-pro" },
    },
    guardianStatus: {
      status: guardianState.status,
      model: guardianState.model,
      interventionCount: guardianState.interventionCount,
      lastCheck: guardianState.lastCheck,
      lastPlan: guardianState.lastPlan,
      lastError: guardianState.lastError,
    },
    observerHealth: {
      isAlive: true,
      currentModel: guardianState.model,
      lastObservation: guardianState.lastCheck || Date.now(),
      failureCount: guardianState.lastError ? 1 : 0,
      uptime: process.uptime() * 1000,
    },
    latestObservation: latest ? {
      currentState: latest.status || "idle",
      targetState: "done",
      gap: running.length ? `${running.length} 个任务执行中` : pending.length ? `${pending.length} 个任务等待中` : "无",
      nextAction: latest.status === "error" ? "检查错误并重试" : latest.status === "done" ? "查看结果" : "等待执行完成",
      confidence: latest.status === "error" ? 0.3 : 0.8,
    } : null,
    activeRoles: running.map((t) => ({ name: t.name || t.id, perspective: t.model || "sub-agent" })),
    modelSwitchLog: modelSwitchLog.slice(-50),
    roleSwitchLog: [],
    agentProfiles: Object.values(loadAgentProfiles()),
    artifacts,
    subAgents: tasks.map((t) => ({
      id: t.id,
      name: t.name || t.id,
      skill: t.name || "task",
      modelId: t.model || "-",
      status: t.status || "pending",
      progress: t.status === "completed" ? 100 : t.status === "running" ? 50 : t.status === "error" ? 100 : 0,
      needsConfirmation: false,
      output: t.output,
      error: t.error,
    })),
    pendingConfirmations: [],
    flowState: latest?.flowState || null,
    stageFlow: {
      current: latest?.flowState?.currentStage || latest?.status || "",
      gateStatus: latest?.flowState?.gateStatus,
      deliverables: latest?.flowState?.stageDeliverables || [],
      progress,
      completed: completed.map((t) => t.name || t.id),
      pending: [...running, ...pending].map((t) => t.name || t.id),
    },
    routeHealth: {
      "opencore-go/glm-5.2": { status: "ok" },
      "opencore-go/deepseek-v4-flash": { status: guardianState.lastError ? "degraded" : "ok" },
      "opencore-go/deepseek-v4-pro": { status: "ok" },
    },
  };
}

function broadcast(data) {
  const msg = JSON.stringify({ ...data, monitor: buildMonitorPayload() });
  for (const ws of wsClients) if (ws.readyState === 1) ws.send(msg);
}

function broadcastLeadProgress(sessionId, text, options = {}) {
  if (!sessionId || !text) return;
  broadcast({
    type: "lead_progress",
    sessionId,
    id: randomUUID(),
    text,
    stage: options.stage || undefined,
    status: options.status || "info",
    timestamp: Date.now(),
  });
}

// ── Pi process runner ──────────────────────────────────────────────────────
function registerProcess(sessionId, entry) {
  if (!sessionId) return;
  if (!runningProcesses.has(sessionId)) runningProcesses.set(sessionId, new Set());
  runningProcesses.get(sessionId).add(entry);
}

function unregisterProcess(sessionId, entry) {
  if (!sessionId) return;
  const set = runningProcesses.get(sessionId);
  if (!set) return;
  set.delete(entry);
  if (set.size === 0) runningProcesses.delete(sessionId);
}

function abortSessionProcesses(sessionId, reason = "aborted") {
  const set = runningProcesses.get(sessionId);
  if (!set) return 0;
  let count = 0;
  for (const entry of [...set]) {
    try { entry.proc.kill("SIGKILL"); count++; } catch {}
  }
  runningProcesses.delete(sessionId);
  touchSession(sessionId, { status: "aborted", error: reason });
  broadcast({ type: "session_aborted", sessionId, reason });
  return count;
}

function abortTaskProcesses(sessionId, taskId, reason = "task aborted") {
  const set = runningProcesses.get(sessionId);
  if (!set) return 0;
  let count = 0;
  for (const entry of [...set]) {
    if (entry.taskId === taskId) {
      try { entry.proc.kill("SIGKILL"); count++; } catch {}
      set.delete(entry);
    }
  }
  if (set.size === 0) runningProcesses.delete(sessionId);
  touchSession(sessionId, {
    tasks: (activeSessions.get(sessionId)?.tasks || []).map((t) => t.id === taskId ? { ...t, status: "aborted", error: reason } : t),
  });
  broadcast({ type: "task_aborted", sessionId, taskId, reason });
  return count;
}

function runPi({ model, prompt, cwd, systemPrompt, onDelta, onDone, onError, timeoutMs = 90000, noTools = false, sessionId, taskId }) {
  mkdirSync(cwd, { recursive: true });

  const args = ["--print", "--mode", "json", "--model", model];
  if (noTools) args.push("--no-tools");
  if (systemPrompt) args.push("--system-prompt", systemPrompt);
  console.log(`[runPi] start model=${model} cwd=${cwd}`);
  const proc = spawn(PI_BIN, args, { env: PI_ENV, cwd });
  const procEntry = { proc, taskId, model, cwd };
  registerProcess(sessionId, procEntry);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    console.error(`[runPi] timeout model=${model} cwd=${cwd}`);
    proc.kill("SIGKILL");
  }, timeoutMs);

  proc.stdin.write(prompt);
  proc.stdin.end();

  let buf = "";
  let finalText = "";

  proc.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop(); // keep incomplete line
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.type === "message_update") {
          const ae = ev.assistantMessageEvent;
          if (ae?.type === "text_delta" && ae.delta) {
            finalText += ae.delta;
            onDelta?.(ae.delta);
          }
        }
        if (ev.type === "agent_end") {
          const last = [...(ev.messages || [])].reverse().find((m) => m.role === "assistant");
          if (last?.content?.[0]?.text) finalText = last.content[0].text;
        }
      } catch {}
    }
  });

  proc.stderr.on("data", (d) => process.stderr.write(`[pi:${model}] ${d}`));

  return new Promise((resolve, reject) => {
    proc.on("close", (code) => {
      clearTimeout(timer);
      unregisterProcess(sessionId, procEntry);
      console.log(`[runPi] close model=${model} code=${code} textLen=${finalText.length}`);
      if (timedOut) {
        onError?.(`Process timed out after ${timeoutMs}ms`);
        reject(new Error(`pi timeout after ${timeoutMs}ms`));
      } else if (code !== 0 && !finalText) {
        onError?.(`Process exited with code ${code}`);
        reject(new Error(`pi exited ${code}`));
      } else {
        onDone?.(finalText);
        resolve(finalText);
      }
    });
    proc.on("error", (err) => { unregisterProcess(sessionId, procEntry); onError?.(err.message); reject(err); });
  });
}

// ── Guardian: analyze complexity + decompose tasks ─────────────────────────
const GUARDIAN_SYSTEM = `你是任务分析器。你只能做分类和任务拆分，不允许探索文件、不允许读项目、不允许使用工具。分析用户消息，判断是否需要多Agent并行处理，并分配可用模型。

轻量五问框架（内部判断，不要原样输出给用户）：
1. 用户真正想达成什么结果？
2. 当前是否已有足够意图信息？
3. 当前最关键的推进点是什么？
4. 这是主线推进，还是闲聊/支线优化？
5. 是否需要澄清后才能安全进入多Agent？

只返回JSON，不要其他文字：
{
  "single": true或false,
  "reason": "一句话说明",
  "tasks": [
    {
      "id": "t1",
      "name": "任务名称",
      "model": "opencore-go/deepseek-v4-flash",
      "prompt": "完整的任务指令",
      "deps": []
    }
  ],
  "synthesize_prompt": "整合所有子任务结果，生成最终回复的指令"
}

判断规则：
- 闲聊/单一问答/简单执行 → single:true，tasks为空
- 需要搜索+分析+写作 / 多视角 / 多步骤 → single:false
- 简单任务优先使用 opencore-go/deepseek-v4-flash；仓库级代码执行任务优先使用 opencore-go/glm-5.2；复杂分析使用 opencore-go/deepseek-v4-pro

可用模型：opencore-go/glm-5.2, opencore-go/glm-5.1, opencore-go/deepseek-v4-flash, opencore-go/deepseek-v4-pro, opencore-go/qwen3.7-plus`;

function isVagueProjectStart(input) {
  const text = String(input || "").trim();
  return text.length <= 30 && /(开始|启动|做).*(复杂项目|项目)|复杂项目/.test(text);
}

function shouldUseLocalMultiAgentPlan(userInput) {
  const text = String(userInput || "");
  return /Guardian|路由|监控|pi-frontend|pi-backend|多Agent|multi-agent|agent|artifact|flow|skill|intervention|workflow|工作流|物料|协作|主模型|子Agent/i.test(text);
}

function localFallbackPlan(userInput) {
  const text = String(userInput || "");
  if (shouldUseLocalMultiAgentPlan(text)) {
    return {
      single: false,
      reason: "Guardian failed, local fallback splits known multi-agent project task",
      tasks: [
        {
          id: "t1",
          name: "后端 Guardian 路由检查",
          model: "opencore-go/deepseek-v4-flash",
          prompt: "分析当前多Agent后端的 Guardian 路由、健康检查、fallback 逻辑应该如何补齐。输出：问题清单、最小实现方案、需要修改的文件。不要实际修改文件。",
          deps: [],
        },
        {
          id: "t2",
          name: "前端监控链路检查",
          model: "opencore-go/deepseek-v4-flash",
          prompt: "分析 pi-frontend 的 Multi-Agent 监控面板、主聊天外部消息渲染、/api/orchestrate 代理链路。输出：问题清单、最小实现方案、需要修改的文件。不要实际修改文件。",
          deps: [],
        },
      ],
      synthesize_prompt: "整合两个子任务结果，给出下一步最小可执行开发计划。",
    };
  }
  return { single: true, reason: "Guardian failed, fallback to direct clarification", tasks: [] };
}

async function guardianAnalyze(userInput, sessionId) {
  // If user has manually closed the multiagent switch, Guardian skips all auto-decisions
  const session = activeSessions.get(sessionId);
  if (session?.userClosedMultiagent) {
    const plan = { single: true, reason: "用户已手动关闭 multiagent 开关，Guardian 跳过自动操作", tasks: [] };
    guardianState.status = "idle";
    guardianState.lastCheck = Date.now();
    guardianState.lastPlan = plan;
    touchSession(sessionId, { status: "single", tasks: [] });
    broadcast({ type: "guardian_done", sessionId, plan, skipped: true });
    return plan;
  }

  guardianState.status = "watching";
  guardianState.lastCheck = Date.now();
  guardianState.lastError = null;
  touchSession(sessionId, { status: "guardian", input: userInput });
  broadcast({ type: "guardian_thinking", sessionId });
  const cwd = join(WORKSPACE, sessionId, "guardian");

  let raw = "";
  try {
    raw = await runPi({
      model: "opencore-go/deepseek-v4-flash",
      prompt: `用户消息：${userInput}\n\n返回JSON分析：`,
      cwd,
      systemPrompt: GUARDIAN_SYSTEM,
      timeoutMs: 20000,
      noTools: true,
    });

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const plan = JSON.parse(jsonMatch[0]);

    guardianState.status = plan.single ? "idle" : "watching";
    guardianState.lastCheck = Date.now();
    guardianState.lastPlan = plan;
    touchSession(sessionId, { status: plan.single ? "single" : "planned", tasks: plan.tasks || [] });
    broadcast({ type: "guardian_done", sessionId, plan });
    return plan;
  } catch (err) {
    console.error("[Guardian] Failed:", err.message, "\nRaw:", raw?.slice(0, 200));
    guardianState.status = "intervened";
    guardianState.lastCheck = Date.now();
    guardianState.interventionCount++;
    guardianState.lastError = err.message;
    const fallback = localFallbackPlan(userInput);
    guardianState.lastPlan = fallback;
    recordSwitch({ from: guardianState.model, to: "local-fallback", reason: "failure", taskId: sessionId });
    touchSession(sessionId, { status: fallback.single ? "single" : "planned", tasks: fallback.tasks || [] });
    broadcast({ type: "guardian_done", sessionId, plan: fallback, fallback: true });
    return fallback;
  }
}

// ── Lead Agent + specialist profiles ──────────────────────────────────────
function readLeadPolicy() {
  if (existsSync(LEAD_POLICY_PATH)) return readFileSync(LEAD_POLICY_PATH, "utf-8");
  return "你是 Lead Agent，负责规划、审查物料和最终汇报。";
}

function buildLeadSystemPrompt(scope) {
  return `${readLeadPolicy()}\n\n${buildRoutedSkillPrompt(scope)}\n\nSkill 使用说明：以上 skill 是系统协作规则库的选择性摘要，只使用与当前阶段相关的规则；不要在输出中复述 skill 原文。`;
}

function extractJsonObject(text) {
  const raw = String(text || "");
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Lead Agent did not return JSON");
  return JSON.parse(match[0]);
}

async function runArtifactReviewerMemo(sessionId, artifactsDir, plan) {
  const session = activeSessions.get(sessionId);
  if (!session) return "";
  const profile = loadAgentProfiles()["artifact-reviewer"];
  if (!profile) return "";
  const registry = readArtifactRegistry(artifactsDir);
  const projectMemory = readProjectMemorySnapshot(session, `artifact review\n${JSON.stringify(plan)}`);
  updateArtifactReviewerTask(sessionId, { status: "running", collaborationStatus: "ready_for_review", output: "Artifact Reviewer 正在生成审稿备忘..." });
  broadcast({ type: "task_start", sessionId, taskId: ARTIFACT_REVIEWER_TASK_ID, model: profile.defaultModel || "opencore-go/glm-5.2", profile });
  try {
    const output = await runPi({
      model: profile.defaultModel || "opencore-go/glm-5.2",
      cwd: join(WORKSPACE, sessionId, "artifact-reviewer"),
      noTools: true,
      timeoutMs: 45000,
      systemPrompt: `${profile.systemPromptPatch}\n\n${loadSkillPromptBlock(profile.skills || [])}`,
      prompt: `你是 Lead 的 artifact-reviewer。请根据当前计划、artifact registry 和项目记忆，生成一份给 Lead 的审稿备忘。\n\n要求：\n1. 不做最终 accept/reject。\n2. 只输出：usable 判断要点、关键缺口、建议的 revision 方向、最值得 Lead 看的 artifact。\n3. 简洁但具体。\n\n计划：\n${JSON.stringify(plan, null, 2)}\n\nartifact registry：\n${JSON.stringify(registry.artifacts || [], null, 2)}\n\n项目记忆：\n${JSON.stringify(projectMemory, null, 2)}`,
    });
    touchSession(sessionId, { artifactReviewMemo: output });
    updateArtifactReviewerTask(sessionId, { status: "completed", collaborationStatus: "accepted", output });
    broadcast({ type: "task_done", sessionId, taskId: ARTIFACT_REVIEWER_TASK_ID, output });
    return output;
  } catch {
    updateArtifactReviewerTask(sessionId, { status: "error", collaborationStatus: "blocked", error: "artifact reviewer failed" });
    broadcast({ type: "task_error", sessionId, taskId: ARTIFACT_REVIEWER_TASK_ID, error: "artifact reviewer failed" });
    return "";
  }
}

async function runMemoryCuratorSummary(sessionId, kind, title, body, meta = {}) {
  const session = activeSessions.get(sessionId);
  if (!session) return "";
  const profile = loadAgentProfiles()["memory-curator"];
  if (!profile) return "";
  try {
    return await runPi({
      model: profile.defaultModel || "opencore-go/glm-5.2",
      cwd: join(WORKSPACE, sessionId, `memory-curator-${kind}`),
      noTools: true,
      timeoutMs: 45000,
      systemPrompt: `${profile.systemPromptPatch}\n\n${loadSkillPromptBlock(profile.skills || [])}`,
      prompt: `你是 memory-curator。请把下面这次运行整理成一份适合写入项目记忆 summaries/ 的小摘要。\n\n要求：\n1. 只保留本项目后续最可能复用的信息。\n2. 不要泛泛总结。\n3. 要包含：发生了什么、为什么重要、下次遇到类似情况怎么复用。\n\nkind: ${kind}\ntitle: ${title}\nmeta: ${JSON.stringify(meta, null, 2)}\n\n内容：\n${body}`,
    });
  } catch {
    return "";
  }
}

function buildAgentProfileKnowledge() {
  const profiles = loadAgentProfiles();
  return Object.values(profiles).map((p) => ({
    id: p.id,
    name: p.name,
    match: p.match,
    defaultModel: p.defaultModel,
    skills: p.skills,
    availableSkills: p.availableSkills || p.skills || [],
    projectConfig: p.projectConfig || {},
    collaborationProtocol: p.collaborationProtocol || "",
    systemPromptPatch: p.systemPromptPatch || "",
    experience: p.experience || 0,
    successes: p.successes || 0,
    failures: p.failures || 0,
    modelStats: p.modelStats || {},
    skillStats: p.skillStats || {},
    savedExperiences: (p.savedExperiences || []).slice(0, 5),
  }));
}

function buildGlobalSkillKnowledge() {
  try {
    const dirs = readdirSync(SKILL_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory());
    return dirs.map((d) => {
      const id = d.name;
      const file = join(SKILL_ROOT, id, "SKILL.md");
      let description = "";
      if (existsSync(file)) {
        const text = readFileSync(file, "utf-8");
        description = text.split("\n").find((line) => line.trim() && !line.startsWith("#") && !line.startsWith("---"))?.slice(0, 180) || "";
      }
      return { id, description };
    });
  } catch {
    return [];
  }
}

function needsStrictUserReview(input) {
  return /严格审查|严格审核|仔细审查|仔细审核|重点审查|双重检查|严格把关|review carefully|strict review|double check/i.test(String(input || ""));
}

function allowsDirectOutput(input) {
  return /可以直出|直接给我|不需要审查|不用审查|无需审查|不需要额外审稿|不用额外审稿|跳过审稿|不需要review|不用review|无需review/i.test(String(input || ""));
}

function shouldRunArtifactReviewer(plan, session) {
  if (needsStrictUserReview(session?.input) || plan?.reviewPolicy === "lead_plus_reviewer") return true;
  if (plan?.reviewPolicy === "lead_only" || plan?.skipArtifactReviewer === true || allowsDirectOutput(session?.input)) return false;
  return true;
}

async function leadPlan(userInput, sessionId) {
  const session = activeSessions.get(sessionId);
  const flowState = session?.flowState || createFlowState(userInput);
  const profileKnowledge = buildAgentProfileKnowledge();
  const globalSkillKnowledge = buildGlobalSkillKnowledge();
  const projectMemory = readProjectMemorySnapshot(session, userInput);
  updateLeadTask(sessionId, { status: "running", output: "Lead Agent 正在理解目标并规划子任务..." });
  broadcast({ type: "task_start", sessionId, taskId: LEAD_TASK_ID, model: LEAD_MODEL });
  broadcastLeadProgress(sessionId, "Lead 已接管这轮任务，正在梳理主线并拆分执行计划。", { stage: "planning", status: "running" });
  const cwd = join(WORKSPACE, sessionId, "lead-plan");
  const raw = await runPi({
    model: LEAD_MODEL,
    cwd,
    noTools: true,
    timeoutMs: 60000,
    systemPrompt: buildLeadSystemPrompt("leadPlan"),
    prompt: `阶段：planning\n\n已知真实项目目录：\n- pi-backend: ${REPO_ROOT}\n- pi-frontend: ${FRONTEND_ROOT}\n\n规划任务时必须把这些真实目录写进子任务说明；不要让子 Agent 从 /tmp 或 /private/tmp/pi-multi-agent 猜测项目位置。\n\n可唤醒 Agent Profile / 工具经验（优先复用匹配任务的 profile、技能和模型经验）：\n${JSON.stringify(profileKnowledge, null, 2)}\n\n全量 Skill 简介目录（你可以从这里为任意子任务自由选择 task.skills，不受某个 profile 的 availableSkills 上限约束）：\n${JSON.stringify(globalSkillKnowledge, null, 2)}\n\n强制规则：\n1. 生成子任务时，优先从上面的 profile catalog 中选择明确的 profileId，不要偷懒全用 general-executor。\n2. profile 负责角色、经验、协作方式、默认模型；本次实际启用哪些 skills，由你从全量 skill 目录中按任务判断写入 task.skills。\n3. profile 的 skills / availableSkills 只是历史偏好与参考，不是 task.skills 的硬上限。\n4. 不要默认激活很多 skill；只选择本次任务真正需要的 skill。\n5. 涉及 bug 修复、调教、结果不可用时，优先使用 debug-teacher profile。\n6. 涉及 context/progress/bugs/阶段状态时，优先使用 session-memory profile。\n7. 涉及协作、物料、交付、上下游依赖时，优先使用 artifact-flow profile。\n8. 你必须主动识别简单任务：如果任务只是分类、抽取、总结、改写、意图判断、路由判断、轻量审稿、记忆整理、短文本生成，且不涉及仓库级改代码、跨文件修改、复杂推理、多模态理解，则默认优先使用 opencore-go/deepseek-v4-flash。\n9. 只有当任务明显超出简单任务边界时，才升级到 glm-5.2、qwen3.7-plus 或 deepseek-v4-pro。\n10. 文本生成、算法题/竞赛代码、高并发调用、长文本分析这四类任务固定使用 opencore-go/deepseek-v4-flash，除非用户明确指定别的模型。\n\n当前项目记忆（只读取本项目目录，不扫描其他项目）：\n${JSON.stringify(projectMemory, null, 2)}\n\n当前全局 Flow State（来自 agent_memory 流转机制的后端状态）：\n${JSON.stringify(flowState, null, 2)}\n\n用户输入/上下文：\n${userInput}\n\n请严格按 Planning 输出协议返回 JSON。`, 
    onDelta: (delta) => broadcast({ type: "task_delta", sessionId, taskId: LEAD_TASK_ID, delta }),
    sessionId,
    taskId: LEAD_TASK_ID,
  });
  const plan = extractJsonObject(raw);
  plan.reviewPolicy = plan.reviewPolicy === "lead_only" ? "lead_only" : "lead_plus_reviewer";
  if (!Array.isArray(plan.tasks)) plan.tasks = [];
  plan.tasks = plan.tasks.map((t, i) => ({
    id: t.id || `t${i + 1}`,
    name: t.name || `子任务 ${i + 1}`,
    model: t.model || "opencore-go/deepseek-v4-flash",
    modelSource: t.modelSource,
    modelReason: t.modelReason,
    profileId: t.profileId,
    skills: Array.isArray(t.skills) ? t.skills : [],
    needsDebugging: Boolean(t.needsDebugging),
    taskStages: Array.isArray(t.taskStages) ? t.taskStages : [],
    currentTaskStage: t.currentTaskStage,
    needsPlanDiscussion: Boolean(t.needsPlanDiscussion),
    prompt: t.prompt || t.name || "执行子任务",
    deps: Array.isArray(t.deps) ? t.deps : [],
    profileHint: t.profileHint,
  }));
  const plannedFlowState = applyPlanKnowledgeToFlowState(activeSessions.get(sessionId)?.flowState, plan);
  touchSession(sessionId, { plan, flowState: plannedFlowState });
  broadcastLeadProgress(sessionId, `规划完成，已拆分 ${plan.tasks.length} 个子任务：${plan.tasks.map((t) => t.name).join("、") || "无"}。`, { stage: "planning", status: "done" });
  updateLeadTask(sessionId, { status: "completed", output: `规划完成：${plan.tasks.map((t) => t.name).join("、")}` });
  broadcast({ type: "task_done", sessionId, taskId: LEAD_TASK_ID, output: `规划完成：${plan.tasks.length} 个子任务` });
  return plan;
}

async function leadReviewArtifacts(sessionId, artifactsDir, plan) {
  const registry = readArtifactRegistry(artifactsDir);
  const session = activeSessions.get(sessionId);
  const flowState = session?.flowState;
  const projectMemory = readProjectMemorySnapshot(session, JSON.stringify(plan));
  updateLeadTask(sessionId, { status: "running", output: "Lead Agent 正在审查子 Agent 交付物..." });
  broadcast({ type: "task_start", sessionId, taskId: LEAD_TASK_ID, model: LEAD_MODEL });
  broadcastLeadProgress(sessionId, "主要执行阶段已完成，Lead 正在统一审查各子任务交付物。", { stage: "review", status: "running" });
  const shouldRunReviewer = shouldRunArtifactReviewer(plan, session);
  const reviewerMemo = shouldRunReviewer ? await runArtifactReviewerMemo(sessionId, artifactsDir, plan) : "";
  if (!shouldRunReviewer) {
    const skipNote = `本轮按显式审稿策略跳过 artifact-reviewer（reviewPolicy=${plan?.reviewPolicy || (allowsDirectOutput(session?.input) ? "user_direct_output" : "default_skip")}）。`;
    broadcastLeadProgress(sessionId, skipNote, { stage: "review", status: "info" });
    updateArtifactReviewerTask(sessionId, { status: "completed", collaborationStatus: "accepted", output: skipNote });
    broadcast({ type: "task_done", sessionId, taskId: ARTIFACT_REVIEWER_TASK_ID, output: skipNote });
  }
  const manifest = JSON.stringify(registry.artifacts || [], null, 2);
  const raw = await runPi({
    model: LEAD_MODEL,
    cwd: join(WORKSPACE, sessionId, "lead-review"),
    noTools: true,
    timeoutMs: 60000,
    systemPrompt: buildLeadSystemPrompt("leadReview"),
    prompt: `阶段：review\n\n原始计划：\n${JSON.stringify(plan, null, 2)}\n\n当前项目记忆（只读取本项目目录）：\n${JSON.stringify(projectMemory, null, 2)}\n\n当前全局 Flow State：\n${JSON.stringify(flowState, null, 2)}\n\n本轮显式审稿策略：${plan?.reviewPolicy || (allowsDirectOutput(session?.input) ? "lead_only (from user direct-output preference)" : "lead_plus_reviewer (default)")}\nArtifact Reviewer 是否触发：${shouldRunReviewer ? "是" : "否"}\nArtifact Reviewer Memo（供 Lead 参考，不可直接代替裁决）：\n${reviewerMemo || "无"}\n\nArtifact Registry：\n${manifest}\n\n请严格按 Review 输出协议返回 JSON。`,
    onDelta: (delta) => broadcast({ type: "task_delta", sessionId, taskId: LEAD_TASK_ID, delta }),
    sessionId,
    taskId: LEAD_TASK_ID,
  });
  const review = extractJsonObject(raw);
  broadcastLeadProgress(sessionId, review.summary || "Lead 审查完成，正在整理最终结论。", { stage: "review", status: "done" });
  const reviewedFlowState = applyReviewKnowledgeToFlowState(activeSessions.get(sessionId)?.flowState, review);
  touchSession(sessionId, { review, flowState: reviewedFlowState });
  applyAgentDecisions(sessionId, review);
  updateLeadTask(sessionId, { status: "completed", output: review.summary || "物料审查完成" });
  broadcast({ type: "task_done", sessionId, taskId: LEAD_TASK_ID, output: review.summary || "物料审查完成" });
  return review;
}

function isCoachingIntent(input) {
  return /不满意|不太满意|继续调教|调教|改得不对|结果不对|这部分不对|不符合|再优化|重新优化|修正这个结果|teach|coach|not satisfied/i.test(String(input || ""));
}

async function leadFinalReport(sessionId, artifactsDir, plan, review) {
  const registry = readArtifactRegistry(artifactsDir);
  const session = activeSessions.get(sessionId);
  const flowState = session?.flowState;
  const projectMemory = readProjectMemorySnapshot(session, `${JSON.stringify(plan)}\n${JSON.stringify(review)}`);
  const outputs = (registry.artifacts || []).map((a) => {
    const body = existsSync(a.path) ? readFileSync(a.path, "utf-8").slice(0, 6000) : "";
    return `\n## ${a.id}\nproducer=${a.producerTaskName || a.producerTaskId}\nstatus=${a.status}\nissues=${(a.issues || []).join(",") || "none"}\npath=${a.path}\n\n${body}`;
  }).join("\n\n---\n\n");
  updateLeadTask(sessionId, { status: "running", output: "Lead Agent 正在生成最终汇报..." });
  broadcast({ type: "task_start", sessionId, taskId: LEAD_TASK_ID, model: LEAD_MODEL });
  broadcastLeadProgress(sessionId, "Lead 正在汇总执行结果，准备向你做最终汇报。", { stage: "final_report", status: "running" });
  let finalOutput = "";
  await runPi({
    model: LEAD_MODEL,
    cwd: join(WORKSPACE, sessionId, "lead-final"),
    noTools: true,
    timeoutMs: 90000,
    systemPrompt: buildLeadSystemPrompt("leadFinalReport"),
    prompt: `阶段：final report\n\n计划：\n${JSON.stringify(plan, null, 2)}\n\n审查结果：\n${JSON.stringify(review, null, 2)}\n\n当前项目记忆（只读取本项目目录）：\n${JSON.stringify(projectMemory, null, 2)}\n\n当前全局 Flow State：\n${JSON.stringify(flowState, null, 2)}\n\n物料内容：\n${outputs}\n\n请按 Final Report 输出协议给用户自然语言汇报。`,
    onDelta: (delta) => broadcast({ type: "task_delta", sessionId, taskId: LEAD_TASK_ID, delta }),
    onDone: (text) => { finalOutput = text; },
    sessionId,
    taskId: LEAD_TASK_ID,
  });
  touchSession(sessionId, { finalOutput, flowState: applyFinalKnowledgeToFlowState(activeSessions.get(sessionId)?.flowState, finalOutput) });
  updateLeadTask(sessionId, { status: "completed", output: finalOutput, artifactId: "final-output" });
  broadcast({ type: "task_done", sessionId, taskId: LEAD_TASK_ID, output: finalOutput, artifactId: "final-output" });
  return finalOutput;
}

// ── Sub-agent executor ─────────────────────────────────────────────────────
const SUBAGENT_SYSTEM = `你是一个专注执行单一任务的AI助手。
- 默认拥有 Pi 工具权限；在任务范围内可以读写项目文件并执行必要验证
- 直接执行任务，输出高质量结果
- 如果有前置物料/上游交付物，必须先理解它们，再继续执行
- 输出要具体、完整、可直接交给下游 Agent 使用
- 输出末尾必须包含「给下游的交付物」小节，列出下游可复用的结论、文件路径、风险和待确认事项
- 如遇到无法完成的情况，说明原因、缺失物料和建议补齐方式，并汇报给 Lead Agent
- 如果任务推进了项目长期状态，只在输出中说明应沉淀到 context/progress/bugs 的内容；不要自行扫描或改写所有项目记忆，后端会按当前项目 cwd 隔离落盘
- 如果发现越界、破坏性操作、需求不明确、需要用户选择，必须在输出末尾额外加入：
  [USER_CONFIRMATION_REQUIRED]
  问题：[需要用户确认的问题]
  选项：[可选方案]
  默认建议：[你的建议]`;

function getTaskCwd(task) {
  const text = `${task.name || ""}\n${task.prompt || ""}`;
  if (/pi-backend|后端|backend|monitor-server|Guardian 路由/i.test(text)) {
    return REPO_ROOT;
  }
  if (/pi-frontend|前端|frontend|ChatWindow|AppShell|useOrchestrate|监控面板/i.test(text)) {
    return FRONTEND_ROOT;
  }
  return null;
}

function isDeepSeekCodingTask(task, profile, model) {
  const text = `${task?.name || ""}\n${task?.prompt || ""}`;
  const skillText = [...(task?.skills || []), ...(profile?.skills || []), ...(profile?.availableSkills || [])].join(" ");
  return /deepseek-v4-(flash|pro)/i.test(String(model || ""))
    && (/代码|编程|工程|修复|bug|实现|修改|文件|diff|patch|component|hook|route|monitor-server|AppShell|useOrchestrate/i.test(text)
      || /engineering-mode/i.test(skillText));
}

function shouldForceFlashModel(task) {
  const text = `${task?.name || ""}\n${task?.prompt || ""}`;
  return /文本生成|文案|改写|润色|长文本分析|长文分析|长文总结|长文理解|高并发|批量调用|并发调用|算法题|竞赛代码|acm|oi|leetcode|codeforces/i.test(text);
}

function touchesCriticalPromptFiles(task) {
  const text = `${task?.name || ""}\n${task?.prompt || ""}`;
  return /memory-templates|agent\.md|lead-agent\.md|sub-agent-defaults\.md|AGENTS\.md/i.test(text);
}

function selectProtectedCodingModel(task, profile, requestedModel) {
  if (shouldForceFlashModel(task)) return "opencore-go/deepseek-v4-flash";
  if (!isDeepSeekCodingTask(task, profile, requestedModel)) return requestedModel;
  if (!touchesCriticalPromptFiles(task)) return requestedModel;
  return "opencore-go/kimi-k2.7-code";
}

function inferModelSelection(task, profile) {
  const requestedModel = task.modelOverride || task.model || profile.defaultModel || "opencore-go/glm-5.2";
  const effectiveModel = selectProtectedCodingModel(task, profile, requestedModel);
  const existingSource = task.modelSource;
  const existingReason = task.modelReason;
  if (requestedModel !== effectiveModel) {
    const reason = shouldForceFlashModel(task)
      ? "命中文本生成/算法题竞赛代码/高并发调用/长文本分析固定路由，强制使用 deepseek-v4-flash"
      : "命中关键路径文件，禁止由 deepseek-v4 直接处理，已保护性改派到更保守的非 DeepSeek 代码模型";
    return { requestedModel, effectiveModel, modelSource: "safety_reroute", modelReason: existingReason || reason };
  }
  if (existingSource) {
    return { requestedModel, effectiveModel, modelSource: existingSource, modelReason: existingReason || "Lead 已指定模型" };
  }
  if (shouldForceFlashModel(task)) {
    return { requestedModel, effectiveModel, modelSource: "fixed_route", modelReason: existingReason || "命中文本生成/算法题竞赛代码/高并发调用/长文本分析固定路由" };
  }
  if (task.modelOverride) {
    return { requestedModel, effectiveModel, modelSource: "user_override", modelReason: existingReason || "用户手动切换或重跑时指定模型" };
  }
  if (task.model) {
    return { requestedModel, effectiveModel, modelSource: "lead_selected", modelReason: existingReason || "Lead 根据任务类型主动选择该模型" };
  }
  return { requestedModel, effectiveModel, modelSource: "profile_default", modelReason: existingReason || "未显式指定模型，回退到 profile 默认模型" };
}

function buildDeepSeekCodingGuardrail(task) {
  if (!task) return "";
  return `

==== DeepSeek 编程护栏 ====
本任务是 deepseek-v4 系列执行的编程修改任务。必须遵守以下额外约束：
1. 默认只允许增改，不允许自由删减、整段删除或大规模重构。
2. 如需删除任何已有代码、配置或文档段落，必须先明确写出“删除理由”，并说明为什么不能通过增改解决。
3. 必须先列出“保留的代码块 / 文件片段”，确认哪些内容不能动。
4. 输出以 diff / 精确替换块 / 最小修改说明为主，不要整文件重写。
5. 如果要改关键路径文件（memory-templates、agent.md、lead-agent.md、sub-agent-defaults.md、AGENTS.md），应先停止并汇报 Lead，不要自行直接改写。
6. 如果现有文件里已经有明显的“不要修改”标记、兼容逻辑或用户定制内容，优先保留。
7. 最终结果中必须单独列出：
   - 保留的代码块
   - 新增/修改点
   - 删除理由（如无删除，明确写“无删除”）
`;
}

async function executeTask(task, sessionId, artifactsDir) {
  const profile = selectAgentProfile(task);
  const taskDir = getTaskCwd(task) || join(WORKSPACE, sessionId, task.id);
  const modelSelection = inferModelSelection(task, profile);
  const requestedModel = modelSelection.requestedModel;
  const effectiveModel = modelSelection.effectiveModel;
  const shouldEnterDebugging = Boolean(task.needsDebugging) || (profile.experience || 0) === 0;

  if (task.promptAppend) {
    task = { ...task, prompt: `${task.prompt || ""}\n\n==== 用户调试/干预指令 ====${task.promptAppend}` };
  }
  const skillScope = inferTaskSkillScope(task);
  const profileStoredSkills = profile.skills || [];
  const profileAvailableSkills = profile.availableSkills || profileStoredSkills;
  const taskSkillIds = Array.isArray(task.skills) ? task.skills : [];
  const selectedProfileSkills = taskSkillIds.length
    ? Array.from(new Set(taskSkillIds))
    : profileStoredSkills;
  const equippedSkills = Array.isArray(task.skillsOverride) && task.skillsOverride.length > 0
    ? Array.from(new Set(task.skillsOverride))
    : getRoutedSkillIds(skillScope, Array.from(new Set(selectedProfileSkills)));
  const skillPromptBlock = loadSkillPromptBlock(equippedSkills);
  const subAgentDefaults = existsSync(SUBAGENT_DEFAULTS_PATH) ? readFileSync(SUBAGENT_DEFAULTS_PATH, "utf-8") : "";
  const projectMemory = readProjectMemorySnapshot(activeSessions.get(sessionId), task.prompt || task.name || "");
  const deepSeekCodingGuardrail = isDeepSeekCodingTask(task, profile, effectiveModel) ? buildDeepSeekCodingGuardrail(task) : "";
  const reroutedCriticalPathNote = requestedModel !== effectiveModel ? `\n\n==== 模型保护性改派 ====\n原请求模型：${requestedModel}\n实际执行模型：${effectiveModel}\n原因：任务命中关键路径文件，禁止由 deepseek-v4 直接处理，已自动改派到更保守的非 DeepSeek 代码模型。\n` : "";
  const runStartedAt = Date.now();

  // Inject profile + routed skill rules + dependency artifacts into prompt
  let fullPrompt = `${task.prompt}\n\n==== 子任务阶段状态 ====\n当前子任务阶段：${task.currentTaskStage || "执行"}\n是否仍需方案讨论：${task.needsPlanDiscussion ? "是" : "否"}\n子任务阶段列表：${JSON.stringify(task.taskStages || [])}\n如果该子任务仍处于方案讨论阶段，不要假装已经完成执行；请输出方案选项、风险、待确认点，并在必要时汇报 Lead。\n\n==== 子Agent 通用系统手册 ====
${subAgentDefaults || "无"}

==== 子Agent Profile ====
Profile ID：${profile.id}
Profile 名称：${profile.name}
Profile 固定技能：${profileStoredSkills.join(", ") || "无"}
Profile 可选技能池：${profileAvailableSkills.join(", ") || "无"}
本次实际激活技能：${equippedSkills.join(", ") || "无"}
Profile 协作方式：${profile.collaborationProtocol || "遵循默认协作协议"}
Profile 项目配置：${JSON.stringify(profile.projectConfig || {})}
本任务 Skill Scope：${skillScope}
经验次数：${profile.experience || 0}
成功次数：${profile.successes || 0}
失败次数：${profile.failures || 0}
Profile 指令：${profile.systemPromptPatch || "无"}

==== 当前项目记忆（只读取本项目，不读取其他项目历史）====
Project ID：${projectMemory.projectId}
Project CWD：${projectMemory.cwd}
context.md：
${projectMemory.context || "无"}

progress.md：
${projectMemory.progress || "无"}

bugs.md：
${projectMemory.bugs || "无"}

${skillPromptBlock}

协作执行要求：
1. 你不是独立回答，而是当前多 Agent 协作链路中的一个 profile 化子 Agent。
2. 先遵守通用系统手册，再叠加当前 profile 的项目配置和经验。
3. profile 中保存的技能和经验是长期资产；本次真正要执行的，只是 Lead 为当前任务选中的技能。
4. 结果必须能被 Lead 或下游 Agent 直接使用，而不是只给模糊建议。

Skill 使用要求：
1. 上面的 skill 是按任务类型选择性注入的执行规则，必须优先遵守。
2. 不要自行激活未被本轮选中的可选技能。
3. 如果 skill 规则与本次 task 冲突，以 task 明确要求和项目真实代码为准，并说明取舍。
4. 不要输出完整 skill 原文，只输出任务结果与必要验证。${deepSeekCodingGuardrail}${reroutedCriticalPathNote}

注意：当前工作目录是 ${taskDir}。如果需要检查项目代码，请直接读取当前目录相关文件；不要假设代码在 /tmp。最终只输出任务结果，不要输出无关探索日志。`;
  if (task.deps?.length > 0) {
    touchSession(sessionId, {
      tasks: (activeSessions.get(sessionId)?.tasks || []).map((t) => t.id === task.id ? { ...t, status: "waiting_for_dependency", collaborationStatus: "waiting_material" } : t),
    });
    const depContents = task.deps.map((depId) => {
      const artifactId = `${depId}-output`;
      const artifactPath = join(artifactsDir, `${depId}-output.md`);
      if (existsSync(artifactPath)) {
        const registry = recordArtifactConsumer(artifactsDir, artifactId, task.id);
        const artifactMeta = registry.artifacts.find((a) => a.id === artifactId) || {};
        touchSession(sessionId, { artifacts: registry.artifacts });
        broadcast({ type: "artifact_update", sessionId, artifacts: registry.artifacts });
        return `\n\n==== 上游交付物 Manifest ====\n物料ID：${artifactId}\n物料状态：${artifactMeta.status || "ready"}\n质量问题：${(artifactMeta.issues || []).join(", ") || "无"}\n物料路径：${artifactPath}\n生产任务：${artifactMeta.producerTaskName || depId}\n生产任务ID：${depId}\n摘要：${artifactMeta.summary || "无"}\n你的使用要求：\n1. 先说明你如何使用该物料。\n2. 不要重复上游全文，基于它继续完成你的任务。\n3. 如果物料状态不是 ready，必须说明风险，并给出补救/继续方案。\n4. 如果物料不足，明确列出缺口。\n==== 上游交付物内容开始 ====\n${readFileSync(artifactPath, "utf-8")}\n==== 上游交付物内容结束 ====`;
      }
      return `\n\n==== 缺失上游交付物 ====\n物料ID：${artifactId}\n期望路径：${artifactPath}\n状态：missing\n请在输出中说明该缺失物料对任务的影响。`;
    }).filter(Boolean);
    if (depContents.length > 0) fullPrompt += depContents.join("");
  }

  touchSession(sessionId, {
    status: "running",
    tasks: (activeSessions.get(sessionId)?.tasks || []).map((t) => t.id === task.id ? { ...t, status: "running", collaborationStatus: shouldEnterDebugging ? "debugging" : t.collaborationStatus, model: effectiveModel, requestedModel, modelSource: modelSelection.modelSource, modelReason: modelSelection.modelReason, profileId: profile.id, profileName: profile.name, skills: equippedSkills, skillScope, currentTaskStage: task.currentTaskStage, taskStages: task.taskStages, needsPlanDiscussion: task.needsPlanDiscussion, startedAt: Date.now() } : t),
  });
  broadcast({ type: "task_start", sessionId, taskId: task.id, model: effectiveModel, requestedModel, modelSource: modelSelection.modelSource, modelReason: modelSelection.modelReason, profile, equippedSkills, skillScope });

  let output = "";
  try {
    output = await runPi({
      model: effectiveModel,
      prompt: fullPrompt,
      cwd: taskDir,
      systemPrompt: SUBAGENT_SYSTEM,
      onDelta: (delta) => broadcast({ type: "task_delta", sessionId, taskId: task.id, delta }),
      timeoutMs: 90000,
      noTools: false,
      sessionId,
      taskId: task.id,
    });

    let quality = evaluateArtifactOutput(output);
    if (quality.status !== "ready") {
      broadcast({ type: "task_delta", sessionId, taskId: task.id, delta: `\n\n[Guardian] 物料质量检查未通过：${quality.issues.join(", ")}。请求子Agent修订一次...\n` });
      const revisionPrompt = `${fullPrompt}\n\n你上一版输出如下：\n${output}\n\n质量检查问题：${quality.issues.join(", ")}\n请修订输出。要求：\n1. 保留有价值内容。\n2. 补齐缺失部分。\n3. 末尾必须包含「给下游的交付物」小节。\n4. 如果仍有缺失，请在该小节中明确说明。`;
      const revised = await runPi({
        model: effectiveModel,
        prompt: revisionPrompt,
        cwd: taskDir,
        systemPrompt: SUBAGENT_SYSTEM,
        onDelta: (delta) => broadcast({ type: "task_delta", sessionId, taskId: task.id, delta }),
        timeoutMs: 90000,
        noTools: false,
        sessionId,
        taskId: task.id,
      });
      if (revised?.trim()) {
        output = revised;
        quality = evaluateArtifactOutput(output);
      }
    }

    const confirmation = detectConfirmationRequest(output);

    // Save artifact + registry
    mkdirSync(artifactsDir, { recursive: true });
    const artifactFile = join(artifactsDir, `${task.id}-output.md`);
    writeFileSync(artifactFile, output);
    const registry = upsertArtifact(artifactsDir, {
      id: `${task.id}-output`,
      type: "markdown",
      status: quality.status,
      issues: quality.issues,
      path: artifactFile,
      producerTaskId: task.id,
      producerTaskName: task.name || task.id,
      size: output.length,
      summary: output.slice(0, 240),
    });

    if (profile.id === "memory-curator") {
      recordProjectSummary(sessionId, task.id || "memory-curator", task.name || task.id || "项目记忆摘要", output, { sourceTaskId: task.id, profileId: profile.id });
    }

    const updatedFlowState = updateFlowDeliverablesFromArtifacts(activeSessions.get(sessionId)?.flowState, registry.artifacts);
    touchSession(sessionId, {
      artifacts: registry.artifacts,
      flowState: updatedFlowState,
      tasks: (activeSessions.get(sessionId)?.tasks || []).map((t) => t.id === task.id ? { ...t, status: "completed", collaborationStatus: "ready_for_review", model: effectiveModel, requestedModel, modelSource: modelSelection.modelSource, modelReason: modelSelection.modelReason, profileId: profile.id, profileName: profile.name, skills: equippedSkills, skillScope, output, completedAt: Date.now(), artifactId: `${task.id}-output` } : t),
    });
    const runEndedAt = Date.now();
    recordAgentProfileResult(profile.id, task, quality.status === "ready", {
      modelUsed: effectiveModel,
      equippedSkills,
      skillScope,
      startedAt: runStartedAt,
      endedAt: runEndedAt,
      durationMs: runEndedAt - runStartedAt,
      status: quality.status === "ready" ? "completed" : "incomplete",
      artifactId: `${task.id}-output`,
      qualityStatus: quality.status,
      issues: quality.issues,
    });
    broadcast({ type: "artifact_update", sessionId, artifacts: registry.artifacts });

    if (confirmation) {
      const pendingConfirmation = {
        id: randomUUID(),
        taskId: task.id,
        taskName: task.name || task.id,
        question: confirmation.question,
        options: confirmation.options,
        recommendation: confirmation.recommendation,
        raw: confirmation.raw,
        createdAt: Date.now(),
      };
      touchSession(sessionId, {
        status: "waiting_confirmation",
        pendingConfirmation,
        tasks: (activeSessions.get(sessionId)?.tasks || []).map((t) => t.id === task.id ? { ...t, status: "waiting_confirmation", output, completedAt: Date.now(), artifactId: `${task.id}-output`, pendingConfirmation } : t),
      });
      broadcast({ type: "confirmation_required", sessionId, taskId: task.id, confirmation: pendingConfirmation, output });
      broadcastLeadProgress(sessionId, `${task.name || task.id} 需要你确认后才能继续：${confirmation.question}`, { stage: "user_confirmation", status: "needs_user" });
      return { success: true, output, profileId: profile.id, needsConfirmation: true, confirmation: pendingConfirmation };
    }

    broadcast({ type: "task_done", sessionId, taskId: task.id, output, artifactId: `${task.id}-output`, profile });
    broadcastLeadProgress(sessionId, `${task.name || task.id} 已完成，Lead 已收到子任务结果。`, { stage: "execution", status: "running" });
    return { success: true, output, profileId: profile.id };
  } catch (err) {
    const runEndedAt = Date.now();
    recordAgentProfileResult(profile.id, task, false, {
      modelUsed: effectiveModel,
      equippedSkills,
      skillScope,
      startedAt: runStartedAt,
      endedAt: runEndedAt,
      durationMs: runEndedAt - runStartedAt,
      status: String(err.message || "").includes("timeout") ? "timeout" : "error",
      error: err.message,
    });
    recordSwitch({ from: effectiveModel, to: "fallback", reason: "failure", taskId: task.id });
    guardianState.status = "intervened";
    guardianState.interventionCount++;
    touchSession(sessionId, {
      tasks: (activeSessions.get(sessionId)?.tasks || []).map((t) => t.id === task.id ? { ...t, status: "error", error: err.message } : t),
    });
    broadcast({ type: "task_error", sessionId, taskId: task.id, error: err.message });
    broadcastLeadProgress(sessionId, `${task.name || task.id} 遇到阻塞：${err.message}`, { stage: "execution", status: "blocked" });
    return { success: false, output: "", error: err.message };
  }
}

// ── DAG runner: respects task dependencies ─────────────────────────────────
async function runDAG(tasks, sessionId, artifactsDir) {
  const completed = new Set(
    tasks.filter((t) => existsSync(join(artifactsDir, `${t.id}-output.md`))).map((t) => t.id)
  );
  const results = {};

  while (completed.size < tasks.length) {
    // Find tasks whose deps are all done
    const ready = tasks.filter(
      (t) => !completed.has(t.id) && (t.deps || []).every((d) => completed.has(d))
    );

    if (ready.length === 0) {
      throw new Error("DAG deadlock: circular dependencies or missing tasks");
    }

    // Run ready tasks in parallel
    const batchResults = await Promise.all(
      ready.map((t) => executeTask(t, sessionId, artifactsDir))
    );

    ready.forEach((t, i) => {
      completed.add(t.id);
      results[t.id] = batchResults[i];
    });

    const pause = batchResults.find((r) => r?.needsConfirmation);
    if (pause) {
      const err = new Error("DAG_PAUSED_FOR_CONFIRMATION");
      err.code = "DAG_PAUSED_FOR_CONFIRMATION";
      err.confirmation = pause.confirmation;
      throw err;
    }
  }

  return results;
}

async function synthesizeAndFinish(sessionId, artifactsDir, plan) {
  let registryBeforeSynthesis = readArtifactRegistry(artifactsDir);
  for (const t of plan.tasks || []) {
    registryBeforeSynthesis = recordArtifactConsumer(artifactsDir, `${t.id}-output`, LEAD_TASK_ID);
  }
  const flowBeforeReview = updateFlowDeliverablesFromArtifacts(activeSessions.get(sessionId)?.flowState, registryBeforeSynthesis.artifacts);
  touchSession(sessionId, { status: "synthesizing", pendingConfirmation: null, artifacts: registryBeforeSynthesis.artifacts, flowState: flowBeforeReview });
  broadcast({ type: "artifact_update", sessionId, artifacts: registryBeforeSynthesis.artifacts });
  broadcast({ type: "synthesizing", sessionId });
  broadcastLeadProgress(sessionId, "所有子任务已跑完，Lead 正在汇总并准备最终结论。", { stage: "synthesizing", status: "running" });

  let review = await leadReviewArtifacts(sessionId, artifactsDir, plan);
  if (Array.isArray(review?.revisionTasks) && review.revisionTasks.length > 0) {
    const revisionResult = await runLeadDirectedRevision(sessionId, artifactsDir, plan, review);
    review = revisionResult.review;
  }
  const finalOutput = await leadFinalReport(sessionId, artifactsDir, plan, review);
  guardianState.status = "idle";
  const finalArtifactFile = join(artifactsDir, "final-output.md");
  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(finalArtifactFile, finalOutput);
  const finalRegistry = upsertArtifact(artifactsDir, {
    id: "final-output",
    type: "markdown",
    status: "ready",
    path: finalArtifactFile,
    producerTaskId: LEAD_TASK_ID,
    producerTaskName: "Lead Agent / 主模型",
    size: finalOutput.length,
    summary: finalOutput.slice(0, 240),
  });

  const finalFlowState = updateFlowDeliverablesFromArtifacts(activeSessions.get(sessionId)?.flowState, finalRegistry.artifacts);
  touchSession(sessionId, { status: "done", output: finalOutput, artifacts: finalRegistry.artifacts, flowState: finalFlowState });
  updateLeadTask(sessionId, { status: "completed", output: finalOutput, artifactId: "final-output" });
  broadcast({ type: "artifact_update", sessionId, artifacts: finalRegistry.artifacts });
  broadcastLeadProgress(sessionId, "最终结果已整理完成。", { stage: "done", status: "done" });
  broadcast({ type: "session_done", sessionId, output: finalOutput, tasks: ensureLeadTask(plan.tasks || []) });
  return finalOutput;
}

// ── Main orchestration endpoint ────────────────────────────────────────────
app.post("/api/orchestrate", async (req, res) => {
  const { input, sessionId: existingSessionId, cwd } = req.body;
  console.log(`[orchestrate] received: ${String(input).slice(0, 80)}`);
  if (!input) return res.status(400).json({ error: "input required" });

  const sessionId = existingSessionId || randomUUID();
  if (existingSessionId && activeSessions.has(existingSessionId) && isCoachingIntent(input)) {
    res.json({ sessionId, status: "coaching" });
    runUserTriggeredCoaching(existingSessionId, input).catch((err) => {
      touchSession(existingSessionId, { status: "error", error: err.message, coaching: { status: "error", feedback: input, error: err.message, completedAt: Date.now() } });
      broadcast({ type: "coaching_error", sessionId: existingSessionId, error: err.message });
      broadcast({ type: "session_error", sessionId: existingSessionId, error: err.message });
    });
    return;
  }
  const artifactsDir = join(WORKSPACE, sessionId, "artifacts");

  const projectCwd = normalizeProjectCwd(cwd);
  const projectId = projectIdFromCwd(projectCwd);
  const initialFlowState = createFlowState(input);
  touchSession(sessionId, { input, cwd: projectCwd, projectId, status: "started", tasks: [], flowState: initialFlowState, output: "", error: null, startedAt: Date.now() });
  broadcast({ type: "session_start", sessionId, input });
  console.log(`[orchestrate] session_start: ${sessionId}`);

  try {
    if (isVagueProjectStart(input)) {
      const output = "可以开始。为了让 Multi-Agent 正确拆任务，我需要先确认 3 个信息：\n\n1. 这个复杂项目的最终目标是什么？\n2. 当前已有资料/代码/约束在哪里？\n3. 你希望先产出方案，还是直接进入实施？\n\n你可以用一句话回答，例如：\n「我要做一个多Agent工作流系统，已有 pi-backend 和 pi-frontend，先补齐 Guardian 路由和前端监控。」";
      touchSession(sessionId, { status: "done", output, tasks: [] });
      broadcast({ type: "session_done", sessionId, output, tasks: [] });
      res.json({ sessionId, status: "done", output, tasks: [] });
      return;
    }

    // Step 1: Lead Agent plans. Guardian remains as fallback/safety observer.
    let plan;
    try {
      updateLeadTask(sessionId, { status: "pending" });
      touchSession(sessionId, { tasks: ensureLeadTask([]) });
      broadcast({ type: "tasks_planned", sessionId, tasks: ensureLeadTask([]) });
      plan = await leadPlan(input, sessionId);
      guardianState.status = "watching";
      guardianState.lastCheck = Date.now();
      guardianState.lastPlan = plan;
    } catch (leadErr) {
      console.error("[LeadPlan] Failed, fallback to Guardian/local plan:", leadErr.message);
      guardianState.lastError = leadErr.message;
      if (activeSessions.get(sessionId)?.userClosedMultiagent) {
        plan = { single: true, reason: "用户已手动关闭 multiagent 开关，Guardian 跳过自动操作", tasks: [] };
      } else {
        plan = shouldUseLocalMultiAgentPlan(input) ? localFallbackPlan(input) : await guardianAnalyze(input, sessionId);
      }
    }
    console.log(`[orchestrate] lead plan: ${JSON.stringify(plan).slice(0, 300)}`);

    if (plan.single || !plan.tasks?.length) {
      if (String(plan.reason || "").includes("direct clarification")) {
        const output = "我需要先确认项目目标和边界，才能进行多Agent拆分。请补充：\n\n1. 最终要做成什么？\n2. 当前有哪些已有代码/资料？\n3. 你希望先做方案，还是直接修改代码？";
        touchSession(sessionId, { status: "done", output, tasks: [] });
        broadcast({ type: "session_done", sessionId, output, tasks: [] });
        if (!res.headersSent) res.json({ sessionId, status: "done", output, tasks: [] });
        return;
      }
      // Simple: run directly with smart model
      const cwd = join(WORKSPACE, sessionId, "single");
      let output = "";
      await runPi({
        model: "opencore-go/deepseek-v4-flash",
        prompt: input,
        cwd,
        onDelta: (d) => broadcast({ type: "main_delta", sessionId, delta: d }),
        onDone: (text) => { output = text; },
        timeoutMs: 45000,
        noTools: true,
      });
      touchSession(sessionId, { status: "done", output, tasks: [] });
      broadcast({ type: "session_done", sessionId, output, tasks: [] });
      if (!res.headersSent) res.json({ sessionId, status: "done", output, tasks: [] });
      return;
    }

    // Step 2: Lead Agent publishes delegation plan, then run task DAG in parallel
    const flowWithDeliverables = {
      ...applyPlanKnowledgeToFlowState(applyLeadGeneratedStages(activeSessions.get(sessionId)?.flowState || createFlowState(input), plan), plan),
      stageDeliverables: deriveDeliverablesFromPlan(plan),
      gateStatus: "blocked",
    };
    touchSession(sessionId, { flowState: flowWithDeliverables });
    const visibleTasks = ensureLeadTask(plan.tasks.map((t) => ({ ...t, status: "pending" })));
    touchSession(sessionId, { status: "planned", tasks: visibleTasks, plan });
    broadcast({ type: "tasks_planned", sessionId, tasks: visibleTasks, flowState: flowWithDeliverables });
    broadcast({ type: "task_start", sessionId, taskId: LEAD_TASK_ID, model: LEAD_MODEL });
    updateLeadTask(sessionId, { status: "running", output: "正在规划和派发子任务..." });
    broadcast({ type: "task_delta", sessionId, taskId: LEAD_TASK_ID, delta: `Lead Agent 已生成任务计划：${plan.tasks.map((t) => t.name || t.id).join("、")}\n` });
    updateLeadTask(sessionId, { status: "completed", output: `已派发 ${plan.tasks.length} 个子任务：${plan.tasks.map((t) => t.name || t.id).join("、")}` });
    broadcast({ type: "task_done", sessionId, taskId: LEAD_TASK_ID, output: `已派发 ${plan.tasks.length} 个子任务。` });
    if (!res.headersSent) res.json({ sessionId, status: "planned", tasks: visibleTasks });
    console.log(`[orchestrate] tasks_planned: ${plan.tasks.length}`);
    try {
      await runDAG(plan.tasks, sessionId, artifactsDir);
    } catch (dagErr) {
      if (dagErr.code === "DAG_PAUSED_FOR_CONFIRMATION") {
        touchSession(sessionId, { status: "waiting_confirmation", plan });
        broadcast({ type: "session_paused", sessionId, confirmation: dagErr.confirmation });
        return;
      }
      throw dagErr;
    }

    // Step 3: Lead Agent reviews artifacts and produces final report
    await synthesizeAndFinish(sessionId, artifactsDir, plan);
  } catch (err) {
    console.error("[Orchestrate] Error:", err);
    guardianState.status = "intervened";
    guardianState.interventionCount++;
    guardianState.lastError = err.message;
    touchSession(sessionId, { status: "error", error: err.message });
    broadcast({ type: "session_error", sessionId, error: err.message });
  }
});

// ── Monitor endpoint (for frontend polling fallback) ───────────────────────
app.get("/api/monitor", (_req, res) => {
  res.json(buildMonitorPayload());
});

app.get("/api/guardian", (_req, res) => {
  res.json({ ok: true, guardian: guardianState, routeHealth: buildMonitorPayload().routeHealth });
});

app.post("/api/guardian/decide", async (req, res) => {
  const { input, sessionId = randomUUID() } = req.body || {};
  if (!input) return res.status(400).json({ error: "input required" });
  const text = String(input || "");
  try {
    if (activeSessions.get(sessionId)?.userClosedMultiagent) {
      return res.json({
        sessionId,
        complexity: "L0_chat",
        intentConfirmed: true,
        shouldUseMultiAgent: false,
        requiresClarification: false,
        clarificationQuestion: "",
        reason: "用户已手动关闭 multiagent 开关，Guardian 跳过自动操作",
        handoffToLead: false,
        guardianModel: guardianState.model,
      });
    }
    if (shouldUseLocalMultiAgentPlan(text)) {
      return res.json({
        sessionId,
        complexity: "L2_complex",
        intentConfirmed: true,
        shouldUseMultiAgent: true,
        requiresClarification: false,
        clarificationQuestion: "",
        reason: "命中多Agent/前后端/工作流等复杂项目关键词",
        handoffToLead: true,
        guardianModel: guardianState.model,
      });
    }
    if (isVagueProjectStart(text)) {
      return res.json({
        sessionId,
        complexity: "L2_complex",
        intentConfirmed: false,
        shouldUseMultiAgent: false,
        requiresClarification: true,
        clarificationQuestion: "我需要先确认两个点：1. 最终目标要做成什么？2. 你希望先出方案，还是直接进入实施？",
        reason: "复杂项目启动但目标边界不清",
        handoffToLead: false,
        guardianModel: guardianState.model,
      });
    }

    const systemPrompt = `你是 Guardian / Safety Officer，模型 deepseek-v4-flash。你只做入口判断和意图确认，不做深度规划。内部使用轻量五问框架识别用户意图、主线和是否需要澄清。只返回 JSON：{ "complexity":"L0_chat|L1_simple|L2_complex", "intentConfirmed":true, "shouldUseMultiAgent":false, "requiresClarification":false, "clarificationQuestion":"", "reason":"", "handoffToLead":false }`;
    const raw = await runPi({
      model: guardianState.model,
      cwd: join(WORKSPACE, sessionId, "guardian-decide"),
      noTools: true,
      timeoutMs: 3000,
      systemPrompt,
      prompt: `用户消息：${text}\n\n判断是否应自动开启 Multi-Agent。`,
    });
    const decision = extractJsonObject(raw);
    res.json({ sessionId, guardianModel: guardianState.model, ...decision });
  } catch (err) {
    const complexity = classifyComplexity(text);
    res.json({
      sessionId,
      complexity,
      intentConfirmed: complexity !== "L2_complex",
      shouldUseMultiAgent: complexity === "L2_complex",
      requiresClarification: false,
      clarificationQuestion: "",
      reason: `Guardian fallback: ${err.message}`,
      handoffToLead: complexity === "L2_complex",
      guardianModel: guardianState.model,
    });
  }
});

app.post("/api/guardian/route", async (req, res) => {
  const { input, sessionId = randomUUID() } = req.body || {};
  if (!input) return res.status(400).json({ error: "input required" });
  try {
    if (activeSessions.get(sessionId)?.userClosedMultiagent) {
      const plan = { single: true, reason: "用户已手动关闭 multiagent 开关，Guardian 跳过自动操作", tasks: [] };
      res.json({ sessionId, plan, guardian: guardianState, skipped: true });
      return;
    }
    const plan = shouldUseLocalMultiAgentPlan(input) ? localFallbackPlan(input) : await guardianAnalyze(input, sessionId);
    guardianState.lastPlan = plan;
    res.json({ sessionId, plan, guardian: guardianState });
  } catch (err) {
    guardianState.status = "intervened";
    guardianState.interventionCount++;
    guardianState.lastError = err.message;
    res.status(500).json({ error: err.message, guardian: guardianState });
  }
});

// ── User-triggered coaching / confirmation / pause-resume ────────────────
app.post("/api/orchestrate/:sessionId/coach", async (req, res) => {
  const { sessionId } = req.params;
  const { feedback = "", taskId, skills } = req.body || {};
  if (!activeSessions.has(sessionId)) return res.status(404).json({ error: "session not found" });
  if (!String(feedback || "").trim()) return res.status(400).json({ error: "feedback required" });
  res.json({ ok: true, sessionId, status: "coaching" });
  runUserTriggeredCoaching(sessionId, feedback, { taskId, skills }).catch((err) => {
    touchSession(sessionId, { status: "error", error: err.message, coaching: { status: "error", feedback, error: err.message, completedAt: Date.now() } });
    broadcast({ type: "coaching_error", sessionId, error: err.message });
    broadcast({ type: "session_error", sessionId, error: err.message });
  });
});

app.post("/api/orchestrate/:sessionId/confirm", async (req, res) => {
  const { sessionId } = req.params;
  const { decision = "confirm", note = "" } = req.body || {};
  const session = activeSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: "session not found" });
  if (session.status !== "waiting_confirmation" || !session.pendingConfirmation) {
    return res.status(409).json({ error: "session is not waiting for confirmation" });
  }
  const plan = session.plan;
  if (!plan?.tasks?.length) return res.status(409).json({ error: "missing plan for resume" });

  const artifactsDir = join(WORKSPACE, sessionId, "artifacts");
  const confirmation = session.pendingConfirmation;
  touchSession(sessionId, {
    status: "running",
    pendingConfirmation: null,
    confirmationHistory: [
      ...(session.confirmationHistory || []),
      { ...confirmation, decision, note, resolvedAt: Date.now() },
    ],
    tasks: (session.tasks || []).map((t) => t.id === confirmation.taskId ? { ...t, status: "completed", confirmationDecision: decision, confirmationNote: note } : t),
  });
  broadcast({ type: "confirmation_resolved", sessionId, confirmationId: confirmation.id, decision, note });
  res.json({ ok: true, sessionId, status: "running" });

  try {
    if (String(decision).toLowerCase() === "stop") {
      const output = `已根据用户确认停止 Multi-Agent DAG。\n\n停止点：${confirmation.taskName}\n用户说明：${note || "无"}`;
      touchSession(sessionId, { status: "done", output });
      broadcast({ type: "session_done", sessionId, output, tasks: session.tasks || [] });
      return;
    }
    await runDAG(plan.tasks, sessionId, artifactsDir);
    await synthesizeAndFinish(sessionId, artifactsDir, plan);
  } catch (err) {
    if (err.code === "DAG_PAUSED_FOR_CONFIRMATION") {
      touchSession(sessionId, { status: "waiting_confirmation", pendingConfirmation: err.confirmation });
      broadcast({ type: "session_paused", sessionId, confirmation: err.confirmation });
      return;
    }
    touchSession(sessionId, { status: "error", error: err.message });
    broadcast({ type: "session_error", sessionId, error: err.message });
  }
});

// ── Abort orchestration ───────────────────────────────────────────────────
app.post("/api/orchestrate/:sessionId/abort", (req, res) => {
  const count = abortSessionProcesses(req.params.sessionId, req.body?.reason || "user turned off multi-agent");
  touchSession(req.params.sessionId, { userClosedMultiagent: true });
  res.json({ ok: true, killed: count });
});

// ── Stop all running sub-agent processes across all sessions ──────────────
app.post("/api/multi-agent/stop-all", (_req, res) => {
  let stoppedAgents = 0;
  const sessionsAffected = [];
  for (const [sessionId, procSet] of runningProcesses) {
    for (const entry of [...procSet]) {
      try { entry.proc.kill("SIGKILL"); stoppedAgents++; } catch {}
    }
    sessionsAffected.push(sessionId);
    touchSession(sessionId, {
      userClosedMultiagent: true,
      status: "aborted",
      error: "stopped-all",
      tasks: (activeSessions.get(sessionId)?.tasks || []).map((t) =>
        t.status === "running" || t.status === "pending" || t.status === "waiting_for_dependency"
          ? { ...t, status: "aborted" }
          : t
      ),
    });
  }
  runningProcesses.clear();
  guardianState.status = "idle";
  broadcast({ type: "stop_all", reason: "manual-stop-all" });
  res.status(200).json({
    ok: true,
    stoppedAgents,
    sessionsAffected,
    sessionsCount: sessionsAffected.length,
  });
});

// ── Project memory / skills registry ──────────────────────────────────────
app.get("/api/project-memory/:sessionId", (req, res) => {
  const session = activeSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "session not found" });
  const paths = getSessionMemoryPaths(session);
  const snapshot = readProjectMemorySnapshot(session);
  res.json({
    projectId: paths.projectId,
    cwd: paths.cwd,
    paths: {
      context: paths.context,
      progress: paths.progress,
      bugs: paths.bugs,
      summariesDir: paths.summariesDir,
      summaryIndex: paths.summaryIndex,
    },
    snapshot,
  });
});

app.post("/api/project-memory/:sessionId/clear-summaries", (req, res) => {
  const session = activeSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "session not found" });
  const paths = getSessionMemoryPaths(session);
  const index = readSummaryIndex(paths.summaryIndex);
  for (const item of index) {
    try {
      if (item.path && existsSync(item.path)) unlinkSync(item.path);
    } catch {}
  }
  writeSummaryIndex(paths.summaryIndex, []);
  res.json({ ok: true, projectId: paths.projectId });
});

app.get("/api/skills", (_req, res) => {
  try {
    const dirs = readdirSync(SKILL_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory());
    const skills = dirs.map((d) => {
      const id = d.name;
      const file = join(SKILL_ROOT, id, "SKILL.md");
      let description = "";
      if (existsSync(file)) {
        const text = readFileSync(file, "utf-8");
        description = text.split("\n").find((line) => line.trim() && !line.startsWith("#"))?.slice(0, 180) || "";
      }
      return { id, name: id, description };
    });
    res.json({ skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Agent profiles (persistent sub-agent experience/skills) ───────────────
app.get("/api/agent-profiles", (_req, res) => {
  res.json({ profiles: Object.values(loadAgentProfiles()) });
});

app.post("/api/session/:sessionId/promote-profile", (req, res) => {
  try {
    const profile = createProfileFromSession(req.params.sessionId, {
      name: req.body?.name,
      description: req.body?.description,
      sessionName: req.body?.sessionName,
      firstMessage: req.body?.firstMessage,
      cwd: req.body?.cwd,
      model: req.body?.model,
    });
    broadcast({ type: "profile_promoted", sessionId: req.params.sessionId, profile });
    res.json({ ok: true, profile });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/workflows", (_req, res) => {
  res.json({ workflows: Object.values(loadWorkflows()) });
});

app.post("/api/workflows", (req, res) => {
  const workflows = loadWorkflows();
  const body = req.body || {};
  const name = cleanInlineText(body.name || "New Workflow", 80);
  const id = makeUniqueProfileId(slugProfileId(name), workflows);
  const workflow = {
    id,
    name,
    description: cleanInlineText(body.description, 400),
    leadProfileId: body.leadProfileId || "lead-agent",
    reviewPolicy: body.reviewPolicy === "lead_only" ? "lead_only" : "lead_plus_reviewer",
    sourceSessionId: body.sourceSessionId || "",
    cwd: body.cwd || "",
    projectId: body.projectId || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tasks: Array.isArray(body.tasks) ? body.tasks : [],
  };
  workflows[id] = workflow;
  saveWorkflows(workflows);
  res.json({ ok: true, workflow });
});

app.post("/api/workflows/from-session/:sessionId", (req, res) => {
  try {
    const workflow = createWorkflowFromSession(req.params.sessionId, {
      name: req.body?.name,
      description: req.body?.description,
    });
    res.json({ ok: true, workflow });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.patch("/api/workflows/:workflowId", (req, res) => {
  const workflows = loadWorkflows();
  const workflow = workflows[req.params.workflowId];
  if (!workflow) return res.status(404).json({ error: "workflow not found" });
  workflows[req.params.workflowId] = {
    ...workflow,
    ...req.body,
    id: workflow.id,
    updatedAt: Date.now(),
  };
  saveWorkflows(workflows);
  res.json({ ok: true, workflow: workflows[req.params.workflowId] });
});

app.delete("/api/workflows/:workflowId", (req, res) => {
  const workflows = loadWorkflows();
  if (!workflows[req.params.workflowId]) return res.status(404).json({ error: "workflow not found" });
  delete workflows[req.params.workflowId];
  saveWorkflows(workflows);
  res.json({ ok: true });
});

app.post("/api/workflows/:workflowId/run", async (req, res) => {
  const workflows = loadWorkflows();
  const workflow = workflows[req.params.workflowId];
  if (!workflow) return res.status(404).json({ error: "workflow not found" });
  const input = String(req.body?.input || workflow.description || workflow.name || "运行工作流").trim();
  const sessionId = req.body?.sessionId || randomUUID();
  const projectCwd = normalizeProjectCwd(req.body?.cwd || workflow.cwd || "");
  const projectId = projectIdFromCwd(projectCwd);
  const tasks = (workflow.tasks || []).map((task, index) => ({
    id: task.id || `wf-${index + 1}`,
    name: task.name || `Workflow Task ${index + 1}`,
    profileId: task.profileId || "general-executor",
    skills: Array.isArray(task.skills) ? task.skills : [],
    model: task.model || "opencore-go/deepseek-v4-flash",
    modelSource: task.modelSource,
    modelReason: task.modelReason,
    prompt: task.prompt ? `本次工作目标：${input}\n\n${task.prompt}` : `本次工作目标：${input}\n\n请执行工作流任务：${task.name || task.id}`,
    deps: Array.isArray(task.deps) ? task.deps : [],
  }));
  const plan = {
    summary: workflow.description || workflow.name,
    reviewPolicy: workflow.reviewPolicy === "lead_only" ? "lead_only" : "lead_plus_reviewer",
    tasks,
    finalReportInstruction: workflow.description || workflow.name,
  };
  const artifactsDir = join(WORKSPACE, sessionId, "artifacts");
  const initialFlowState = createFlowState(input);
  touchSession(sessionId, { input, cwd: projectCwd, projectId, status: "started", tasks: [], flowState: initialFlowState, output: "", error: null, startedAt: Date.now(), plan });
  broadcast({ type: "session_start", sessionId, input });
  updateLeadTask(sessionId, { status: "pending" });
  const visibleTasks = ensureLeadTask(tasks.map((t) => ({ ...t, status: "pending" })));
  touchSession(sessionId, { tasks: visibleTasks });
  broadcast({ type: "tasks_planned", sessionId, tasks: visibleTasks, flowState: initialFlowState });
  res.json({ ok: true, sessionId, status: "planned", tasks: visibleTasks });
  runDAG(tasks, sessionId, artifactsDir)
    .then(() => synthesizeAndFinish(sessionId, artifactsDir, plan))
    .catch((err) => {
      touchSession(sessionId, { status: "error", error: err.message });
      broadcast({ type: "session_error", sessionId, error: err.message });
    });
});

app.post("/api/agent-profiles/:profileId", (req, res) => {
  const profiles = loadAgentProfiles();
  const profile = profiles[req.params.profileId];
  if (!profile) return res.status(404).json({ error: "profile not found" });
  profiles[req.params.profileId] = { ...profile, ...req.body, id: profile.id };
  saveAgentProfiles(profiles);
  res.json({ ok: true, profile: profiles[req.params.profileId] });
});

// ── Task intervention ─────────────────────────────────────────────────────
app.post("/api/task/:sessionId/:taskId/abort", (req, res) => {
  const { sessionId, taskId } = req.params;
  const killed = abortTaskProcesses(sessionId, taskId, req.body?.reason || "user aborted task");
  res.json({ ok: true, killed });
});

app.post("/api/task/:sessionId/:taskId/pause", (req, res) => {
  const { sessionId, taskId } = req.params;
  const killed = abortTaskProcesses(sessionId, taskId, req.body?.reason || "task paused");
  touchSession(sessionId, {
    tasks: (activeSessions.get(sessionId)?.tasks || []).map((t) => t.id === taskId ? { ...t, status: "paused", pausedAt: Date.now() } : t),
  });
  broadcast({ type: "task_paused", sessionId, taskId });
  res.json({ ok: true, killed });
});

app.post("/api/task/:sessionId/:taskId/resume", async (req, res) => {
  req.url = req.url.replace(/\/resume$/, "/rerun");
  const { sessionId, taskId } = req.params;
  const state = activeSessions.get(sessionId);
  const task = state?.tasks?.find((t) => t.id === taskId);
  if (!state || !task) return res.status(404).json({ error: "Task/session not found" });
  const artifactsDir = join(WORKSPACE, sessionId, "artifacts");
  const rerunTask = { ...task, status: "queued", output: undefined, error: undefined };
  touchSession(sessionId, { status: "running", tasks: state.tasks.map((t) => t.id === taskId ? { ...rerunTask, status: "queued" } : t) });
  broadcast({ type: "task_resumed", sessionId, taskId });
  executeTask(rerunTask, sessionId, artifactsDir).catch((err) => broadcast({ type: "task_error", sessionId, taskId, error: err.message }));
  res.json({ ok: true });
});

app.post("/api/task/:sessionId/:taskId/rerun", async (req, res) => {
  const { sessionId, taskId } = req.params;
  const state = activeSessions.get(sessionId);
  const task = state?.tasks?.find((t) => t.id === taskId);
  if (!state || !task) return res.status(404).json({ error: "Task/session not found" });
  const modelOverride = req.body?.model;
  const skillsOverride = Array.isArray(req.body?.skills) ? req.body.skills : undefined;
  abortTaskProcesses(sessionId, taskId, "rerun requested");
  const artifactsDir = join(WORKSPACE, sessionId, "artifacts");
  const promptAppend = req.body?.promptAppend ? `\n${req.body.promptAppend}` : "";
  const rerunTask = { ...task, status: "queued", output: undefined, error: undefined, modelOverride, skillsOverride, promptAppend };
  touchSession(sessionId, {
    status: "running",
    tasks: state.tasks.map((t) => t.id === taskId ? { ...rerunTask, status: "queued", model: modelOverride || t.model, skills: skillsOverride || t.skills } : t),
  });
  broadcast({ type: "task_rerun", sessionId, taskId, model: modelOverride, skills: skillsOverride });
  executeTask(rerunTask, sessionId, artifactsDir).catch((err) => {
    broadcast({ type: "task_error", sessionId, taskId, error: err.message });
  });
  res.json({ ok: true });
});

app.post("/api/task/:sessionId/:taskId/save-experience", (req, res) => {
  const { sessionId, taskId } = req.params;
  const state = activeSessions.get(sessionId);
  const task = state?.tasks?.find((t) => t.id === taskId);
  if (!state || !task) return res.status(404).json({ error: "Task/session not found" });
  const profiles = loadAgentProfiles();
  const profileId = task.profileId || selectAgentProfile(task).id;
  const profile = profiles[profileId];
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  const lesson = String(req.body?.lesson || "").trim();
  const skills = Array.isArray(req.body?.skills) ? req.body.skills : [];
  profile.savedExperiences ||= [];
  profile.savedExperiences = [{
    taskId,
    taskName: task.name || taskId,
    lesson,
    skills,
    model: task.model,
    artifactId: task.artifactId,
    debugValidated: true,
    savedAt: Date.now(),
  }, ...profile.savedExperiences].slice(0, 50);
  profile.skills = Array.from(new Set([...(profile.skills || []), ...skills]));
  if (lesson) {
    profile.systemPromptPatch = `${profile.systemPromptPatch || ""}\n\n经验沉淀：${lesson}`.trim();
  }
  saveAgentProfiles(profiles);
  broadcast({ type: "profile_experience_saved", sessionId, taskId, profileId, profile });
  res.json({ ok: true, profile });
});

app.post("/api/task/:sessionId/:taskId/promote-profile", (req, res) => {
  const { sessionId, taskId } = req.params;
  const state = activeSessions.get(sessionId);
  const task = state?.tasks?.find((t) => t.id === taskId);
  if (!state || !task) return res.status(404).json({ error: "Task/session not found" });
  const profile = createProfileFromTask(sessionId, task, {
    name: req.body?.name,
    description: req.body?.description,
  });
  broadcast({ type: "profile_promoted", sessionId, taskId, profile });
  res.json({ ok: true, profile });
});

app.post("/api/task/:sessionId/:taskId/promote-skills", (req, res) => {
  try {
    const { profileId, profile, skills } = promoteTaskSkillsIntoProfile(req.params.sessionId, req.params.taskId, Array.isArray(req.body?.skills) ? req.body.skills : [], req.body?.source === "lead" ? "lead" : "user");
    res.json({ ok: true, profileId, profile, skills });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/task/:sessionId/:taskId/switch-model", async (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: "model required" });
  recordSwitch({ from: "user-selected", to: model, reason: "user-intervention-rerun", taskId: req.params.taskId });
  req.body = { ...req.body, model };
  const state = activeSessions.get(req.params.sessionId);
  const task = state?.tasks?.find((t) => t.id === req.params.taskId);
  if (!state || !task) return res.status(404).json({ error: "Task/session not found" });
  abortTaskProcesses(req.params.sessionId, req.params.taskId, "model switch requested");
  const artifactsDir = join(WORKSPACE, req.params.sessionId, "artifacts");
  const rerunTask = { ...task, modelOverride: model, status: "queued", output: undefined, error: undefined };
  touchSession(req.params.sessionId, {
    status: "running",
    tasks: state.tasks.map((t) => t.id === req.params.taskId ? { ...rerunTask, model, status: "queued" } : t),
  });
  broadcast({ type: "model_switch", sessionId: req.params.sessionId, taskId: req.params.taskId, model });
  executeTask(rerunTask, req.params.sessionId, artifactsDir).catch((err) => {
    broadcast({ type: "task_error", sessionId: req.params.sessionId, taskId: req.params.taskId, error: err.message });
  });
  res.json({ ok: true });
});

// Backward-compatible old endpoint: broadcast only if sessionId is unknown.
app.post("/api/agent/:taskId/switch-model", (req, res) => {
  const { model } = req.body;
  recordSwitch({ from: "user-selected", to: model, reason: "guardian-intervention", taskId: req.params.taskId });
  broadcast({ type: "model_switch", taskId: req.params.taskId, model });
  res.json({ ok: true });
});

// ── Start server + WebSocket ───────────────────────────────────────────────
const server = app.listen(PORT, () =>
  console.log(`✅ Multi-agent server: http://localhost:${PORT}`)
);

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
});

mkdirSync(WORKSPACE, { recursive: true });
