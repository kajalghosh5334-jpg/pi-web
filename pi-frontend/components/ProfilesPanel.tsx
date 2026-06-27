"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface AgentProfileItem {
  id: string;
  name?: string;
  defaultModel?: string;
  match?: string[];
  skills?: string[];
  availableSkills?: string[];
  collaborationProtocol?: string;
  systemPromptPatch?: string;
}

export function ProfilesPanel({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<AgentProfileItem[]>([]);
  const [skills, setSkills] = useState<Array<{ id: string; description?: string }>>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openModelId, setOpenModelId] = useState<string | null>(null);
  const [openSkillKey, setOpenSkillKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [profilesRes, skillsRes] = await Promise.all([
      fetch("/api/agent-profiles"),
      fetch("/api/skills"),
    ]);
    const profilesData = await profilesRes.json().catch(() => ({}));
    const skillsData = await skillsRes.json().catch(() => ({}));
    setProfiles(Array.isArray(profilesData.profiles) ? profilesData.profiles : []);
    setSkills(Array.isArray(skillsData.skills) ? skillsData.skills : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const skillMap = useMemo(() => new Map(skills.map((skill) => [skill.id, skill.description || "暂无说明"])), [skills]);

  const rename = async (profile: AgentProfileItem) => {
    const name = window.prompt("Profile 名称", profile.name || profile.id);
    if (!name || name === profile.name) return;
    setBusyId(profile.id);
    try {
      const res = await fetch(`/api/agent-profiles/${encodeURIComponent(profile.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Profile 重命名失败");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.32)", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: 860, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 64px)", overflow: "auto", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Profile 管理</div>
          <button onClick={onClose} style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}>关闭</button>
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {profiles.map((profile) => {
            const equippedSkills = profile.skills || [];
            const availableSkills = (profile.availableSkills || []).filter((skill) => !equippedSkills.includes(skill));
            const intro = profile.collaborationProtocol || profile.systemPromptPatch || profile.match?.join(" / ") || "暂无介绍";
            return (
              <div key={profile.id} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{profile.name || profile.id}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>ID: {profile.id}</div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.6 }}>{intro}</div>
                  </div>
                  <button onClick={() => void rename(profile)} disabled={busyId === profile.id} style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>{busyId === profile.id ? "保存中..." : "编辑名称"}</button>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>模型</div>
                    <button
                      onClick={() => setOpenModelId((id) => id === profile.id ? null : profile.id)}
                      style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", borderRadius: 999, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}
                    >
                      {profile.defaultModel || "未配置模型"}
                    </button>
                    {openModelId === profile.id && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                        这是这个 Profile 的默认模型。Lead / Workflow / 运行时任务可以覆盖它；不覆盖时默认按这里走。
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>装配 Skills</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {equippedSkills.length === 0 ? <span style={{ fontSize: 12, color: "var(--text-dim)" }}>无</span> : equippedSkills.map((skill) => {
                        const key = `${profile.id}:equipped:${skill}`;
                        return (
                          <button key={key} onClick={() => setOpenSkillKey((prev) => prev === key ? null : key)} style={chipStyle(true)}>{skill}</button>
                        );
                      })}
                    </div>
                    {equippedSkills.map((skill) => {
                      const key = `${profile.id}:equipped:${skill}`;
                      return openSkillKey === key ? <div key={`${key}:detail`} style={skillDetailStyle}>[{skill}] {skillMap.get(skill) || "暂无说明"}</div> : null;
                    })}
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>可选 Skills</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {availableSkills.length === 0 ? <span style={{ fontSize: 12, color: "var(--text-dim)" }}>无</span> : availableSkills.map((skill) => {
                        const key = `${profile.id}:available:${skill}`;
                        return (
                          <button key={key} onClick={() => setOpenSkillKey((prev) => prev === key ? null : key)} style={chipStyle(false)}>{skill}</button>
                        );
                      })}
                    </div>
                    {availableSkills.map((skill) => {
                      const key = `${profile.id}:available:${skill}`;
                      return openSkillKey === key ? <div key={`${key}:detail`} style={skillDetailStyle}>[{skill}] {skillMap.get(skill) || "暂无说明"}</div> : null;
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function chipStyle(equipped: boolean): React.CSSProperties {
  return {
    border: `1px solid ${equipped ? "rgba(59,130,246,0.28)" : "var(--border)"}`,
    background: equipped ? "rgba(59,130,246,0.08)" : "var(--bg)",
    color: "var(--text)",
    borderRadius: 999,
    padding: "5px 10px",
    cursor: "pointer",
    fontSize: 12,
  };
}

const skillDetailStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "var(--text-dim)",
  lineHeight: 1.6,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-secondary)",
};
