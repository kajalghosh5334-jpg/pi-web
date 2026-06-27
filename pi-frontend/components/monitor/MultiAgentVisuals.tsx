"use client";
import type React from "react";
import { useState } from "react";
import type { AgentTask, ArtifactInfo, PendingConfirmation } from "@/hooks/useOrchestrate";

interface FlowStage { stage?: string; name?: string; status?: string; goal?: string; blockers?: string[] }
interface FlowState {
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
        <div style={titleStyle}>阶段路径</div>
        <div style={emptyStyle}>还没有开始 Multi-Agent 流程。</div>
      </section>
    );
  }
  const stages = stageList.length > 0 ? stageList : current ? [{ stage: current, status: "current", goal: "当前阶段" }] : [];
  return (
    <section style={boxStyle}>
      <div style={titleStyle}>阶段路径</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {stages.map((meta) => {
          const name = meta.stage || meta.name || "阶段";
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
      {flowState?.flowDomain && <div style={mutedStyle}>类型：{flowState.flowDomain}</div>}
      {flowState?.gateStatus && <div style={mutedStyle}>门禁：{flowState.gateStatus}</div>}
      {flowState?.stageDeliverables?.length ? <div style={mutedStyle}>交付物：{flowState.stageDeliverables.filter((d) => d.status === "completed").length}/{flowState.stageDeliverables.length}</div> : null}
    </section>
  );
}

export function AgentDagView({ tasks, artifacts = [], onOpenTask, onSwitchModel, onAbortTask, onPauseTask, onResumeTask, pendingConfirmation, onConfirm }: { tasks: AgentTask[]; artifacts?: ArtifactInfo[]; onOpenTask: (taskId: string) => void; onSwitchModel: (taskId: string, model: string) => void; onAbortTask: (taskId: string) => void; onPauseTask: (taskId: string) => void; onResumeTask: (taskId: string) => void; pendingConfirmation?: PendingConfirmation | null; onConfirm: (decision?: string, note?: string) => void }) {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const artifactByProducer = new Map(artifacts.map((a) => [a.producerTaskId, a]));
  const [switchingTaskId, setSwitchingTaskId] = useState<string | null>(null);
  const [modelInfoTaskId, setModelInfoTaskId] = useState<string | null>(null);
  const availableModels = ["opencore-go/glm-5.2", "opencore-go/glm-5.1", "opencore-go/deepseek-v4-flash", "opencore-go/deepseek-v4-pro", "opencore-go/qwen3.7-plus"];
  return (
    <section style={boxStyle}>
      <div style={titleStyle}>Agent 协作图 · 实时</div>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tasks.map((t, idx) => {
          const deps = t.deps || [];
          const waitingDeps = deps.filter((d) => taskById.get(d)?.status !== "completed");
          const artifact = artifactByProducer.get(t.id);
          const blocked = t.status === "pending" && waitingDeps.length > 0;
          return (
            <div key={t.id} style={{ textAlign: "left", padding: "8px", borderRadius: 8, border: `1px solid ${statusColor(blocked ? "blocked" : t.status)}55`, background: blocked ? "#f59e0b11" : "var(--bg-secondary)", color: "var(--text)", fontSize: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <button onClick={() => onOpenTask(t.id)} style={{ background: "transparent", border: "none", color: "var(--text)", padding: 0, cursor: "pointer", textAlign: "left", fontWeight: 600 }}>
                  {idx === 0 ? "Lead" : `├─ ${t.name}`}
                </button>
                <span style={{ color: statusColor(blocked ? "blocked" : t.status) }}>{blocked ? "waiting deps" : t.status}</span>
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
              {t.currentTaskStage && <div style={mutedStyle}>Stage: {t.currentTaskStage}{t.needsPlanDiscussion ? " · 方案讨论" : ""}</div>}
              {t.collaborationStatus && <div style={mutedStyle}>Collab: {formatCollabStatus(t.collaborationStatus)}{t.leadDecision ? ` · Lead: ${t.leadDecision}` : ""}</div>}
              {deps.length > 0 && <div style={mutedStyle}>Deps: {deps.map((d) => `${d}:${taskById.get(d)?.status || "missing"}`).join(" → ")}</div>}
              {t.skills?.length ? <div style={mutedStyle}>Skills: {t.skills.slice(0, 4).join(", ")}{t.skills.length > 4 ? "..." : ""}</div> : null}
              {t.promotedProfileSkills?.length ? <div style={mutedStyle}>升为自带: {t.promotedProfileSkills.join(", ")}</div> : null}
              {artifact && <div style={mutedStyle}>Artifact: {artifact.id} · {artifact.status}</div>}
              {t.delta && t.status === "running" && <div style={{ ...mutedStyle, color: "#94a3b8", maxHeight: 28, overflow: "hidden" }}>{t.delta.slice(-100)}</div>}
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
        <div style={titleStyle}>项目记忆</div>
        <div style={emptyStyle}>当前项目记忆尚未加载。</div>
      </section>
    );
  }
  return (
    <section style={boxStyle}>
      <div style={titleStyle}>项目记忆</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={mutedStyle}>Project ID: {memory.projectId || "未记录"}</div>
          <div style={mutedStyle}>CWD: {memory.cwd || "未记录"}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {onRefresh ? <button onClick={onRefresh} style={btnStyle}>刷新</button> : null}
          {onClearSummaries ? <button onClick={onClearSummaries} style={btnStyle}>清摘要</button> : null}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>{memory.context || "无 context"}</div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", whiteSpace: "pre-wrap", maxHeight: 100, overflow: "auto" }}>{memory.progress || "无 progress"}</div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", whiteSpace: "pre-wrap", maxHeight: 100, overflow: "auto" }}>{memory.bugs || "无 bugs"}</div>
      {memory.recentSummaries?.length ? (
        <div style={{ marginTop: 8 }}>
          <div style={titleStyle}>最近摘要</div>
          {memory.recentSummaries.map((item) => (
            <div key={item.id || item.title} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)", marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: "var(--text)" }}>{item.title || item.kind || "summary"}</div>
              <div style={{ ...mutedStyle, whiteSpace: "pre-wrap", maxHeight: 70, overflow: "auto" }}>{item.body || "无内容"}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ArtifactFlowView({ artifacts }: { artifacts: ArtifactInfo[] }) {
  return (
    <section style={boxStyle}>
      <div style={titleStyle}>物料流</div>
      {artifacts.length === 0 ? <div style={emptyStyle}>暂无 Agent 产物。项目文件请看左侧「资源 / 物料」。</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {artifacts.map((a) => (
            <div key={a.id} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)", fontSize: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>📄 {a.id}</span><span style={{ color: statusColor(a.status) }}>{a.status}</span></div>
              <div style={mutedStyle}>from {a.producerTaskName || a.producerTaskId}</div>
              {a.consumers?.length ? <div style={mutedStyle}>→ {a.consumers.join(", ")}</div> : null}
            </div>
          ))}
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
      <div style={titleStyle}>Agent 状态</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{task.name}</div>
      <div style={mutedStyle}>Status: {task.status}</div>
      <div style={mutedStyle}>Model: {task.model}</div>
      <div style={mutedStyle}>Skills: {task.skills?.join(", ") || "未记录"}</div>
      {task.promotedProfileSkills?.length ? <div style={mutedStyle}>Promoted: {task.promotedProfileSkills.join(", ")}</div> : null}
      <div style={mutedStyle}>Task Stage: {task.currentTaskStage || "未记录"}{task.needsPlanDiscussion ? " · 仍需方案讨论" : ""}</div>
      <div style={mutedStyle}>Collaboration: {task.collaborationStatus ? formatCollabStatus(task.collaborationStatus) : "未审查"}</div>
      {task.leadDecision && <div style={mutedStyle}>Lead Decision: {task.leadDecision}</div>}
      {task.nextAction && <div style={mutedStyle}>Next: {task.nextAction}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {task.status === "running" ? <button onClick={() => onPause(task.id)} style={btnStyle}>暂停</button> : null}
        {task.status === "paused" ? <button onClick={() => onResume(task.id)} style={btnStyle}>恢复</button> : null}
        {(task.status === "pending" || task.status === "waiting_for_dependency") ? <button onClick={() => onAbort(task.id)} style={btnStyle}>停止</button> : null}
      </div>
      {task.taskStages?.length ? <div style={{ marginTop: 10 }}><div style={titleStyle}>Task Stages</div>{task.taskStages.map((s, i) => <div key={`${s.stage || s.name}-${i}`} style={mutedStyle}>○ {s.stage || s.name} {s.status ? `· ${s.status}` : ""}</div>)}</div> : null}
      {related.length > 0 && <div style={{ marginTop: 10 }}><div style={titleStyle}>Related Artifacts</div>{related.map((a) => <div key={a.id} style={mutedStyle}>📄 {a.id} · {a.status}</div>)}</div>}
      {(task.output || task.delta) && <pre style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto", fontSize: 11, marginTop: 10 }}>{task.output || task.delta}</pre>}
    </section>
  );
}

const boxStyle: React.CSSProperties = { border: "1px solid color-mix(in srgb, var(--border) 82%, transparent)", borderRadius: 10, padding: 10, background: "var(--bg)", marginBottom: 8, boxShadow: "0 1px 2px rgba(15,23,42,0.02)" };
const titleStyle: React.CSSProperties = { fontSize: 12, fontWeight: 750, color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.02em" };
const mutedStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", marginTop: 3 };
const emptyStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, padding: "8px 0" };
const btnStyle: React.CSSProperties = { fontSize: 11, padding: "4px 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", cursor: "pointer" };
const iconBtnStyle: React.CSSProperties = { width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid color-mix(in srgb, var(--border) 88%, transparent)", background: "color-mix(in srgb, var(--bg-secondary) 88%, white 12%)", color: "var(--text-muted)", cursor: "pointer", padding: 0, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" };
function statusColor(status?: string) { return status === "completed" || status === "ready" || status === "accepted" ? "#22c55e" : status === "running" || status === "active" ? "#3b82f6" : status === "debugging" ? "#f59e0b" : status === "error" || status === "blocked" || status === "needs_revision" ? "#ef4444" : status === "paused" || status?.startsWith("waiting") ? "#a855f7" : "var(--text-muted)"; }
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
