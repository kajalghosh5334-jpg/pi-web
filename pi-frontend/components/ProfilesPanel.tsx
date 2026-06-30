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
  projectConfig?: {
    domain?: string;
    pattern?: string;
    modelTier?: string;
    roleInWorkflow?: string;
    roleInWeakStrongWorkflow?: string;
  };
}

const PROFILE_GROUP_LABELS: Record<string, string> = {
  "self-media": "自媒体",
  research: "行业调研",
  ecommerce: "电商",
  "customer-support": "客服",
  sales: "电话销售",
  weak: "弱模型通用",
  strong: "强模型通用",
  pattern: "通用 Workflow 节点",
  system: "系统与工程",
};

const PROFILE_GROUP_ORDER = ["self-media", "research", "ecommerce", "customer-support", "sales", "weak", "strong", "pattern", "system"];

function profileGroupKey(profile: AgentProfileItem): string {
  if (profile.projectConfig?.domain) return profile.projectConfig.domain;
  if (profile.projectConfig?.pattern) return "pattern";
  if (profile.projectConfig?.modelTier === "weak") return "weak";
  if (profile.projectConfig?.modelTier === "strong") return "strong";
  return "system";
}

function profileGroupLabel(group: string): string {
  return PROFILE_GROUP_LABELS[group] || group || "未分类";
}

