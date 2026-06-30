"use client";
import type React from "react";
import { useState } from "react";
import type { AgentTask, ArtifactInfo, LedgerEvent, PendingConfirmation } from "@/hooks/useOrchestrate";

interface FlowStage { stage?: string; name?: string; status?: string; goal?: string; blockers?: string[] }
export interface FlowState {
  currentStage?: string;
  flowDomain?: string;
  gateStatus?: string;
  stageMap?: FlowStage[] | Record<string, FlowStage>;
  stageDeliverables?: Array<{ id?: string; name?: string; status?: string; taskId?: string }>;
}

interface ProjectMemorySnapshot {
  projectId?: string;
  cwd?: string;
  context?: string;
  progress?: string;
  bugs?: string;
  recentSummaries?: Array<{ id?: string; kind?: string; title?: string; body?: string; createdAt?: number }>;
}

export function StageFlowView({ flowState }: { flowState?: FlowState | null }) {
  const current = flowState?.currentStage;
  const stageList: FlowStage[] = Array.isArray(flowState?.stageMap)
    ? flowState!.stageMap as FlowStage[]
    : flowState?.stageMap
      ? Object.entries(flowState.stageMap).map(([name, meta]) => ({ stage: name, ...meta }))
      : [];
  const hasRealFlow = Boolean(current || stageList.length || flowState?.flowDomain || flowState?.gateStatus || flowState?.stageDeliverables?.length);
  if (!hasRealFlow) {
    return (
      <section style={boxStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Flow Stage</div>
        <div style={emptyStyle}>No workflow flow started yet.</div>
      </section>
    );
  }
  const stages = stageList.length > 0 ? stageList : current ? [{ stage: current, status: "current", goal: "Current stage" }] : [];
  return (
    <section style={boxStyle}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Flow Stage</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {stages.map((meta) => {
          const name = meta.stage || meta.name || "Stage";
          const active = current === name || meta.status === "current" || meta.status === "active";
          const status = meta.status || (active ? "active" : "pending");
          return (
            <div key={name} title={meta.goal} style={{ display: "flex", justifyContent: "space-between", padding: "5px 7px", borderRadius: 6, background: active ? "#3b82f622" : "var(--bg-secondary)", fontSize: 11 }}>
              <span>{active ? "● " : "○ "}{name}</span>
              <span style={{ color: statusColor(status) }}>{status}</span>
            </div>
          );
        })}
      </div>
      {flowState?.flowDomain && <div style={mutedStyle}>Domain: {flowState.flowDomain}</div>}
      {flowState?.gateStatus && <div style={mutedStyle}>Gate: {flowState.gateStatus}</div>}
      {flowState?.stageDeliverables?.length ? <div style={mutedStyle}>Deliverables: {flowState.stageDeliverables.filter((d) => d.status === "completed").length}/{flowState.stageDeliverables.length}</div> : null}
    </section>
  );
}

export function AgentDagView({ tasks, artifacts = [], onOpenTask, onSwitchModel, onAbortTask, onPauseTask, onResumeTask, pendingConfirmation, onConfirm }: { tasks: AgentTask[]; artifacts?: ArtifactInfo[]; onOpenTask: (taskId: string) => void; onSwitchModel: (taskId: string, model: string) => void; onAbortTask: (taskId: string) => void; onPauseTask: (taskId: string) => void; onResumeTask: (taskId: string) => void; pendingConfirmation?: PendingConfirmation | null; onConfirm: (decision?: string, note?: string) => void }) {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const artifactByProducer = new Map(artifacts.map((a) => [a.producerTaskId, a]));
  const [switchingTaskId, setSwitchingTaskId] = useState<string | null>(null);
  const [modelInfoTaskId, setModelInfoTaskId] = useState<string | null>(null);
  const availableModels = ["opencode-go/glm-5.2", "opencode-go/glm-5.1", "opencode-go/deepseek-v4-flash", "opencode-go/deepseek-v4-pro", "opencode-go/qwen3.7-plus"];
  const summary = {
    running: tasks.filter((t) => t.status === "running").length,
    waiting: tasks.filter((t) => t.status === "waiting_for_dependency" || t.status === "pending").length,
    debugging: tasks.filter((t) => t.collaborationStatus === "debugging").length,
    blocked: tasks.filter((t) => t.status === "error" || t.collaborationStatus === "blocked").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };
  return (
    <section style={boxStyle}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Agent Collaboration</div>
      <div style={{ ...mutedStyle, marginTop: -2, marginBottom: 8 }}>把每个 Agent 当成一张任务卡：谁在跑、谁在等、谁卡住、谁已经完成。</div>
      {pendingConfirmation ? (
        <div style={{ marginBottom: 8, padding: 10, borderRadius: 8, border: "1px solid #f9731644", background: "#f9731611", fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "#f97316", marginBottom: 6 }}>需要用户确认</div>
          <div style={{ marginBottom: 4 }}>{pendingConfirmation.question}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 6 }}>建议：{pendingConfirmation.recommendation}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onConfirm("confirm")} style={btnStyle}>确认继续</button>
            <button onClick={() => onConfirm("stop")} style={btnStyle}>停止 DAG</button>
          </div>
        </div>
      ) : null}
      {tasks.length === 0 && <div style={emptyStyle}>还没有派生 Agent。主 Agent 进入执行或调试后，这里会显示协作关系。</div>}
      {tasks.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {summary.running > 0 ? <span style={summaryChip("#3b82f6")}>运行 {summary.running}</span> : null}
          {summary.waiting > 0 ? <span style={summaryChip("#8b5cf6")}>等待 {summary.waiting}</span> : null}
          {summary.debugging > 0 ? <span style={summaryChip("#f59e0b")}>调试 {summary.debugging}</span> : null}
          {summary.blocked > 0 ? <span style={summaryChip("#ef4444")}>阻塞 {summary.blocked}</span> : null}
          {summary.completed > 0 ? <span style={summaryChip("#22c55e")}>完成 {summary.completed}</span> : null}
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
        {tasks.map((t, idx) => {
          const deps = t.deps || [];
          const waitingDeps = deps.filter((d) => taskById.get(d)?.status !== "completed");
          const artifact = artifactByProducer.get(t.id);
          const blocked = t.status === "pending" && waitingDeps.length > 0;
          const heartbeatText = formatHeartbeat(t);
          return (
            <div key={t.id} style={{ textAlign: "left", padding: "10px", borderRadius: 10, border: `1px solid ${statusColor(blocked ? "blocked" : t.status)}55`, background: blocked ? "#f59e0b11" : "var(--bg-secondary)", color: "var(--text)", fontSize: 12, gridColumn: idx === 0 ? "1 / -1" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <button onClick={() => onOpenTask(t.id)} style={{ background: "transparent", border: "none", color: "var(--text)", padding: 0, cursor: "pointer", textAlign: "left", fontWeight: 700, fontSize: 12 }}>
                  {idx === 0 ? `Lead · ${t.name}` : t.name}
                </button>
                <span style={{ color: statusColor(blocked ? "blocked" : t.status), fontWeight: 600 }}>{blocked ? "等待依赖" : formatTaskStatus(t.status)}</span>
              </div>
              <div style={{ ...mutedStyle, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => setModelInfoTaskId(modelInfoTaskId === t.id ? null : t.id)} style={{ background: "transparent", border: "none", padding: 0, color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }}>
                  {t.model?.split("/")[1]}
                </button>
                {t.profileName ? <span>· {t.profileName}</span> : null}
              </div>
              {modelInfoTaskId === t.id ? (
                <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 11, color: "var(--text-muted)" }}>
                  <div>模型来源：{formatModelSource(t.modelSource)}</div>
                  <div>请求模型：{t.requestedModel || t.model || "未记录"}</div>
                  <div>实际模型：{t.model || "未记录"}</div>
                  <div>触发原因：{t.modelReason || "未记录"}</div>
                </div>
              ) : null}
              {t.currentTaskStage && <div style={mutedStyle}>当前阶段：{t.currentTaskStage}{t.needsPlanDiscussion ? " · 还在讨论方案" : ""}</div>}
              {t.definitionOfDone && <div style={mutedStyle}>完成定义：{t.definitionOfDone}</div>}
              {t.lastProgressStage && <div style={mutedStyle}>最近 checkpoint：{t.lastProgressStage}</div>}
              {heartbeatText ? <div style={heartbeatStyle}><span style={heartbeatDotStyle} />{heartbeatText}</div> : null}
              {t.completionGate && <div style={mutedStyle}>完成门禁：{t.completionGate.status === "passed" ? "通过" : `未通过 · ${(t.completionGate.issues || []).join(", ") || "待补齐"}`}</div>}
              {t.collaborationStatus && <div style={mutedStyle}>协作状态：{formatCollabStatus(t.collaborationStatus)}{t.leadDecision ? ` · Lead: ${t.leadDecision}` : ""}</div>}
              {t.error && <div style={{ ...mutedStyle, color: "#ef4444" }}>卡点：{t.error}</div>}
              {deps.length > 0 && <div style={mutedStyle}>依赖：{deps.map((d) => `${d}:${formatTaskStatus(taskById.get(d)?.status)}`).join(" → ")}</div>}
              {t.skills?.length ? <div style={mutedStyle}>启用技能：{t.skills.slice(0, 4).join(", ")}{t.skills.length > 4 ? "..." : ""}</div> : null}
              {t.promotedProfileSkills?.length ? <div style={mutedStyle}>升为自带：{t.promotedProfileSkills.join(", ")}</div> : null}
              {artifact && <div style={mutedStyle}>产物：{artifact.id} · {artifact.status}</div>}
              {t.delta && t.status === "running" && <div style={{ ...mutedStyle, color: "#94a3b8", maxHeight: 42, overflow: "hidden" }}>{t.delta.slice(-140)}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {switchingTaskId === t.id ? (
                  <select autoFocus defaultValue={t.model} onBlur={() => setSwitchingTaskId(null)} onChange={(e) => { onSwitchModel(t.id, e.target.value); setSwitchingTaskId(null); }} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", minHeight: 30 }}>
                    {availableModels.map((model) => <option key={model} value={model}>{model.split("/")[1]}</option>)}
                  </select>
                ) : (
                  <button title="切换模型" aria-label="切换模型" onClick={() => setSwitchingTaskId(t.id)} style={iconBtnStyle}>⚙️</button>
                )}
                {t.status === "running" ? (
                  <button title="暂停任务" aria-label="暂停任务" onClick={() => onPauseTask(t.id)} style={iconBtnStyle}>⏸</button>
                ) : t.status === "paused" ? (
                  <button title="恢复任务" aria-label="恢复任务" onClick={() => onResumeTask(t.id)} style={iconBtnStyle}>▶</button>
                ) : t.status === "waiting_for_dependency" || t.status === "pending" ? (
                  <button title="停止任务" aria-label="停止任务" onClick={() => onAbortTask(t.id)} style={iconBtnStyle}>⏹</button>
                ) : null}
                <button title="查看详情" aria-label="查看详情" onClick={() => onOpenTask(t.id)} style={iconBtnStyle}>↗</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ProjectMemoryView({ memory, onRefresh, onClearSummaries }: { memory?: ProjectMemorySnapshot | null; onRefresh?: () => void; onClearSummaries?: () => void }) {
  if (!memory) {
    return (
      <section style={boxStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Context / Progress / Risks</div>
        <div style={emptyStyle}>Project memory not loaded.</div>
      </section>
    );
  }
  return (
    <section style={boxStyle}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Context / Progress / Risks</div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 650 }}>这是给 Lead 和子 Agent 用的长期上下文。</div>
          <div style={mutedStyle}>用户不用记 `projectId / progress.md / bugs.md` 这些内部名字，只看“背景、进展、风险”就够了。</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {onRefresh ? <button onClick={onRefresh} style={btnStyle}>刷新</button> : null}
          {onClearSummaries ? <button onClick={onClearSummaries} style={btnStyle}>清沉淀</button> : null}
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <MemoryBlock title="项目背景" hint="它回答：我们到底在做什么、边界和约束是什么。" body={memory.context || "还没有沉淀项目背景。"} />
        <MemoryBlock title="当前进展" hint="它回答：现在推进到哪一步了、已经完成了什么。" body={memory.progress || "还没有记录近期进展。"} />
        <MemoryBlock title="风险 / 问题" hint="它回答：有哪些坑、哪些问题反复出现、哪些地方要小心。" body={memory.bugs || "当前没有记录明确风险。"} />
      </div>
      {memory.recentSummaries?.length ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Recent Summaries</div>
          <div style={{ display: "grid", gap: 6 }}>
            {memory.recentSummaries.map((item) => (
              <div key={item.id || item.title} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{item.title || item.kind || "Summary"}</div>
                <div style={{ ...mutedStyle, whiteSpace: "pre-wrap", maxHeight: 84, overflow: "auto" }}>{summarizeMemoryText(item.body || "No content")}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <details style={{ marginTop: 10 }}>
        <summary style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>Technical Info</summary>
        <div style={{ ...mutedStyle, marginTop: 6 }}>Project ID: {memory.projectId || "N/A"}</div>
        <div style={mutedStyle}>CWD: {memory.cwd || "N/A"}</div>
      </details>
    </section>
  );
}

function MemoryBlock({ title, hint, body }: { title: string; hint: string; body: string }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
      <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 650 }}>{title}</div>
      <div style={{ ...mutedStyle, marginTop: 2 }}>{hint}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto", lineHeight: 1.6 }}>{summarizeMemoryText(body)}</div>
    </div>
  );
}

export function ArtifactFlowView({ artifacts }: { artifacts: ArtifactInfo[] }) {
  return (
    <section style={boxStyle}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Artifact Flow</div>
      {artifacts.length === 0 ? <div style={emptyStyle}>暂无 Agent 产物。项目文件请看左侧「资源 / 物料」。</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {artifacts.map((a) => (
            <div key={a.id} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)", fontSize: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>📄 {a.id}</span><span style={{ color: statusColor(a.status) }}>{a.status}</span></div>
              <div style={mutedStyle}>from {a.producerTaskName || a.producerTaskId}</div>
              {a.handoff?.completionStatus ? <div style={mutedStyle}>handoff: {a.handoff.completionStatus}{a.handoff.blockingReason && a.handoff.blockingReason !== "无" ? ` · ${a.handoff.blockingReason}` : ""}</div> : null}
              {a.handoff?.nextStep ? <div style={mutedStyle}>next: {a.handoff.nextStep}</div> : null}
              {a.handoff?.memoryDiff && a.handoff.memoryDiff !== "无" ? <div style={mutedStyle}>memory diff: {a.handoff.memoryDiff}</div> : null}
              {a.consumers?.length ? <div style={mutedStyle}>→ {a.consumers.join(", ")}</div> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function LedgerTimelineView({ events }: { events: LedgerEvent[] }) {
  const recent = [...(events || [])].slice(-12).reverse();
  return (
    <section style={boxStyle}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Ledger Timeline</div>
      {recent.length === 0 ? <div style={emptyStyle}>暂无 ledger 事件。</div> : (
        <div style={{ display: "grid", gap: 6 }}>
          {recent.map((event) => {
            const usage = event.payload?.usage as { totalTokens?: number; cost?: { total?: number } } | undefined;
            return (
              <div key={event.id} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", fontSize: 11 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ color: "var(--text)", fontWeight: 650 }}>{formatLedgerType(event.type)}</span>
                  <span style={{ color: statusColor(event.status) }}>{event.status || "info"}</span>
                </div>
                <div style={mutedStyle}>
                  {event.taskId ? `task: ${event.taskId}` : "session"}{event.stage ? ` · ${event.stage}` : ""}{event.isoTime ? ` · ${new Date(event.isoTime).toLocaleTimeString()}` : ""}
                </div>
                {usage ? <div style={mutedStyle}>tokens: {usage.totalTokens ?? "?"}{typeof usage.cost?.total === "number" ? ` · cost: $${usage.cost.total.toFixed(4)}` : ""}</div> : null}
                {event.payload?.error ? <div style={{ ...mutedStyle, color: "#ef4444" }}>{String(event.payload.error)}</div> : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AgentDetailView({ task, artifacts, onAbort, onPause, onResume }: { task?: AgentTask | null; artifacts: ArtifactInfo[]; onAbort: (id: string) => void; onPause: (id: string) => void; onResume: (id: string) => void }) {
  if (!task) return null;
  const related = artifacts.filter((a) => a.producerTaskId === task.id || a.consumers?.includes(task.id));
  return (
    <section style={boxStyle}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Agent Status</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{task.name}</div>
      <div style={mutedStyle}>Status: {task.status}</div>
      <div style={mutedStyle}>Model: {task.model}</div>
      <div style={mutedStyle}>Skills: {task.skills?.join(", ") || "未记录"}</div>
      {task.promotedProfileSkills?.length ? <div style={mutedStyle}>Promoted: {task.promotedProfileSkills.join(", ")}</div> : null}
      <div style={mutedStyle}>Task Stage: {task.currentTaskStage || "未记录"}{task.needsPlanDiscussion ? " · 仍需方案讨论" : ""}</div>
      <div style={mutedStyle}>Collaboration: {task.collaborationStatus ? formatCollabStatus(task.collaborationStatus) : "未审查"}</div>
      {formatHeartbeat(task) ? <div style={heartbeatStyle}><span style={heartbeatDotStyle} />{formatHeartbeat(task)}</div> : null}
      {task.handoff?.completionStatus ? <div style={mutedStyle}>Handoff: {task.handoff.completionStatus}</div> : null}
      {task.handoff?.blockingReason && task.handoff.blockingReason !== "无" ? <div style={{ ...mutedStyle, color: "#ef4444" }}>Blocked: {task.handoff.blockingReason}</div> : null}
      {task.handoff?.nextStep ? <div style={mutedStyle}>Handoff Next: {task.handoff.nextStep}</div> : null}
      {task.memoryDiff && task.memoryDiff !== "无" ? <div style={mutedStyle}>Memory Diff: {task.memoryDiff}</div> : null}
      {task.leadDecision && <div style={mutedStyle}>Lead Decision: {task.leadDecision}</div>}
      {task.nextAction && <div style={mutedStyle}>Next: {task.nextAction}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {task.status === "running" ? <button onClick={() => onPause(task.id)} style={btnStyle}>暂停</button> : null}
        {task.status === "paused" ? <button onClick={() => onResume(task.id)} style={btnStyle}>恢复</button> : null}
        {(task.status === "pending" || task.status === "waiting_for_dependency") ? <button onClick={() => onAbort(task.id)} style={btnStyle}>停止</button> : null}
      </div>
      {task.taskStages?.length ? <div style={{ marginTop: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Task Stages</div>{task.taskStages.map((s, i) => <div key={`${s.stage || s.name}-${i}`} style={mutedStyle}>○ {s.stage || s.name} {s.status ? `· ${s.status}` : ""}</div>)}</div> : null}
      {related.length > 0 && <div style={{ marginTop: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>Related Artifacts</div>{related.map((a) => <div key={a.id} style={mutedStyle}>📄 {a.id} · {a.status}</div>)}</div>}
      {(task.output || task.delta) && <pre style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto", fontSize: 11, marginTop: 10 }}>{task.output || task.delta}</pre>}
    </section>
  );
}

const boxStyle: React.CSSProperties = { border: "1px solid color-mix(in srgb, var(--border) 82%, transparent)", borderRadius: 10, padding: 10, background: "var(--bg)", marginBottom: 8, boxShadow: "0 1px 2px rgba(15,23,42,0.02)" };
const mutedStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", marginTop: 3 };
const emptyStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, padding: "8px 0" };
const btnStyle: React.CSSProperties = { fontSize: 11, padding: "4px 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", cursor: "pointer" };
const iconBtnStyle: React.CSSProperties = { width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid color-mix(in srgb, var(--border) 88%, transparent)", background: "color-mix(in srgb, var(--bg-secondary) 88%, white 12%)", color: "var(--text-muted)", cursor: "pointer", padding: 0, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" };
const heartbeatStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#3b82f6", marginTop: 6, padding: "5px 7px", borderRadius: 7, border: "1px solid #3b82f633", background: "#3b82f611" };
const heartbeatDotStyle: React.CSSProperties = { width: 7, height: 7, borderRadius: 999, background: "#3b82f6", boxShadow: "0 0 0 3px #3b82f622", flexShrink: 0 };
function summaryChip(color: string): React.CSSProperties { return { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: "var(--bg-secondary)", color: "var(--text-muted)", fontSize: 11, border: `1px solid ${color}33` }; }
function formatHeartbeat(task?: AgentTask | null) {
  if (!task || task.status !== "running" || !task.heartbeat) return "";
  const elapsedMs = typeof task.heartbeat.elapsedMs === "number"
    ? task.heartbeat.elapsedMs
    : task.heartbeat.startedAt ? Date.now() - task.heartbeat.startedAt : 0;
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const label = task.heartbeat.message || (task.heartbeat.phase === "receiving_model_output" ? "模型正在返回内容" : "等待模型返回");
  return `${label}${seconds ? ` · ${seconds}s` : ""}`;
}
function summarizeMemoryText(text?: string) {
  return String(text || "")
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s*/gm, "• ")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1200) || "无内容";
}
function statusColor(status?: string) { return status === "completed" || status === "ready" || status === "accepted" ? "#22c55e" : status === "running" || status === "active" ? "#3b82f6" : status === "debugging" ? "#f59e0b" : status === "error" || status === "blocked" || status === "needs_revision" ? "#ef4444" : status === "paused" || status?.startsWith("waiting") ? "#a855f7" : "var(--text-muted)"; }
function formatTaskStatus(status?: string) {
  const map: Record<string, string> = { pending: "待开始", queued: "已排队", running: "运行中", completed: "已完成", incomplete: "未完成", blocked: "阻塞", error: "出错", paused: "已暂停", waiting_for_dependency: "等待依赖", waiting_confirmation: "等确认" };
  return status ? (map[status] || status) : "未记录";
}
function formatLedgerType(type?: string) {
  const map: Record<string, string> = {
    progress_reported: "Checkpoint",
    task_milestone_started: "Task Started",
    model_process_started: "Model Started",
    model_process_closed: "Model Closed",
    model_process_timeout: "Timeout",
    model_process_inactivity_timeout: "No Progress Timeout",
    artifact_registered: "Artifact Registered",
    handoff_packet_parsed: "Handoff Parsed",
    validation_passed: "Gate Passed",
    validation_failed: "Gate Failed",
    task_retry_scheduled: "Retry Scheduled",
    task_retry_skipped: "Retry Skipped",
    lead_review_completed: "Lead Review",
    dag_blocked: "DAG Blocked",
    user_confirmation_required: "User Confirmation",
    budget_exceeded: "Budget Exceeded",
  };
  return type ? (map[type] || type) : "Event";
}
function formatModelSource(source?: string) {
  const map: Record<string, string> = {
    fixed_route: "固定路由",
    lead_selected: "Lead 主动选择",
    profile_default: "Profile 默认",
    user_override: "用户覆盖",
    safety_reroute: "保护性改派",
  };
  return source ? (map[source] || source) : "未记录";
}

function formatCollabStatus(status: string) {
  const map: Record<string, string> = {
    waiting_material: "等待物料",
    waiting_agent_decision: "等待其他Agent决策",
    waiting_lead_decision: "等待Lead判断",
    waiting_user_confirmation: "等待用户确认",
    ready_for_review: "待Lead审查",
    needs_revision: "需要修订",
    accepted: "已接受",
    blocked: "阻塞",
    debugging: "调试中",
  };
  return map[status] || status;
}
