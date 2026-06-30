"use client";
import { useState } from "react";
import type React from "react";
import type { AgentTask, ArtifactInfo, PendingConfirmation } from "@/hooks/useOrchestrate";

const AVAILABLE_MODELS = [
  "opencode-go/glm-5.2",
  "opencode-go/glm-5.1",
  "opencode-go/deepseek-v4-flash",
  "opencode-go/deepseek-v4-pro",
  "opencode-go/qwen3.7-plus",
];

const STATUS_COLOR: Record<AgentTask["status"], string> = {
  pending: "#888",
  queued: "#94a3b8",
  waiting_for_dependency: "#f59e0b",
  running: "#3b82f6",
  waiting_confirmation: "#f97316",
  completed: "#22c55e",
  incomplete: "#fb923c",
  blocked: "#ef4444",
  error: "#ef4444",
  aborted: "#64748b",
  paused: "#a855f7",
};

const STATUS_ICON: Record<AgentTask["status"], string> = {
  pending: "⏸",
  queued: "…",
  waiting_for_dependency: "⏳",
  running: "⟳",
  waiting_confirmation: "❓",
  completed: "✓",
  incomplete: "!",
  blocked: "!",
  error: "✗",
  aborted: "■",
  paused: "⏸",
};

interface Props {
  tasks?: AgentTask[];
  phase?: string;
  artifacts?: ArtifactInfo[];
  onSwitchModel?: (taskId: string, model: string) => void;
  onAbortTask?: (taskId: string) => void;
  onPauseTask?: (taskId: string) => void;
  onResumeTask?: (taskId: string) => void;
  onRerunTask?: (taskId: string) => void;
  onOpenTask?: (taskId: string) => void;
  pendingConfirmation?: PendingConfirmation | null;
  onConfirm?: (decision?: string, note?: string) => void;
}

