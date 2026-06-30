import { ConceptPreview } from "@/components/concepts/ConceptPreview";

export default function PaperConceptPage() {
  return (
    <ConceptPreview
      id="paper"
      title="Paper Studio"
      subtitle="editorial project room"
      description="这套方向把产品从“命令台”拉向“项目工作室”。用户会先看到任务阶段、产物摘要和上下文摘要，再进入对话与协作，适合长期项目和内容型工作流。"
      mood="radial-gradient(circle at top right, rgba(161,92,56,0.16), transparent 30%), linear-gradient(180deg, #f8f2e8 0%, #efe4d6 100%)"
      accent="#a15c38"
      nav={[
        { label: "Brief", hint: "Goal, constraints, and stage summary first" },
        { label: "Notes", hint: "Readable project log and decisions" },
        { label: "Outputs", hint: "Artifacts, reports, and deliverables" },
        { label: "Review", hint: "User approvals and next actions" },
      ]}
      sidebar={[
        {
          title: "Project brief",
          items: ["Objective: unify every product page visually", "Constraint: keep codex-like transcript behavior", "Priority: reduce chat blank-time anxiety"],
        },
        {
          title: "Decision log",
          items: ["Three prototype directions requested", "Prototype should be previewable, not a moodboard", "Multi-agent status must be understandable by humans"],
        },
      ]}
      workflows={[
        { name: "Editorial review", summary: "Generate readable status, decisions, and next-step summaries." },
        { name: "Artifact polish", summary: "Turn agent output into stage cards and deliverable records." },
        { name: "Design convergence", summary: "Choose one direction and propagate it across all screens." },
      ]}
      scenarios={{
        landing: {
          label: "Brief",
          eyebrow: "Project room entry",
          description: "The first view reads like a live brief: goal, current stage, risks, and what the team is doing now.",
          inputPlaceholder: "Add a goal, note, or follow-up request...",
          statusLine: "This direction reduces blank-slate anxiety by showing context before conversation.",
          messages: [
            { role: "system", text: "Current stage: visual alignment / review window open" },
            { role: "assistant", text: "Goal: deliver three prototype directions and fix the send-path lag." },
            { role: "assistant", text: "Risk log: users still cannot clearly see orchestration state in the main product." },
          ],
          tasks: [
            { title: "Assemble brief", owner: "stage manager", state: "queued" },
            { title: "Prepare review summary", owner: "editor worker", state: "queued" },
            { title: "Track open risks", owner: "observer worker", state: "queued" },
          ],
        },
        session: {
          label: "Notes",
          eyebrow: "Readable collaboration",
          description: "The conversation area behaves more like a collaborative notebook, but still keeps the final-answer discipline.",
          inputPlaceholder: "Refine the project note or add feedback...",
          statusLine: "Shared context, decisions, and pending questions are rendered as readable notes instead of buried events.",
          messages: [
            { role: "user", text: "我想让整个产品从第一页开始就有设计感，而且能看清每一步在做什么。" },
            { role: "assistant", text: "这套方案会把项目摘要、阶段状态、最近成果和待确认项提升到页面顶部，让用户在发送消息前就知道系统处于什么上下文。" },
            { role: "system", text: "Decision captured: emphasize readable project records alongside the main transcript." },
          ],
          tasks: [
            { title: "Update project note", owner: "editor worker", state: "active" },
            { title: "Summarize changes", owner: "archive worker", state: "queued" },
            { title: "Request confirmation", owner: "stage manager", state: "queued" },
          ],
        },
        workflow: {
          label: "Outputs",
          eyebrow: "Artifact-centered review",
          description: "Workflow runs produce stage cards and deliverable summaries, so the outcome feels like a project room, not a log stream.",
          inputPlaceholder: "Review an artifact or trigger the next stage...",
          statusLine: "Outputs are grouped by project stage, which makes long-running work easier to resume.",
          messages: [
            { role: "system", text: "Artifact packet: design-concepts / stage 3 of 4" },
            { role: "assistant", text: "Three prototype routes are ready for review, and the chat send-path fix is linked as a related technical change." },
            { role: "assistant", text: "Next step: choose one visual language and propagate it to the actual product pages." },
          ],
          tasks: [
            { title: "Collect prototype set", owner: "archive worker", state: "active" },
            { title: "Prepare recommendation", owner: "editor worker", state: "queued" },
            { title: "Open review gate", owner: "stage manager", state: "queued" },
          ],
        },
      }}
    />
  );
}
