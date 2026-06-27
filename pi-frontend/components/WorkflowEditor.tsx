"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkflowDefinition, WorkflowTaskDefinition } from "@/lib/types";

export function WorkflowEditor({
  workflow,
  onBack,
  onChange,
  onDeleted,
  onRan,
}: {
  workflow: WorkflowDefinition;
  onBack?: () => void;
  onChange?: (workflow: WorkflowDefinition) => void;
  onDeleted?: (workflowId: string) => void;
  onRan?: (sessionId: string, cwd: string) => void;
}) {
  const [draft, setDraft] = useState<WorkflowDefinition>(workflow);
  const [busy, setBusy] = useState<"save" | "run" | "delete" | null>(null);
  const [profiles, setProfiles] = useState<Array<{ id: string; name?: string }>>([]);
  const [skills, setSkills] = useState<Array<{ id: string; description?: string }>>([]);

  useEffect(() => {
    setDraft({
      ...workflow,
      tasks: (workflow.tasks || []).map((task) => ({ ...task, deps: [...(task.deps || [])] })),
    });
  }, [workflow]);

  useEffect(() => {
    fetch("/api/agent-profiles")
      .then((r) => r.json())
      .then((data) => setProfiles(Array.isArray(data?.profiles) ? data.profiles : []))
      .catch(() => setProfiles([]));
  }, []);

  useEffect(() => {
    const cwd = encodeURIComponent(draft.cwd || "");
    fetch(`/api/skills?cwd=${cwd}`)
      .then((r) => r.json())
      .then((data) => setSkills(Array.isArray(data?.skills) ? data.skills.map((skill: { name: string; description?: string }) => ({ id: skill.name, description: skill.description })) : []))
      .catch(() => setSkills([]));
  }, [draft.cwd]);

  const profileOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const profile of profiles) {
      map.set(profile.id, profile.name || profile.id);
    }
    if (draft.leadProfileId) map.set(draft.leadProfileId, map.get(draft.leadProfileId) || draft.leadProfileId);
    for (const task of draft.tasks || []) {
      if (task.profileId) map.set(task.profileId, map.get(task.profileId) || task.profileId);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [profiles, draft.leadProfileId, draft.tasks]);

  const updateDraft = (patch: Partial<WorkflowDefinition>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const updateTask = (index: number, patch: Partial<WorkflowTaskDefinition>) => {
    setDraft((prev) => {
      const tasks = [...(prev.tasks || [])];
      tasks[index] = { ...(tasks[index] || {}), ...patch };
      return { ...prev, tasks };
    });
  };

  const addTask = () => {
    setDraft((prev) => ({
      ...prev,
      tasks: [
        ...(prev.tasks || []),
        { id: `task-${(prev.tasks?.length || 0) + 1}`, name: "", profileId: "", deps: [] },
      ],
    }));
  };

  const removeTask = (index: number) => {
    setDraft((prev) => ({ ...prev, tasks: (prev.tasks || []).filter((_, i) => i !== index) }));
  };

  const save = async () => {
    setBusy("save");
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.workflow) {
        alert(data?.error || "Workflow 保存失败");
        return;
      }
      onChange?.(data.workflow);
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    setBusy("run");
    try {
      const input = window.prompt("本次 workflow 目标", draft.description || draft.name || "运行工作流");
      if (input === null) return;
      const res = await fetch(`/api/workflows/${encodeURIComponent(draft.id)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, cwd: draft.cwd || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sessionId) {
        alert(data?.error || "Workflow 运行失败");
        return;
      }
      onRan?.(data.sessionId, draft.cwd || "");
    } finally {
      setBusy(null);
    }
  };

  const removeWorkflow = async () => {
    if (!window.confirm(`Delete workflow: ${draft.name}?`)) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Workflow 删除失败");
        return;
      }
      onDeleted?.(draft.id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--bg)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 10, borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {onBack ? <button onClick={onBack} style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, padding: 0 }}>← 返回</button> : null}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{draft.name || "未命名 Workflow"}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{draft.tasks?.length || 0} tasks · {draft.reviewPolicy || "lead_plus_reviewer"}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={removeWorkflow} disabled={busy !== null} style={buttonStyle("danger")}>{busy === "delete" ? "删除中..." : "删除"}</button>
            <button onClick={run} disabled={busy !== null} style={buttonStyle()}>{busy === "run" ? "运行中..." : "Run"}</button>
            <button onClick={save} disabled={busy !== null} style={buttonStyle("primary")}>{busy === "save" ? "保存中..." : "Save"}</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 12 }}>
            <section style={panelStyle}>
              <div style={panelTitleStyle}>Workflow 设置</div>
              <div style={{ display: "grid", gap: 10 }}>
                <Field label="名称">
                  <input value={draft.name || ""} onChange={(e) => updateDraft({ name: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="描述">
                  <textarea value={draft.description || ""} onChange={(e) => updateDraft({ description: e.target.value })} style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Lead Profile">
                    <select value={draft.leadProfileId || "lead-agent"} onChange={(e) => updateDraft({ leadProfileId: e.target.value })} style={inputStyle}>
                      {profileOptions.map((profile) => (
                        <option key={profile.id} value={profile.id}>{profile.name} · {profile.id}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Review Policy">
                    <select value={draft.reviewPolicy || "lead_plus_reviewer"} onChange={(e) => updateDraft({ reviewPolicy: e.target.value as WorkflowDefinition["reviewPolicy"] })} style={inputStyle}>
                      <option value="lead_plus_reviewer">lead_plus_reviewer</option>
                      <option value="lead_only">lead_only</option>
                    </select>
                  </Field>
                </div>
                <Field label="工作目录">
                  <input value={draft.cwd || ""} onChange={(e) => updateDraft({ cwd: e.target.value })} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} />
                </Field>
              </div>
            </section>

            <section style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <div style={panelTitleStyle}>任务节点</div>
                <button onClick={addTask} style={buttonStyle()}>+ 任务</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(draft.tasks || []).map((task, index) => (
                  <div key={`${draft.id}-task-${index}`} style={{ border: "1px solid color-mix(in srgb, var(--border) 70%, transparent)", borderRadius: 12, padding: 12, background: "color-mix(in srgb, var(--bg-secondary) 65%, transparent)", display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{task.name || task.id || `任务 ${index + 1}`}</div>
                      <button onClick={() => removeTask(index)} style={buttonStyle("danger")}>删除</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <Field label="Task ID">
                        <input value={task.id || ""} onChange={(e) => updateTask(index, { id: e.target.value })} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} />
                      </Field>
                      <Field label="任务名">
                        <input value={task.name || ""} onChange={(e) => updateTask(index, { name: e.target.value })} style={inputStyle} />
                      </Field>
                    </div>
                    <Field label="Profile">
                      <select value={task.profileId || ""} onChange={(e) => updateTask(index, { profileId: e.target.value })} style={inputStyle}>
                        <option value="">选择 Profile</option>
                        {profileOptions.map((profile) => (
                          <option key={profile.id} value={profile.id}>{profile.name} · {profile.id}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Skills">
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {skills.map((skill) => {
                          const active = (task.skills || []).includes(skill.id);
                          return (
                            <button
                              key={`${task.id || index}-${skill.id}`}
                              type="button"
                              title={skill.description || skill.id}
                              onClick={() => updateTask(index, { skills: active ? (task.skills || []).filter((item) => item !== skill.id) : [...(task.skills || []), skill.id] })}
                              style={{
                                border: `1px solid ${active ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
                                background: active ? "rgba(59,130,246,0.08)" : "var(--bg)",
                                color: "var(--text)",
                                borderRadius: 999,
                                padding: "5px 10px",
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              {skill.id}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                    <Field label="依赖任务（逗号分隔 task id）">
                      <input value={(task.deps || []).join(", ")} onChange={(e) => updateTask(index, { deps: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} />
                    </Field>
                  </div>
                ))}
                {(draft.tasks || []).length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>还没有任务，点右上角「+ 任务」开始搭节点。</div> : null}
              </div>
            </section>
          </div>

          <div style={{ display: "grid", gap: 12, position: "sticky", top: 82 }}>
            <section style={panelStyle}>
              <div style={panelTitleStyle}>节点预览</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(draft.tasks || []).map((task, index) => (
                  <div key={`preview-${draft.id}-${index}`} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--bg-secondary)" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{task.name || task.id || `任务 ${index + 1}`}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>Profile: {task.profileId || "—"}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)" }}>Skills: {(task.skills || []).length ? (task.skills || []).join(", ") : "无"}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)" }}>Deps: {(task.deps || []).length ? (task.deps || []).join(", ") : "无"}</div>
                  </div>
                ))}
                {(draft.tasks || []).length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>这里会显示 workflow 节点摘要。</div> : null}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 14,
  background: "var(--bg)",
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 10,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
};

function buttonStyle(kind: "default" | "primary" | "danger" = "default"): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: kind === "danger" ? "1px solid rgba(239,68,68,0.28)" : "1px solid var(--border)",
    background: kind === "primary" ? "var(--bg-secondary)" : "var(--bg)",
    color: kind === "danger" ? "#ef4444" : "var(--text)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  };
}
