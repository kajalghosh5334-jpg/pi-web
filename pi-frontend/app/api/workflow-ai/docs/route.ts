import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TOPICS = {
  basics: "basics.md",
  "common-nodes": "common-nodes.md",
  "profiles-and-nodes": "profiles-and-nodes.md",
  skills: "skills.md",
  training: "training.md",
  "model-routing": "model-routing.md",
  "tuning-recipes": "tuning-recipes.md",
  collaboration: "collaboration.md",
} as const;

type WorkflowAiTopic = keyof typeof TOPICS;

const TOPIC_TITLES: Record<WorkflowAiTopic, string> = {
  basics: "Workflow 基础",
  "common-nodes": "通用功能节点体系",
  "profiles-and-nodes": "Profile 与节点",
  skills: "Skill 配置",
  training: "训练模式",
  "model-routing": "模型路由",
  "tuning-recipes": "Workflow 生成微调",
  collaboration: "节点协作",
};

function topicFromQuery(query: string): WorkflowAiTopic {
  const text = query.toLowerCase();
  if (/skill|技能|fixed|configurable|配置/.test(text)) return "skills";
  if (/通用节点|功能节点|节点体系|模板|template|fetch|gather|standardize|classify|extract|generate|review|monitor|搭建/.test(text)) return "common-nodes";
  if (/推荐|生成|微调|有效路径|candidate|chain|combo|组合|穷举|定制/.test(text)) return "tuning-recipes";
  if (/train|训练|弱模型|强模型|示范|学习|专项/.test(text)) return "training";
  if (/模型|model|routing|路由|能力|强弱/.test(text)) return "model-routing";
  if (/协作|通信|依赖|handoff|交接|顺序|第一个|第二个/.test(text)) return "collaboration";
  if (/profile|节点|通用|特异|专用|用途/.test(text)) return "profiles-and-nodes";
  return "basics";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestedTopic = url.searchParams.get("topic") || "";
    const query = url.searchParams.get("q") || "";
    const topic = requestedTopic in TOPICS ? requestedTopic as WorkflowAiTopic : topicFromQuery(query);
    const filename = TOPICS[topic];
    const relativePath = `docs/workflow-ai/${filename}`;
    const absolutePath = join(process.cwd(), relativePath);
    const content = await readFile(absolutePath, "utf8");

    return NextResponse.json({
      topic,
      title: TOPIC_TITLES[topic],
      path: absolutePath,
      sourceUrl: `/api/workflow-ai/docs?topic=${topic}`,
      content,
      index: Object.entries(TOPICS).map(([id, file]) => ({
        id,
        title: TOPIC_TITLES[id as WorkflowAiTopic],
        file: `docs/workflow-ai/${file}`,
        sourceUrl: `/api/workflow-ai/docs?topic=${id}`,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
