"use client";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import type { AgentTask } from "@/hooks/useOrchestrate";

interface Props {
  task: AgentTask;
  sessionId?: string | null;
  onBack: () => void;
  onRerun: (taskId: string, options?: { skills?: string[]; promptAppend?: string }) => void;
  onPromoteProfile: (taskId: string, options?: { name?: string; description?: string }) => Promise<{ ok?: boolean; profile?: { id?: string; name?: string }; error?: string }>;
  onPromoteTaskSkills: (taskId: string, skills?: string[]) => Promise<{ ok?: boolean; profile?: { id?: string; name?: string; skills?: string[] }; skills?: string[]; error?: string }>;
  onRenameProfile?: (profileId: string, name: string) => Promise<{ ok?: boolean; profile?: { id?: string; name?: string }; error?: string }>;
}

export function AgentWorkbench({ task, sessionId, onBack, onRerun, onPromoteProfile, onPromoteTaskSkills, onRenameProfile }: Props) {
  const [skills, setSkills] = useState<string[]>(task.skills || []);
  const [availableSkills, setAvailableSkills] = useState<Array<{ name: string; description?: string }>>([]);
  const [input, setInput] = useState("");
  const [lesson, setLesson] = useState("");
  const [saved, setSaved] = useState(false);
  const [promoteName, setPromoteName] = useState("");
  const [promoteDescription, setPromoteDescription] = useState("");
  const [promoteStatus, setPromoteStatus] = useState("");
  const [promoteSkillsStatus, setPromoteSkillsStatus] = useState("");
  const [renamingProfile, setRenamingProfile] = useState(false);
  const [renameValue, setRenameValue] = useState(task.profileName || task.profileId || "");
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(() => {
    setSkills(task.skills || []);
  }, [task.id, task.skills]);

  useEffect(() => {
    setRenamingProfile(false);
    setRenameValue(task.profileName || task.profileId || "");
  }, [task.id, task.profileId, task.profileName]);

  useEffect(() => {
    fetch("/api/skills")
      .then((r) => r.json())
      .then((d) => setAvailableSkills(Array.isArray(d.skills) ? d.skills : []))
      .catch(() => setAvailableSkills([]));
  }, []);

  const messages = useMemo(() => {
    const rows: Array<{ role: "system" | "user" | "assistant"; text: string }> = [];
    rows.push({ role: "system", text: `Agent: ${task.name}\nModel: ${task.model}\nStatus: ${task.status}\nStage: ${task.currentTaskStage || "N/A"}\nCollab: ${task.collaborationStatus || "N/A"}` });
    if (task.prompt) rows.push({ role: "user", text: task.prompt });
    if (task.delta && task.status === "running") rows.push({ role: "assistant", text: task.delta });
    if (task.output) rows.push({ role: "assistant", text: task.output });
    if (task.error) rows.push({ role: "assistant", text: `Error: ${task.error}` });
    if (task.nextAction) rows.push({ role: "system", text: `Lead suggestion: ${task.nextAction}` });
    return rows;
  }, [task]);

  const toggleSkill = (skill: string) => {
    setSkills((prev) => prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]);
  };

  const send = () => {
    const promptAppend = input.trim();
    if (!promptAppend) return;
    onRerun(task.id, { skills, promptAppend });
    setInput("");
  };

  const saveExperience = async () => {
    if (!sessionId) return;
    await fetch(`/api/subagents/${task.id}/save-experience`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, skills, lesson }),
    }).catch(() => {});
    setSaved(true);
  };

  const renameCurrentProfile = async () => {
    if (!task.profileId || !onRenameProfile) return;
    const name = renameValue.trim();
    if (!name || name === (task.profileName || task.profileId)) {
      setRenamingProfile(false);
      return;
    }
    setRenameBusy(true);
    const result = await onRenameProfile(task.profileId, name).catch(() => ({ ok: false, profile: undefined, error: "rename failed" }));
    setRenameBusy(false);
    setRenamingProfile(false);
    setPromoteStatus(result?.ok ? `Profile name updated: ${result.profile?.name || name}` : `Rename failed: ${result?.error || "unknown error"}`);
  };

  const promoteProfile = async () => {
    const result = await onPromoteProfile(task.id, {
      name: promoteName.trim() || `${task.name} Profile`,
      description: promoteDescription.trim() || lesson.trim() || undefined,
    }).catch(() => ({ ok: false, profile: undefined, error: "promote failed" }));
    setPromoteStatus(result?.ok
      ? `Promoted to Profile: ${result.profile?.name || result.profile?.id || "New Profile"}`
      : `Promotion failed: ${result?.error || "unknown error"}`);
  };

  const promoteTaskSkills = async (targetSkills?: string[]) => {
    const picked = (targetSkills || skills).filter(Boolean);
    if (!picked.length) {
      setPromoteSkillsStatus("No skills to promote");
      return;
    }
    const result = await onPromoteTaskSkills(task.id, picked).catch(() => ({ ok: false, error: "promote skills failed" }));
    const promoted = result && typeof result === "object" && "skills" in result && Array.isArray(result.skills) ? result.skills : picked;
    setPromoteSkillsStatus(result?.ok
      ? `Promoted to profile defaults: ${promoted.join(", ")}`
      : `Promotion failed: ${result?.error || "unknown error"}`);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={btnStyle}>← Main</button>
          <div>
            <div style={{ fontWeight: 700 }}>{task.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{task.model} · {task.status}</div>
          </div>
        </div>
        <button onClick={() => onRerun(task.id, { skills })} style={btnStyle}>Rerun</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-secondary)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ color: "var(--text)" }}>Profile</strong>:
            {renamingProfile ? (
              <>
                <input
                  value={renameValue}
                  autoFocus
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void renameCurrentProfile();
                    if (event.key === "Escape") {
                      setRenameValue(task.profileName || task.profileId || "");
                      setRenamingProfile(false);
                    }
                  }}
                  style={{ minWidth: 220, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", padding: "0 9px", fontSize: 12 }}
                />
                <button onClick={() => void renameCurrentProfile()} disabled={renameBusy} style={btnStyle}>{renameBusy ? "Saving..." : "Save"}</button>
                <button
                  onClick={() => {
                    setRenameValue(task.profileName || task.profileId || "");
                    setRenamingProfile(false);
                  }}
                  disabled={renameBusy}
                  style={btnStyle}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span>{task.profileName || task.profileId || "N/A"}</span>
                {task.profileId && onRenameProfile ? <button onClick={() => setRenamingProfile(true)} style={btnStyle}>Rename</button> : null}
              </>
            )}
          </div>
          <div><strong style={{ color: "var(--text)" }}>Active Skills</strong>: {task.skills?.join(", ") || "None"}</div>
          <div><strong style={{ color: "var(--text)" }}>Profile Skills</strong>: {task.profileSkills?.join(", ") || "None"}</div>
          {task.promotedProfileSkills?.length ? <div><strong style={{ color: "var(--text)" }}>Promoted</strong>: {task.promotedProfileSkills.join(", ")}</div> : null}
          <div><strong style={{ color: "var(--text)" }}>Available Skills</strong>: {task.profileAvailableSkills?.join(", ") || "None"}</div>
          <div><strong style={{ color: "var(--text)" }}>Project Config</strong>: {task.profileProjectConfig ? JSON.stringify(task.profileProjectConfig) : "None"}</div>
          <div><strong style={{ color: "var(--text)" }}>Definition of Done</strong>: {task.definitionOfDone || "Not recorded"}</div>
          <div><strong style={{ color: "var(--text)" }}>Acceptance</strong>: {task.acceptanceCriteria?.length ? task.acceptanceCriteria.join(" / ") : "Not recorded"}</div>
          <div><strong style={{ color: "var(--text)" }}>Budget</strong>: {task.budget ? JSON.stringify(task.budget) : "Default"}</div>
          {task.lastProgressStage ? <div><strong style={{ color: "var(--text)" }}>Last Checkpoint</strong>: {task.lastProgressStage}</div> : null}
          {task.completionGate ? <div><strong style={{ color: "var(--text)" }}>Completion Gate</strong>: {task.completionGate.status}{task.completionGate.issues?.length ? ` · ${task.completionGate.issues.join(", ")}` : ""}</div> : null}
          {task.profileSavedExperiences?.length ? <div><strong style={{ color: "var(--text)" }}>Recent Experience</strong>: {task.profileSavedExperiences.slice(0, 2).map((item) => item.lesson || item.taskName || "experience").join(" / ")}</div> : null}
        </div>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "78%", whiteSpace: "pre-wrap", lineHeight: 1.55, fontSize: 14, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: m.role === "user" ? "#3b82f622" : m.role === "system" ? "var(--bg-secondary)" : "var(--bg-panel)" }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: 12 }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
          {availableSkills.map((skill) => (
            <button key={skill.name} title={skill.description || skill.name} onClick={() => toggleSkill(skill.name)} style={{ ...chipStyle, borderColor: skills.includes(skill.name) ? "#3b82f6" : "var(--border)", color: skills.includes(skill.name) ? "#3b82f6" : "var(--text-muted)", background: skills.includes(skill.name) ? "#3b82f622" : "transparent" }}>{skill.name}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Send debug instructions like a main chat. Enter to rerun, Shift+Enter newline."
            style={{ flex: 1, minHeight: 52, maxHeight: 160, resize: "vertical", padding: 10, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
          <button onClick={send} style={{ ...btnStyle, padding: "10px 14px" }}>Send to Agent</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
          <div>Assembled skills can be persisted back to the current Profile.</div>
          <button onClick={() => void promoteTaskSkills()} style={btnStyle}>Promote Skills</button>
        </div>
        {promoteSkillsStatus ? <div style={{ marginTop: 6, fontSize: 12, color: promoteSkillsStatus.startsWith("Promoted") ? "#22c55e" : "#ef4444" }}>{promoteSkillsStatus}</div> : null}
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>Save experience to profile</summary>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <textarea value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="Summarize this agent's approach, applicable tasks, and recommended skills." style={{ flex: 1, minHeight: 60, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
            <button onClick={saveExperience} style={btnStyle}>Save</button>
          </div>
          {saved && <div style={{ marginTop: 6, fontSize: 12, color: "#22c55e" }}>Saved.</div>}
        </details>
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>Promote to new Profile</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <input value={promoteName} onChange={(e) => setPromoteName(e.target.value)} placeholder={`${task.name} Profile`} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
            <textarea value={promoteDescription} onChange={(e) => setPromoteDescription(e.target.value)} placeholder="Describe when this Profile should be used. If confirmed after coaching, note the confirmation." style={{ minHeight: 64, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Single-agent sessions can promote directly. After coaching, this confirms the promotion.</div>
              <button onClick={promoteProfile} style={btnStyle}>Promote</button>
            </div>
            {promoteStatus ? <div style={{ fontSize: 12, color: promoteStatus.startsWith("Promoted") ? "#22c55e" : "#ef4444" }}>{promoteStatus}</div> : null}
          </div>
        </details>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = { border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12 };
const chipStyle: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 999, padding: "4px 8px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" };
