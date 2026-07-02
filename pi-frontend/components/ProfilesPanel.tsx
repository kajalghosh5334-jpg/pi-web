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

interface SkillOption {
  id: string;
  description?: string;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  value: string;
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
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profilesRes, skillsRes, modelsRes] = await Promise.all([
        fetch("/api/agent-profiles"),
        fetch("/api/skills"),
        fetch("/api/models"),
      ]);
      const profilesData = await profilesRes.json().catch(() => ({}));
      const skillsData = await skillsRes.json().catch(() => ({}));
      const modelsData = await modelsRes.json().catch(() => ({}));
      if (!profilesRes.ok) throw new Error(profilesData?.error || `Profiles HTTP ${profilesRes.status}`);
      setProfiles(Array.isArray(profilesData.profiles) ? profilesData.profiles : []);
      setSkills(Array.isArray(skillsData.skills)
        ? skillsData.skills
            .map((skill: { name?: string; id?: string; description?: string }) => ({
              id: skill.name || skill.id || "",
              description: skill.description,
            }))
            .filter((skill: SkillOption) => skill.id)
        : []);
      setModels(Array.isArray(modelsData.modelList)
        ? modelsData.modelList
            .map((model: { id?: string; name?: string; provider?: string }) => {
              const id = model.id || "";
              const provider = model.provider || "";
              return id && provider ? { id, provider, name: model.name || id, value: `${provider}/${id}` } : null;
            })
            .filter(Boolean) as ModelOption[]
        : []);
    } catch (err) {
      setProfiles([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
        ...(profile.availableSkills || []),
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

  const saveProfile = async (profileId: string, patch: Partial<AgentProfileItem>) => {
    setBusyId(profileId);
    try {
      const res = await fetch(`/api/agent-profiles/${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.profile) {
        alert(data?.error || "Profile 保存失败");
        return;
      }
      setProfiles((prev) => prev.map((profile) => profile.id === profileId ? data.profile : profile));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.32)", display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
      <div style={{ width: 900, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 64px)", overflow: "auto", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", position: "relative" }}>
        <button type="button" aria-label="Close" title="Close" onClick={onClose} style={{ ...plainIconButtonStyle, position: "sticky", top: 12, float: "right", zIndex: 4, margin: 12 }}>&times;</button>
        <div style={{ display: "grid", gap: 10, padding: "14px 16px", paddingRight: 52, borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Profile Manager</div>
            <div style={{ marginTop: 3, fontSize: 11, color: "var(--text-muted)" }}>{profiles.length} profiles · grouped by scene</div>
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
        <div style={{ clear: "both", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredGroups.length === 0 && !error ? <div style={{ padding: 18, color: "var(--text-muted)", fontSize: 12 }}>No profiles match this search.</div> : null}
          {filteredGroups.map((group) => (
            <details key={group.group} open style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "8px 10px", background: "var(--bg-secondary)" }}>
              <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, color: "var(--text)", fontSize: 12, fontWeight: 800 }}>
                <span>{group.label}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{group.profiles.length}</span>
              </summary>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {group.profiles.map((profile) => (
                  <ProfileManagerCard
                    key={profile.id}
                    profile={profile}
                    skills={skills}
                    models={models}
                    saving={busyId === profile.id}
                    onSave={(patch) => void saveProfile(profile.id, patch)}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileManagerCard({
  profile,
  skills,
  models,
  saving,
  onSave,
}: {
  profile: AgentProfileItem;
  skills: SkillOption[];
  models: ModelOption[];
  saving: boolean;
  onSave: (patch: Partial<AgentProfileItem>) => void;
}) {
  const [draft, setDraft] = useState<AgentProfileItem>({
    ...profile,
    skills: [...(profile.skills || [])],
    availableSkills: [...(profile.availableSkills || [])],
  });
  const [editingField, setEditingField] = useState<"name" | "protocol" | null>(null);
  const [picker, setPicker] = useState<"model" | "skills" | null>(null);

  useEffect(() => {
    setDraft({ ...profile, skills: [...(profile.skills || [])], availableSkills: [...(profile.availableSkills || [])] });
  }, [profile]);

  const fixedSkills = draft.skills || [];
  const optionalSkills = (draft.availableSkills || []).filter((skill) => !fixedSkills.includes(skill));
  const skillDescriptions = useMemo(() => new Map(skills.map((skill) => [skill.id, skill.description || "No description"])), [skills]);
  const role = profile.projectConfig?.roleInWorkflow || profile.projectConfig?.roleInWeakStrongWorkflow || profile.projectConfig?.pattern || profile.projectConfig?.modelTier;
  const changed = JSON.stringify({
    name: draft.name || "",
    defaultModel: draft.defaultModel || "",
    skills: draft.skills || [],
    availableSkills: optionalSkills,
    collaborationProtocol: draft.collaborationProtocol || "",
  }) !== JSON.stringify({
    name: profile.name || "",
    defaultModel: profile.defaultModel || "",
    skills: profile.skills || [],
    availableSkills: (profile.availableSkills || []).filter((skill) => !(profile.skills || []).includes(skill)),
    collaborationProtocol: profile.collaborationProtocol || "",
  });

  const toggleOptionalSkill = (skillId: string) => {
    setDraft((prev) => {
      const current = new Set((prev.availableSkills || []).filter((skill) => !(prev.skills || []).includes(skill)));
      if (current.has(skillId)) current.delete(skillId);
      else current.add(skillId);
      return { ...prev, availableSkills: [...current].sort() };
    });
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "var(--bg)", display: "grid", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        {editingField === "name" ? (
          <input
            autoFocus
            value={draft.name || ""}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            onBlur={() => setEditingField(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") setEditingField(null);
            }}
            style={{ ...inputStyle, fontSize: 14, fontWeight: 800 }}
          />
        ) : (
          <div title="Double click to edit" onDoubleClick={() => setEditingField("name")} style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", cursor: "text" }}>
            {draft.name || draft.id}
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>ID: {draft.id}{role ? ` · ${role}` : ""}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <Field label="Model">
          <button type="button" onClick={() => setPicker("model")} style={selectLikeButtonStyle}>
            {draft.defaultModel || "选择模型"}
          </button>
        </Field>
        <Field label="Fixed Skills">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minHeight: 34, alignItems: "center" }}>
            {fixedSkills.length ? fixedSkills.map((skill) => (
              <span key={skill} title={skillDescriptions.get(skill) || skill} className="codex-pill" style={{ fontSize: 10 }}>
                {skill}
              </span>
            )) : <span style={{ fontSize: 12, color: "var(--text-dim)" }}>None</span>}
          </div>
        </Field>
        <Field label="Configurable Skills">
          <button type="button" onClick={() => setPicker("skills")} style={selectLikeButtonStyle}>
            {optionalSkills.length ? `${optionalSkills.length} skills selected` : "选择可装配 Skill"}
          </button>
        </Field>
      </div>

      <Field label="Protocol">
        {editingField === "protocol" ? (
          <textarea
            autoFocus
            value={draft.collaborationProtocol || ""}
            onChange={(event) => setDraft((prev) => ({ ...prev, collaborationProtocol: event.target.value }))}
            onBlur={() => setEditingField(null)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditingField(null);
            }}
            style={{ ...inputStyle, minHeight: 96, resize: "vertical", lineHeight: 1.6 }}
          />
        ) : (
          <div
            title="Double click to edit"
            onDoubleClick={() => setEditingField("protocol")}
            style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "9px 10px", background: "var(--bg-secondary)", color: draft.collaborationProtocol ? "var(--text)" : "var(--text-dim)", fontSize: 12, lineHeight: 1.7, cursor: "text", minHeight: 58, whiteSpace: "pre-wrap" }}
          >
            {draft.collaborationProtocol || "Double click to add protocol"}
          </div>
        )}
      </Field>

      {optionalSkills.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {optionalSkills.map((skill) => (
            <span key={skill} title={skillDescriptions.get(skill) || skill} className="codex-pill" style={{ fontSize: 10 }}>
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <span style={{ fontSize: 11, color: changed ? "var(--text-muted)" : "var(--text-dim)" }}>{changed ? "Unsaved changes" : "No changes"}</span>
        <button
          type="button"
          disabled={saving || !changed}
          onClick={() => onSave({
            name: draft.name,
            defaultModel: draft.defaultModel,
            skills: draft.skills,
            availableSkills: optionalSkills,
            collaborationProtocol: draft.collaborationProtocol,
          })}
          style={{ border: "none", background: "transparent", color: changed ? "var(--text)" : "var(--text-dim)", cursor: saving || !changed ? "default" : "pointer", fontSize: 13, fontWeight: 850, padding: "6px 0" }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {picker === "model" ? (
        <PickerDialog title="选择模型" onClose={() => setPicker(null)}>
          <div style={{ display: "grid", gap: 7 }}>
            {models.length ? models.map((model) => {
              const active = draft.defaultModel === model.value;
              return (
                <button key={model.value} type="button" onClick={() => {
                  setDraft((prev) => ({ ...prev, defaultModel: model.value }));
                  setPicker(null);
                }} style={pickerRowStyle(active)}>
                  <span style={{ fontWeight: 800 }}>{model.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 11 }}>{model.value}</span>
                </button>
              );
            }) : <div style={{ fontSize: 12, color: "var(--text-muted)" }}>没有可用模型。请先在 API 面板配置模型。</div>}
          </div>
        </PickerDialog>
      ) : null}

      {picker === "skills" ? (
        <PickerDialog title="选择可装配 Skill" onClose={() => setPicker(null)}>
          <div style={{ display: "grid", gap: 7 }}>
            {skills.length ? skills.map((skill) => {
              const fixed = fixedSkills.includes(skill.id);
              const active = optionalSkills.includes(skill.id);
              return (
                <button key={skill.id} type="button" disabled={fixed} onClick={() => toggleOptionalSkill(skill.id)} style={{ ...pickerRowStyle(active || fixed), opacity: fixed ? 0.55 : 1, cursor: fixed ? "not-allowed" : "pointer" }}>
                  <span style={{ fontWeight: 800 }}>{skill.id}{fixed ? " · fixed" : ""}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5 }}>{skill.description || "No description"}</span>
                </button>
              );
            }) : <div style={{ fontSize: 12, color: "var(--text-muted)" }}>没有可用 Skill。</div>}
          </div>
        </PickerDialog>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

function PickerDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1010, display: "grid", placeItems: "center", background: "rgba(15,23,42,0.2)", padding: 18 }} onClick={onClose}>
      <section className="codex-card" onClick={(event) => event.stopPropagation()} style={{ width: "min(560px, 92vw)", maxHeight: "78vh", overflow: "auto", borderRadius: 18, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 850, color: "var(--text)" }}>{title}</div>
          <button type="button" aria-label="Close" title="Close" onClick={onClose} style={plainIconButtonStyle}>&times;</button>
        </div>
        {children}
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 12,
};

const plainIconButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 20,
  lineHeight: 1,
  padding: 2,
  width: 24,
  height: 24,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const selectLikeButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  color: "var(--text)",
  borderRadius: 10,
  minHeight: 38,
  padding: "8px 10px",
  cursor: "pointer",
  fontSize: 12,
  textAlign: "left",
};

function pickerRowStyle(active: boolean): React.CSSProperties {
  return {
    width: "100%",
    minHeight: 48,
    border: active ? "1px solid color-mix(in srgb, var(--accent) 52%, transparent)" : "1px solid var(--border)",
    background: active ? "color-mix(in srgb, var(--accent) 10%, var(--bg))" : "var(--bg-secondary)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "9px 10px",
    cursor: "pointer",
    display: "grid",
    gap: 3,
    textAlign: "left",
    fontSize: 12,
  };
}

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