export function SubAgentList({ tasks = [], artifacts = [], phase = "idle", onSwitchModel = () => {}, onAbortTask = () => {}, onPauseTask = () => {}, onResumeTask = () => {}, onRerunTask = () => {}, onOpenTask = () => {}, pendingConfirmation = null, onConfirm = () => {} }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  if (phase === "idle") return (
    <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
      发送消息后，Multi-Agent 状态将显示在这里
    </div>
  );

  if (phase === "guardian") return (
    <div style={{ fontSize: 12, color: "#f59e0b", padding: "8px 0" }}>
      🧠 Guardian 分析任务中...
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
        {phase === "synthesizing" ? "⚡ 整合结果中..." : phase === "done" ? "✅ 全部完成" : `${tasks.filter(t => t.status === "completed").length}/${tasks.length} 完成`}
      </div>

      {pendingConfirmation && (
        <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, border: "1px solid #f9731644", background: "#f9731611", fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "#f97316", marginBottom: 6 }}>⏸ 需要用户确认</div>
          <div style={{ marginBottom: 4 }}>{pendingConfirmation.question}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 4 }}>选项：{pendingConfirmation.options}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 8 }}>建议：{pendingConfirmation.recommendation}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onConfirm("confirm")} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #22c55e55", background: "#22c55e22", color: "#22c55e", cursor: "pointer" }}>确认继续</button>
            <button onClick={() => onConfirm("stop")} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #ef444455", background: "#ef444422", color: "#ef4444", cursor: "pointer" }}>停止 DAG</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tasks.map((task) => {
          const heartbeatText = formatHeartbeat(task);
          return (
          <div key={task.id}>
            <div
              onClick={() => setExpanded(expanded === task.id ? null : task.id)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: `1px solid ${STATUS_COLOR[task.status]}44`,
                background: `${STATUS_COLOR[task.status]}11`,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 500 }}>{task.name}</span>
                <span style={{ color: STATUS_COLOR[task.status] }}>
                  {STATUS_ICON[task.status]} {task.status === "running" ? "" : task.status}
                </span>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>
                {task.model.split("/")[1]}{task.currentTaskStage ? ` · ${task.currentTaskStage}` : ""}{task.needsPlanDiscussion ? " · 方案讨论" : ""}
              </div>
              {heartbeatText && (
                <div style={heartbeatStyle}>
                  <span style={heartbeatDotStyle} />
                  {heartbeatText}
                </div>
              )}
              {task.status === "running" && task.delta && (
                <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8", maxHeight: 36, overflow: "hidden" }}>
                  {task.delta.slice(-120)}
                </div>
              )}
            </div>

            {/* Expanded detail panel */}
            {expanded === task.id && (
              <div style={{
                marginTop: 2,
                padding: 10,
                borderRadius: 6,
                background: "var(--bg-secondary)",
                fontSize: 11,
                border: "1px solid var(--border)",
              }}>
                {/* Model switcher */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ color: "var(--text-muted)" }}>模型：</span>
                  {switching === task.id ? (
                    <select
                      autoFocus
                      defaultValue={task.model}
                      onBlur={() => setSwitching(null)}
                      onChange={(e) => { onSwitchModel(task.id, e.target.value); setSwitching(null); }}
                      style={{ fontSize: 11, padding: "2px 4px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)" }}
                    >
                      {AVAILABLE_MODELS.map((m) => <option key={m} value={m}>{m.split("/")[1]}</option>)}
                    </select>
                  ) : (
                    <span
                      onClick={(e) => { e.stopPropagation(); setSwitching(task.id); }}
                      style={{ color: "#3b82f6", cursor: "pointer", textDecoration: "underline" }}
                    >
                      {task.model.split("/")[1]} ✏️
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <button onClick={() => onAbortTask(task.id)} disabled={task.status !== "running"} style={{ fontSize: 11, padding: "3px 7px", borderRadius: 5, border: "1px solid #ef444455", background: "#ef444422", color: task.status === "running" ? "#ef4444" : "#64748b", cursor: task.status === "running" ? "pointer" : "not-allowed" }}>停止</button>
                  <button onClick={() => onPauseTask(task.id)} disabled={task.status !== "running"} style={{ fontSize: 11, padding: "3px 7px", borderRadius: 5, border: "1px solid #a855f755", background: "#a855f722", color: task.status === "running" ? "#a855f7" : "#64748b", cursor: task.status === "running" ? "pointer" : "not-allowed" }}>暂停</button>
                  <button onClick={() => onResumeTask(task.id)} disabled={task.status !== "paused"} style={{ fontSize: 11, padding: "3px 7px", borderRadius: 5, border: "1px solid #22c55e55", background: "#22c55e22", color: task.status === "paused" ? "#22c55e" : "#64748b", cursor: task.status === "paused" ? "pointer" : "not-allowed" }}>恢复</button>
                  <button onClick={() => onRerunTask(task.id)} style={{ fontSize: 11, padding: "3px 7px", borderRadius: 5, border: "1px solid #3b82f655", background: "#3b82f622", color: "#3b82f6", cursor: "pointer" }}>重跑</button>
                  <button onClick={() => onOpenTask(task.id)} style={{ fontSize: 11, padding: "3px 7px", borderRadius: 5, border: "1px solid #22c55e55", background: "#22c55e22", color: "#22c55e", cursor: "pointer" }}>进入调试</button>
                </div>
                {task.skills && task.skills.length > 0 && (
                  <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>Skills: {task.skills.join(", ")}</div>
                )}

                {/* Output preview */}
                {(task.output || task.delta) && (
                  <div style={{
                    maxHeight: 200,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    color: "var(--text)",
                    lineHeight: 1.5,
                  }}>
                    {task.output || task.delta}
                  </div>
                )}
                {!task.output && !task.delta && (
                  <span style={{ color: "var(--text-muted)" }}>{heartbeatText || "等待执行..."}</span>
                )}
              </div>
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}

const heartbeatStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11, color: "#3b82f6", padding: "4px 6px", borderRadius: 6, border: "1px solid #3b82f633", background: "#3b82f611" };
const heartbeatDotStyle: React.CSSProperties = { width: 7, height: 7, borderRadius: 999, background: "#3b82f6", boxShadow: "0 0 0 3px #3b82f622", flexShrink: 0 };

function formatHeartbeat(task?: AgentTask | null) {
  if (!task || task.status !== "running" || !task.heartbeat) return "";
  const elapsedMs = typeof task.heartbeat.elapsedMs === "number"
    ? task.heartbeat.elapsedMs
    : task.heartbeat.startedAt ? Date.now() - task.heartbeat.startedAt : 0;
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const label = task.heartbeat.message || (task.heartbeat.phase === "receiving_model_output" ? "模型正在返回内容" : "等待模型返回");
  return `${label}${seconds ? ` · ${seconds}s` : ""}`;
}
