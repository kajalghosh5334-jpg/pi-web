import { mkdtemp, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WORKFLOW_AI_TIMEOUT_MS = 9000;
const WORKFLOW_AI_MODEL = process.env.WORKFLOW_AI_MODEL || process.env.FLASH_MODEL || "gpt-5-nano";

type WorkflowAiEvent = "entered" | "message" | "purpose-received" | "material-received";

type WorkflowAiState = {
  workflow?: {
    id?: string;
    name?: string;
    description?: string;
    domain?: string;
    templateType?: string;
  };
  isBlank?: boolean;
  hasRunnableChain?: boolean;
  nextField?: { id?: string; label?: string; required?: boolean } | null;
  missingRequiredInput?: Array<{ id?: string; label?: string; required?: boolean }>;
  materialReceived?: { fieldLabel?: string; valuePreview?: string };
  purpose?: string;
};

function topicForText(text: string) {
  const normalized = text.toLowerCase();
  if (/skill|技能|fixed|configurable|配置/.test(normalized)) return "skills.md";
  if (/train|训练|强模型|弱模型|示范|学习|特异|专项/.test(normalized)) return "training.md";
  if (/推荐|生成|微调|有效路径|candidate|chain|combo|组合|穷举|定制/.test(normalized)) return "tuning-recipes.md";
  if (/通用节点|功能节点|节点体系|模板|template|fetch|gather|standardize|classify|extract|generate|review|monitor|搭建/.test(normalized)) return "common-nodes.md";
  if (/模型|model|路由|routing|能力|强弱/.test(normalized)) return "model-routing.md";
  if (/协作|通信|依赖|handoff|交接|第一个|第二个|顺序/.test(normalized)) return "collaboration.md";
  if (/profile|节点|通用|特异|专用|用途|分类/.test(normalized)) return "profiles-and-nodes.md";
  return null;
}

async function readWorkflowAiDocs(userText: string) {
  const docsDir = join(process.cwd(), "docs/workflow-ai");
  const files = ["runtime.md", "basics.md"];
  const topicFile = topicForText(userText);
  if (topicFile) files.push("index.md", topicFile);
  const docs = await Promise.all(files.map(async (file) => {
    const content = await readFile(join(docsDir, file), "utf8");
    return `### File: ${file}\n${content.trim()}`;
  }));
  return docs.join("\n\n");
}

function fallbackReply(event: WorkflowAiEvent, state: WorkflowAiState) {
  if (event === "purpose-received") {
    if (state.isBlank || !state.hasRunnableChain) return "收到，目的已经写入 workflow。接下来我可以帮你搭节点链路。";
    if (state.missingRequiredInput?.length) return `收到，目的已经写入 workflow。下一步请补充「${state.missingRequiredInput[0]?.label || "资料"}」。`;
    return "收到，目的已经写入 workflow。资料已经齐了，可以开始跑。";
  }
  if (event === "material-received") {
    if (state.missingRequiredInput?.length) return `收到资料。还需要「${state.missingRequiredInput[0]?.label || "下一项资料"}」。`;
    return state.hasRunnableChain ? "收到资料。必填资料已经齐了，可以开始跑。" : "收到资料。资料够了，但还需要先把节点链路搭起来。";
  }
  if (state.isBlank) return "你好，我是 workflow 搭建向导。需要我帮你搭建这个 workflow 吗？你可以先告诉我想完成什么。";
  if (!state.hasRunnableChain) return "我看到这个 workflow 还没有可运行的节点链路。你可以告诉我目标，我来帮你判断怎么搭。";
  if (state.missingRequiredInput?.length) return `这个 workflow 已经有执行链路。下一步请补充「${state.missingRequiredInput[0]?.label || "资料"}」。`;
  return "这个 workflow 当前可以运行。你也可以先输入这次的具体目的，我会写入 workflow 再开始。";
}

async function askWorkflowAi(prompt: string) {
  const sessionDir = await mkdtemp(join(tmpdir(), "pi-workflow-ai-"));
  try {
    return await new Promise<string>((resolve, reject) => {
      const proc = spawn("pi", [
        "--print",
        "--mode",
        "text",
        "--model",
        WORKFLOW_AI_MODEL,
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
        reject(new Error("Workflow AI timed out"));
      }, WORKFLOW_AI_TIMEOUT_MS);
      proc.stdout.on("data", (chunk) => { stdout += String(chunk); });
      proc.stderr.on("data", (chunk) => { stderr += String(chunk); });
      proc.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      proc.on("close", (code) => {
        clearTimeout(timeout);
        const output = (stdout || stderr).trim();
        if (code !== 0) {
          reject(new Error(output || `Workflow AI exited with code ${code}`));
          return;
        }
        resolve(output);
      });
    });
  } finally {
    await rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { event?: WorkflowAiEvent; userText?: string; state?: WorkflowAiState };
  const event = body.event || "entered";
  const state = body.state || {};
  try {
    const docs = await readWorkflowAiDocs(body.userText || "");
    const prompt = [
      "Workflow AI instruction bundle:",
      "",
      docs,
      "",
      "Current event and state:",
      JSON.stringify({ event, userText: body.userText || "", state }, null, 2),
      "",
      "Reply in Chinese. Output only the one current reply shown to the user. Keep it concise and situational.",
    ].join("\n");
    const reply = (await askWorkflowAi(prompt)).replace(/^["'“”]+|["'“”]+$/g, "").trim();
    return NextResponse.json({ reply: reply || fallbackReply(event, state), model: WORKFLOW_AI_MODEL });
  } catch (error) {
    return NextResponse.json({ reply: fallbackReply(event, state), degraded: true, error: String(error) });
  }
}