export function ProfilesPanel({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<AgentProfileItem[]>([]);
  const [skills, setSkills] = useState<Array<{ id: string; description?: string }>>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openModelId, setOpenModelId] = useState<string | null>(null);
  const [openSkillKey, setOpenSkillKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profilesRes, skillsRes] = await Promise.all([
        fetch("/api/agent-profiles"),
        fetch("/api/skills"),
      ]);
      const profilesData = await profilesRes.json().catch(() => ({}));
      const skillsData = await skillsRes.json().catch(() => ({}));
      if (!profilesRes.ok) throw new Error(profilesData?.error || `Profiles HTTP ${profilesRes.status}`);
      setProfiles(Array.isArray(profilesData.profiles) ? profilesData.profiles : []);
      setSkills(Array.isArray(skillsData.skills) ? skillsData.skills : []);
    } catch (err) {
      setProfiles([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const skillMap = useMemo(() => new Map(skills.map((skill) => [skill.id, skill.description || "No description"])), [skills]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = profiles.filter((profile) => {
      if (!q) return true;
      const haystack = [
        profile.id,
        profile.name,
        profile.defaultModel,
        profile.projectConfig?.domain,
        profile.projectConfig?.pattern,
        profile.projectConfig?.modelTier,
        profile.projectConfig?.roleInWorkflow,
        profile.projectConfig?.roleInWeakStrongWorkflow,
        ...(profile.skills || []),
        ...(profile.match || []),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
    const groups = new Map<string, AgentProfileItem[]>();
    for (const profile of filtered) {
      const key = profileGroupKey(profile);
      const list = groups.get(key) || [];
      list.push(profile);
      groups.set(key, list);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => {
        const ia = PROFILE_GROUP_ORDER.indexOf(a);
        const ib = PROFILE_GROUP_ORDER.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        return profileGroupLabel(a).localeCompare(profileGroupLabel(b));
      })
      .map(([group, items]) => ({
        group,
        label: profileGroupLabel(group),
        profiles: items.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)),
      }));
  }, [profiles, query]);

  const startRename = (profile: AgentProfileItem) => {
    setRenameId(profile.id);
    setRenameValue(profile.name || profile.id);
  };

  const commitRename = async (profile: AgentProfileItem) => {
    const name = renameValue.trim();
    setRenameId(null);
    if (!name || name === (profile.name || profile.id)) return;
    setBusyId(profile.id);
    try {
      const res = await fetch(`/api/agent-profiles/${encodeURIComponent(profile.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Profile rename failed");
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
        <div style={{ display: "grid", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Profile Manager</div>
              <div style={{ marginTop: 3, fontSize: 11, color: "var(--text-muted)" }}>{profiles.length} profiles · grouped by scene</div>
            </div>
            <button onClick={onClose} style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}>Close</button>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search profile, skill, model, domain..."
            style={{ width: "100%", height: 34, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", padding: "0 10px", fontSize: 12 }}
          />
          {error ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, color: "#ef4444", fontSize: 12 }}>
              <span>{error}</span>
              <button type="button" onClick={() => void load()} style={smallButtonStyle}>Retry</button>
            </div>
          ) : null}
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredGroups.length === 0 && !error ? <div style={{ padding: 18, color: "var(--text-muted)", fontSize: 12 }}>No profiles match this search.</div> : null}
          {filteredGroups.map((group) => (
            <details key={group.group} open style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "8px 10px", background: "var(--bg-secondary)" }}>
              <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, color: "var(--text)", fontSize: 12, fontWeight: 800 }}>
                <span>{group.label}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{group.profiles.length}</span>
              </summary>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {group.profiles.map((profile) => {
                  const equippedSkills = profile.skills || [];
                  const availableSkills = (profile.availableSkills || []).filter((skill) => !equippedSkills.includes(skill));
                  const intro = profile.collaborationProtocol || profile.systemPromptPatch || profile.match?.join(" / ") || "No description";
                  const role = profile.projectConfig?.roleInWorkflow || profile.projectConfig?.roleInWeakStrongWorkflow || profile.projectConfig?.pattern || profile.projectConfig?.modelTier;
                  const renaming = renameId === profile.id;
                  return (
                    <div key={profile.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "var(--bg)", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {renaming ? (
                            <input
                              value={renameValue}
                              autoFocus
                              onChange={(event) => setRenameValue(event.target.value)}
                              onBlur={() => void commitRename(profile)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void commitRename(profile);
                                if (event.key === "Escape") setRenameId(null);
                              }}
                              style={{ width: "100%", height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", padding: "0 9px", fontSize: 13, fontWeight: 700 }}
                            />
                          ) : (
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{profile.name || profile.id}</div>
                          )}
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>ID: {profile.id}{role ? ` · ${role}` : ""}</div>
                          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.6 }}>{intro}</div>
                        </div>
                        <button onClick={() => startRename(profile)} disabled={busyId === profile.id || renaming} style={smallButtonStyle}>{busyId === profile.id ? "Saving..." : "Rename"}</button>
                      </div>

                      <div style={{ display: "grid", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Model</div>
                          <button
                            onClick={() => setOpenModelId((id) => id === profile.id ? null : profile.id)}
                            style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", borderRadius: 999, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}
                          >
                            {profile.defaultModel || "No model set"}
                          </button>
                          {openModelId === profile.id && (
                            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                              This Profile&apos;s default model. Lead, Workflow, or runtime tasks can override it. If not overridden, this is used.
                            </div>
                          )}
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Equipped Skills</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {equippedSkills.length === 0 ? <span style={{ fontSize: 12, color: "var(--text-dim)" }}>None</span> : equippedSkills.map((skill) => {
                              const key = `${profile.id}:equipped:${skill}`;
                              return (
                                <button key={key} onClick={() => setOpenSkillKey((prev) => prev === key ? null : key)} style={chipStyle(true)}>{skill}</button>
                              );
                            })}
                          </div>
                          {equippedSkills.map((skill) => {
                            const key = `${profile.id}:equipped:${skill}`;
                            return openSkillKey === key ? <div key={`${key}:detail`} style={skillDetailStyle}>[{skill}] {skillMap.get(skill) || "No description"}</div> : null;
                          })}
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Optional Skills</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {availableSkills.length === 0 ? <span style={{ fontSize: 12, color: "var(--text-dim)" }}>None</span> : availableSkills.map((skill) => {
                              const key = `${profile.id}:available:${skill}`;
                              return (
                                <button key={key} onClick={() => setOpenSkillKey((prev) => prev === key ? null : key)} style={chipStyle(false)}>{skill}</button>
                              );
                            })}
                          </div>
                          {availableSkills.map((skill) => {
                            const key = `${profile.id}:available:${skill}`;
                            return openSkillKey === key ? <div key={`${key}:detail`} style={skillDetailStyle}>[{skill}] {skillMap.get(skill) || "No description"}</div> : null;
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
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

const smallButtonStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 12,
  flexShrink: 0,
};
