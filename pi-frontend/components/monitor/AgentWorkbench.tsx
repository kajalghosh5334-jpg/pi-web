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
  const [availableSkills, setAvailableSkills] = useState<Array<{ id: string; description?: string }>>([]);
  const [input, setInput] = useState("");
  const [lesson, setLesson] = useState("");
  const [saved, setSaved] = useState(false);
  const [promoteName, setPromoteName] = useState("");
  const [promoteDescription, setPromoteDescription] = useState("");
  const [promoteStatus, setPromoteStatus] = useState("");
  const [promoteSkillsStatus, setPromoteSkillsStatus] = useState("");

  useEffect(() => {
    setSkills(task.skills || []);
  }, [task.id, task.skills]);

  useEffect(() => {
    fetch("/api/skills")
      .then((r) => r.json())
      .then((d) => setAvailableSkills(Array.isArray(d.skills) ? d.skills : []))
      .catch(() => setAvailableSkills([]));
  }, []);

  const messages = useMemo(() => {
    const rows: Array<{ role: "system" | "user" | "assistant"; text: string }> = [];
    rows.push({ role: "system", text: `Agent：${task.name}\n模型：${task.model}\n状态：${task.status}\n阶段：${task.currentTaskStage || "未记录"}\n协作：${task.collaborationStatus || "未审查"}` });
    if (task.prompt) rows.push({ role: "user", text: task.prompt });
    if (task.delta && task.status === "running") rows.push({ role: "assistant", text: task.delta });
    if (task.output) rows.push({ role: "assistant", text: task.output });
    if (task.error) rows.push({ role: "assistant", text: `错误：${task.error}` });
    if (task.nextAction) rows.push({ role: "system", text: `Lead 下一步建议：${task.nextAction}` });
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
    const name = window.prompt("Profile 名称", task.profileName || task.profileId);
    if (!name || name === task.profileName) return;
    const result = await onRenameProfile(task.profileId, name).catch(() => ({ ok: false, profile: undefined, error: "rename failed" }));
    setPromoteStatus(result?.ok ? `已更新 Profile 名称：${result.profile?.name || name}` : `重命名失败：${result?.error || "unknown error"}`);
  };

  const promoteProfile = async () => {
    const result = await onPromoteProfile(task.id, {
      name: promoteName.trim() || `${task.name} Profile`,
      description: promoteDescription.trim() || lesson.trim() || undefined,
    }).catch(() => ({ ok: false, profile: undefined, error: "promote failed" }));
    setPromoteStatus(result?.ok
      ? `已升级为 Profile：${result.profile?.name || result.profile?.id || "新 Profile"}`
      : `升级失败：${result?.error || "unknown error"}`);
  };

  const promoteTaskSkills = async (targetSkills?: string[]) => {
    const picked = (targetSkills || skills).filter(Boolean);
    if (!picked.length) {
      setPromoteSkillsStatus("没有可升级的 skills");
      return;
    }
    const result = await onPromoteTaskSkills(task.id, picked).catch(() => ({ ok: false, error: "promote skills failed" }));
    const promoted = result && typeof result === "object" && "skills" in result && Array.isArray(result.skills) ? result.skills : picked;
    setPromoteSkillsStatus(result?.ok
      ? `已升级为 Profile 自带：${promoted.join(", ")}`
      : `升级失败：${result?.error || "unknown error"}`);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={btnStyle}>← 主对话</button>
          <div>
            <div style={{ fontWeight: 700 }}>{task.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{task.model} · {task.status}</div>
          </div>
        </div>
        <button onClick={() => onRerun(task.id, { skills })} style={btnStyle}>重跑</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-secondary)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><strong style={{ color: "var(--text)" }}>Profile</strong>: {task.profileName || task.profileId || "未记录"}{task.profileId && onRenameProfile ? <button onClick={renameCurrentProfile} style={btnStyle}>编辑名称</button> : null}</div>
          <div><strong style={{ color: "var(--text)" }}>本次激活 Skills</strong>: {task.skills?.join(", ") || "无"}</div>
          <div><strong style={{ color: "var(--text)" }}>Profile 固定 Skills</strong>: {task.profileSkills?.join(", ") || "无"}</div>
          {task.promotedProfileSkills?.length ? <div><strong style={{ color: "var(--text)" }}>已升为自带</strong>: {task.promotedProfileSkills.join(", ")}</div> : null}
          <div><strong style={{ color: "var(--text)" }}>Profile 可选技能池</strong>: {task.profileAvailableSkills?.join(", ") || "无"}</div>
          <div><strong style={{ color: "var(--text)" }}>项目配置</strong>: {task.profileProjectConfig ? JSON.stringify(task.profileProjectConfig) : "无"}</div>
          {task.profileSavedExperiences?.length ? <div><strong style={{ color: "var(--text)" }}>最近经验</strong>: {task.profileSavedExperiences.slice(0, 2).map((item) => item.lesson || item.taskName || "经验").join(" / ")}</div> : null}
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
            <button key={skill.id} title={skill.description || skill.id} onClick={() => toggleSkill(skill.id)} style={{ ...chipStyle, borderColor: skills.includes(skill.id) ? "#3b82f6" : "var(--border)", color: skills.includes(skill.id) ? "#3b82f6" : "var(--text-muted)", background: skills.includes(skill.id) ? "#3b82f622" : "transparent" }}>{skill.id}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="像主对话一样给这个 Agent 下调试指令；Enter 重跑，Shift+Enter 换行"
            style={{ flex: 1, minHeight: 52, maxHeight: 160, resize: "vertical", padding: 10, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
          <button onClick={send} style={{ ...btnStyle, padding: "10px 14px" }}>发送给Agent</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
          <div>临时装配的 skills 可以沉淀回当前 Profile。</div>
          <button onClick={() => void promoteTaskSkills()} style={btnStyle}>升级本次 Skills 为自带</button>
        </div>
        {promoteSkillsStatus ? <div style={{ marginTop: 6, fontSize: 12, color: promoteSkillsStatus.startsWith("已升级") ? "#22c55e" : "#ef4444" }}>{promoteSkillsStatus}</div> : null}
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>保存经验到 profile</summary>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <textarea value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="总结这个 Agent 的做事方式、适用任务和推荐 skill" style={{ flex: 1, minHeight: 60, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
            <button onClick={saveExperience} style={btnStyle}>保存</button>
          </div>
          {saved && <div style={{ marginTop: 6, fontSize: 12, color: "#22c55e" }}>已保存。</div>}
        </details>
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>升级为新 Profile</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <input value={promoteName} onChange={(e) => setPromoteName(e.target.value)} placeholder={`${task.name} Profile`} style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
            <textarea value={promoteDescription} onChange={(e) => setPromoteDescription(e.target.value)} placeholder="说明这个 Profile 什么时候该用；如果这是 coach 后确认的结果，这里写你的确认说明" style={{ minHeight: 64, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>单 Agent 会话可直接升级；coach 后由用户点这一下，等于确认可升级。</div>
              <button onClick={promoteProfile} style={btnStyle}>升级为 Profile</button>
            </div>
            {promoteStatus ? <div style={{ fontSize: 12, color: promoteStatus.startsWith("已升级") ? "#22c55e" : "#ef4444" }}>{promoteStatus}</div> : null}
          </div>
        </details>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = { border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12 };
const chipStyle: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 999, padding: "4px 8px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" };
