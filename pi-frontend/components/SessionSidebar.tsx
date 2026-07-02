"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionInfo, WorkflowDefinition } from "@/lib/types";

interface AgentProfileItem {
  id: string;
  name?: string;
  defaultModel?: string;
  skills?: string[];
  availableSkills?: string[];
  collaborationProtocol?: string;
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

interface Props {
  mode: "chat" | "workflow";
  onModeChange?: (mode: "chat" | "workflow") => void;
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string | null) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string) => void;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  selectedWorkflowId?: string | null;
  onSelectWorkflow?: (workflow: WorkflowDefinition | null) => void;
  workflowRefreshKey?: number;
}

const WORKFLOW_DOMAIN_LABELS: Record<string, string> = {
  generic: "通用 Workflow",
  "self-media": "自媒体",
  research: "行业调研",
  ecommerce: "电商",
  "customer-support": "客服",
  sales: "电话销售",
  internal: "内部旧项",
  evaluation: "评测旧项",
};

const WORKFLOW_DOMAIN_ORDER = ["generic", "self-media", "research", "ecommerce", "customer-support", "sales"];
const PROFILE_DISPLAY_NAMES: Record<string, string> = {
  "weak-research-extractor": "找资料并摘事实",
  "weak-structured-operator": "整理成表或 JSON",
  "weak-test-enumerator": "列测试点和边界",
  "classification-router": "分类并分派",
  "structured-writeback-operator": "抽字段并回写",
  "strong-task-architect": "拆任务和搭流程",
  "strong-quality-reviewer": "检查质量和风险",
  "content-strategy-director": "想选题和策略",
  "content-researcher": "找内容素材",
  "content-draft-producer": "写初稿和改写",
  "content-editor-reviewer": "审稿和把关",
  "research-report-analyst": "分析并写报告",
  "support-kb-responder": "查知识库并回复",
  "sales-call-analyst": "分析销售通话",
  "sales-followup-draft-producer": "写销售跟进",
  "ecommerce-listing-optimizer": "优化商品页",
  "monitor-alert-operator": "判断是否告警",
};

const PROFILE_GROUP_ORDER = ["generic", "self-media", "research", "customer-support", "sales", "ecommerce", "trained", "other"];
const PROFILE_GROUP_LABELS: Record<string, string> = {
  generic: "通用 Workflow 节点",
  "self-media": "自媒体节点",
  research: "调研节点",
  "customer-support": "客服节点",
  sales: "销售节点",
  ecommerce: "电商节点",
  trained: "专用训练节点",
  other: "其他节点",
};
const GENERIC_PROFILE_IDS = new Set([
  "weak-research-extractor",
  "weak-structured-operator",
  "weak-test-enumerator",
  "classification-router",
  "structured-writeback-operator",
  "strong-task-architect",
  "strong-quality-reviewer",
  "monitor-alert-operator",
]);

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff) || diff < 0) return "now";
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 30) return `${days}d`;
  if (months < 12) return `${months}mo`;
  return `${years}y`;
}

function getRecentCwds(sessions: SessionInfo[]): string[] {
  const latestByCwd = new Map<string, string>();
  for (const session of sessions) {
    if (!session.cwd) continue;
    const current = latestByCwd.get(session.cwd);
    if (!current || session.modified > current) latestByCwd.set(session.cwd, session.modified);
  }
  return [...latestByCwd.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([cwd]) => cwd);
}

function shortenCwd(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `.../${parts.slice(-2).join("/")}`;
}

function workflowDomain(workflow: WorkflowDefinition): string {
  return workflow.domain || workflow.category || "uncategorized";
}

function workflowDomainLabel(domain: string): string {
  if (!domain || domain === "custom" || domain === "uncategorized") return "未分类";
  return WORKFLOW_DOMAIN_LABELS[domain] || domain || "未分类";
}

function profileDisplayName(profile: AgentProfileItem): string {
  return PROFILE_DISPLAY_NAMES[profile.id] || profile.name || profile.id;
}

function profileGroup(profile: AgentProfileItem): string {
  if (GENERIC_PROFILE_IDS.has(profile.id)) return "generic";
  if (profile.id.startsWith("trained-case-")) return "trained";
  const text = `${profile.id} ${profile.name || ""}`.toLowerCase();
  if (/content|media|自媒体|选题|审稿|素材/.test(text)) return "self-media";
  if (/research|report|调研|报告/.test(text)) return "research";
  if (/support|客服|知识库/.test(text)) return "customer-support";
  if (/sales|销售|通话/.test(text)) return "sales";
  if (/ecommerce|listing|电商|商品/.test(text)) return "ecommerce";
  return "other";
}

function sortProfileGroups(groups: string[]) {
  return groups.sort((a, b) => {
    const ia = PROFILE_GROUP_ORDER.indexOf(a);
    const ib = PROFILE_GROUP_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || (PROFILE_GROUP_LABELS[a] || a).localeCompare(PROFILE_GROUP_LABELS[b] || b);
  });
}

function workflowIsVisibleInLibrary(workflow: WorkflowDefinition): boolean {
  return workflow.status !== "template" && !workflow.id.startsWith("template-");
}

function sortWorkflowDomains(domains: string[]) {
  return domains.sort((a, b) => {
    const ia = WORKFLOW_DOMAIN_ORDER.indexOf(a);
    const ib = WORKFLOW_DOMAIN_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return workflowDomainLabel(a).localeCompare(workflowDomainLabel(b));
  });
}

interface SessionTreeNode {
  session: SessionInfo;
  children: SessionTreeNode[];
}

function buildSessionTree(sessions: SessionInfo[]): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>();
  for (const session of sessions) {
    byId.set(session.id, { session, children: [] });
  }

  const parentOf = new Map<string, string>();
  for (const session of sessions) {
    if (session.parentSessionId) parentOf.set(session.id, session.parentSessionId);
  }

  function resolveAncestor(id: string): string | null {
    let current = parentOf.get(id);
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current)) return null;
      visited.add(current);
      if (byId.has(current)) return current;
      current = parentOf.get(current);
    }
    return null;
  }

  const roots: SessionTreeNode[] = [];
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id);
    if (ancestor) byId.get(ancestor)?.children.push(node);
    else roots.push(node);
  }

  const sortNodes = (nodes: SessionTreeNode[]) => {
    nodes.sort((a, b) => b.session.modified.localeCompare(a.session.modified));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

export function SessionSidebar({
  mode,
  onModeChange,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  initialSessionId,
  onInitialRestoreDone,
  refreshKey,
  onSessionDeleted,
  selectedCwd: selectedCwdProp,
  onCwdChange,
  selectedWorkflowId,
  onSelectWorkflow,
  workflowRefreshKey,
}: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [profiles, setProfiles] = useState<AgentProfileItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [workflowLoadError, setWorkflowLoadError] = useState<string | null>(null);
  const [workflowCatalogDegraded, setWorkflowCatalogDegraded] = useState(false);
  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null);
  const [profileInspector, setProfileInspector] = useState<AgentProfileItem | null>(null);
  const [profileSavingId, setProfileSavingId] = useState<string | null>(null);
  const [profileSkills, setProfileSkills] = useState<SkillOption[]>([]);
  const [profileModels, setProfileModels] = useState<ModelOption[]>([]);
  const [fallbackCwd, setFallbackCwd] = useState<string | null>(selectedCwdProp ?? null);
  const restoredRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);

  const effectiveCwd = selectedCwdProp ?? fallbackCwd;

  const loadSessions = useCallback(async (showLoading = false) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      if (showLoading) setLoadingSessions(true);
      const res = await fetch("/api/sessions", { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { sessions: SessionInfo[] };
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setError(null);
      if (!showLoading) {
        setSessionRefreshDone(true);
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => setSessionRefreshDone(false), 1800);
      }
    } catch (err) {
      setError(err instanceof Error && err.name === "AbortError" ? "Loading sessions timed out. Refresh or switch workspace." : err instanceof Error ? err.message : String(err));
      if (err instanceof Error && err.name === "AbortError") {
        setTimeout(() => void loadSessions(showLoading), 1200);
      }
    } finally {
      clearTimeout(timeout);
      setLoadingSessions(false);
    }
  }, []);

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows");
      const data = await res.json().catch(() => ({})) as { workflows?: WorkflowDefinition[]; degraded?: boolean; error?: string };
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
      setWorkflowCatalogDegraded(Boolean(data.degraded));
      setWorkflowLoadError(data.degraded ? (data.error || "Backend unavailable; showing local workflow catalog.") : null);
    } catch (err) {
      setWorkflows([]);
      setWorkflowCatalogDegraded(false);
      setWorkflowLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadProfiles = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setLoadingProfiles(true);
    setProfileError(null);
    try {
      const res = await fetch("/api/agent-profiles", { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (!Array.isArray(data?.profiles)) throw new Error(data?.error || "Invalid profile response");
      setProfiles(Array.isArray(data?.profiles) ? data.profiles : []);
    } catch (err) {
      setProfiles([]);
      setProfileError(err instanceof Error && err.name === "AbortError" ? "Loading profiles timed out." : err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timeout);
      setLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions(!sessions.length);
  }, [loadSessions, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows, workflowRefreshKey]);

  useEffect(() => {
    if (mode === "workflow" && selectedWorkflowId) void loadProfiles();
  }, [mode, selectedWorkflowId, loadProfiles]);

  useEffect(() => {
    if (!profileInspector) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const cwd = encodeURIComponent(effectiveCwd || "");
    Promise.all([
      fetch(`/api/skills?cwd=${cwd}`, { signal: controller.signal }).then((res) => res.json()).catch(() => ({})),
      fetch(`/api/models?cwd=${cwd}`, { signal: controller.signal }).then((res) => res.json()).catch(() => ({})),
    ]).then(([skillsData, modelsData]) => {
      const nextSkills = Array.isArray(skillsData?.skills)
        ? skillsData.skills
            .map((skill: { name?: string; id?: string; description?: string }) => ({
              id: skill.name || skill.id || "",
              description: skill.description,
            }))
            .filter((skill: SkillOption) => skill.id)
        : [];
      const nextModels = Array.isArray(modelsData?.modelList)
        ? modelsData.modelList
            .map((model: { id?: string; name?: string; provider?: string }) => {
              const id = model.id || "";
              const provider = model.provider || "";
              return id && provider ? {
                id,
                provider,
                name: model.name || id,
                value: `${provider}/${id}`,
              } : null;
            })
            .filter(Boolean) as ModelOption[]
        : [];
      setProfileSkills(nextSkills);
      setProfileModels(nextModels);
    }).finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [effectiveCwd, profileInspector]);

  useEffect(() => {
    if (selectedCwdProp !== undefined) setFallbackCwd(selectedCwdProp ?? null);
  }, [selectedCwdProp]);

  useEffect(() => {
    onCwdChange?.(effectiveCwd);
  }, [effectiveCwd, onCwdChange]);

  useEffect(() => {
    if (!sessions.length) return;
    if (!restoredRef.current && initialSessionId) {
      restoredRef.current = true;
      const target = sessions.find((session) => session.id === initialSessionId);
      if (target) {
        setFallbackCwd(target.cwd);
        onSelectSession(target, true);
        return;
      }
      onInitialRestoreDone?.();
    }

    if (!effectiveCwd) {
      const [firstCwd] = getRecentCwds(sessions);
      if (firstCwd) setFallbackCwd(firstCwd);
      else onInitialRestoreDone?.();
    }
  }, [sessions, initialSessionId, effectiveCwd, onSelectSession, onInitialRestoreDone]);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  const handleNewSession = useCallback(() => {
    onNewSession?.("", effectiveCwd ?? null);
  }, [onNewSession, effectiveCwd]);

  const createBlankWorkflowDraft = useCallback(() => {
    onSelectWorkflow?.({
      id: `draft-workflow-${Date.now()}`,
      name: "未命名 Workflow",
      description: "",
      status: "active",
      debugStatus: "unverified",
      domain: "",
      category: "",
      templateType: "",
      cwd: effectiveCwd || "",
      leadProfileId: "strong-task-architect",
      reviewPolicy: "lead_plus_reviewer",
      tasks: [],
    });
  }, [effectiveCwd, onSelectWorkflow]);

  const deleteWorkflow = useCallback(async (workflow: WorkflowDefinition) => {
    if (!window.confirm(`Delete workflow: ${workflow.name}?`)) return;
    setWorkflowBusyId(workflow.id);
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflow.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data?.error || "Workflow deletion failed");
        return;
      }
      await loadWorkflows();
      if (selectedWorkflowId === workflow.id) onSelectWorkflow?.(null);
    } finally {
      setWorkflowBusyId(null);
    }
  }, [loadWorkflows, onSelectWorkflow, selectedWorkflowId]);

  const saveProfile = useCallback(async (profileId: string, patch: Partial<AgentProfileItem>) => {
    setProfileSavingId(profileId);
    try {
      const res = await fetch(`/api/agent-profiles/${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.profile) {
        window.alert(data?.error || "Profile 保存失败");
        return;
      }
      setProfiles((prev) => prev.map((profile) => profile.id === profileId ? data.profile : profile));
      setProfileInspector(data.profile);
    } finally {
      setProfileSavingId(null);
    }
  }, []);

  const currentWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId],
  );

  const workflowGroups = useMemo(() => {
    const groups = new Map<string, WorkflowDefinition[]>();
    for (const workflow of workflows.filter(workflowIsVisibleInLibrary)) {
      const status = workflow.status || "active";
      if (status === "template") continue;
      const domain = status === "legacy" ? "legacy" : workflowDomain(workflow);
      const list = groups.get(domain) || [];
      list.push(workflow);
      groups.set(domain, list);
    }
    return sortWorkflowDomains([...groups.keys()]).map((domain) => ({
      domain,
      label: domain === "legacy" ? "旧项 / 实验" : workflowDomainLabel(domain),
      workflows: (groups.get(domain) || []).sort((a, b) => {
        const sa = a.status === "legacy" ? 1 : 0;
        const sb = b.status === "legacy" ? 1 : 0;
        if (sa !== sb) return sa - sb;
        return (a.name || a.id).localeCompare(b.name || b.id);
      }),
    }));
  }, [workflows]);

  const profileGroups = useMemo(() => {
    const groups = new Map<string, AgentProfileItem[]>();
    for (const profile of profiles) {
      const group = profileGroup(profile);
      const list = groups.get(group) || [];
      list.push(profile);
      groups.set(group, list);
    }
    return sortProfileGroups([...groups.keys()]).map((group) => ({
      group,
      label: PROFILE_GROUP_LABELS[group] || group,
      profiles: (groups.get(group) || []).sort((a, b) => profileDisplayName(a).localeCompare(profileDisplayName(b))),
    }));
  }, [profiles]);

  const visibleWorkflowCount = useMemo(() => workflows.filter(workflowIsVisibleInLibrary).length, [workflows]);

  const filteredSessions = useMemo(
    () => effectiveCwd ? sessions.filter((session) => session.cwd === effectiveCwd) : sessions,
    [sessions, effectiveCwd],
  );

  const sessionTree = useMemo(() => buildSessionTree(filteredSessions), [filteredSessions]);

  const headerTitle = mode === "workflow" ? (selectedWorkflowId ? "Profile Library" : "Workflow Library") : "Sessions";
  const headerSubtitle = mode === "workflow"
    ? (selectedWorkflowId ? (currentWorkflow?.name || "Drag profiles into the workflow canvas") : "Choose a saved workflow")
    : (effectiveCwd ? shortenCwd(effectiveCwd) : "Choose a workspace from the top bar");

  return (
    <div className={mode === "chat" ? "session-list-hover-scope" : undefined} style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>
      <div className="codex-sidebar-backdrop" />
      <div style={{ padding: "14px 12px 10px", borderBottom: "1px solid color-mix(in srgb, var(--shell-edge) 82%, transparent)", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <img src="/pi-web-app-icon.png" alt="" style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0 }} />
            <div style={{ fontSize: 14, fontWeight: 850, letterSpacing: "-0.03em", color: "var(--text)", whiteSpace: "nowrap" }}>pi-multi</div>
          </div>
          {selectedWorkflowId ? (
            <button type="button" onClick={() => onSelectWorkflow?.(null)} title="Back" aria-label="Back" style={plainIconButtonStyle}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="10 3 5 8 10 13" />
              </svg>
            </button>
          ) : null}
        </div>
        {!selectedWorkflowId ? (
          <div className="codex-segmented" style={{ width: "100%", marginTop: 12 }}>
            {([
              { id: "chat", label: "Session" },
              { id: "workflow", label: "Workflow" },
            ] as const).map((item) => {
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  data-active={active}
                  onClick={() => onModeChange?.(item.id)}
                  style={{ flex: 1, minHeight: 32, borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: active ? 800 : 650 }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>{headerTitle}</div>
          <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 230 }}>{headerSubtitle}</div>
        </div>
        {mode === "chat" && sessionRefreshDone ? (
          <div style={{ fontSize: 10, color: "var(--status-success)" }}>Refreshed</div>
        ) : null}
      </div>

      <div className="codex-scroll-column" style={{ flex: 1, overflowY: "auto", padding: "8px 8px 10px", minHeight: 0, position: "relative", zIndex: 1 }}>
        {mode === "chat" ? (
          <>
            <CreateListItem
              label="New session"
              sublabel={effectiveCwd ? shortenCwd(effectiveCwd) : "Create a default workspace"}
              onClick={handleNewSession}
            />
            {loadingSessions ? <EmptyState label="Loading sessions..." /> : null}
            {!loadingSessions && error ? <EmptyState label={error} tone="error" /> : null}
            {!loadingSessions && !error && sessionTree.length === 0 ? <EmptyState label="No sessions found for this workspace." /> : null}
            {sessionTree.map((node) => (
              <SessionTreeItem
                key={node.session.id}
                node={node}
                selectedSessionId={selectedSessionId}
                onSelectSession={onSelectSession}
                onSessionsChanged={() => void loadSessions()}
                onSessionDeleted={onSessionDeleted}
                depth={0}
              />
            ))}
          </>
        ) : selectedWorkflowId ? (
          <>
            {loadingProfiles ? <EmptyState label="Loading profiles..." /> : null}
            {!loadingProfiles && profileError ? (
              <div style={{ padding: "12px 8px", display: "grid", gap: 8 }}>
                <EmptyState label={profileError} tone="error" />
                <button type="button" onClick={() => void loadProfiles()} style={{ ...ghostButtonStyle, justifySelf: "start" }}>
                  Retry
                </button>
              </div>
            ) : null}
            {!loadingProfiles && !profileError && profiles.length === 0 ? <EmptyState label="No profiles available yet." /> : null}
            {profileGroups.map((group) => (
              <ProfileGroup
                key={group.group}
                label={group.label}
                profiles={group.profiles}
                onInspect={setProfileInspector}
              />
            ))}
          </>
        ) : (
          <>
            <CreateListItem
              label="New workflow"
              sublabel="AI guide opens first"
              onClick={createBlankWorkflowDraft}
            />
            {workflowLoadError ? (
              <div style={{ padding: "8px 6px 10px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <EmptyState
                    label={workflowCatalogDegraded ? `${workflowLoadError} 当前显示本地 workflow 目录，运行和保存仍需要后端。` : workflowLoadError}
                    tone={workflowCatalogDegraded ? "muted" : "error"}
                  />
                </div>
                <button type="button" aria-label="Retry workflows" title="Retry" onClick={() => void loadWorkflows()} style={plainIconButtonStyle}>
                  ↻
                </button>
              </div>
            ) : null}
            {visibleWorkflowCount === 0 && !workflowLoadError ? <EmptyState label="还没有保存的 workflow。" /> : null}
            {visibleWorkflowCount === 0 && workflowLoadError ? <EmptyState label="没有可显示的 workflow。请确认后端或本地 catalog 文件可用。" /> : null}
            {workflowGroups.map((group) => (
              <WorkflowGroup
                key={group.domain}
                label={group.label}
                workflows={group.workflows}
                selectedWorkflowId={selectedWorkflowId}
                workflowBusyId={workflowBusyId}
                onSelectWorkflow={(workflow) => onSelectWorkflow?.(workflow)}
                onDeleteWorkflow={(workflow) => void deleteWorkflow(workflow)}
              />
            ))}
          </>
        )}
      </div>
      {profileInspector ? (
        <InspectorOverlay onClose={() => setProfileInspector(null)}>
          <ProfileInspectorPanel
            key={profileInspector.id}
            profile={profileInspector}
            skills={profileSkills}
            models={profileModels}
            saving={profileSavingId === profileInspector.id}
            onClose={() => setProfileInspector(null)}
            onSave={(patch) => void saveProfile(profileInspector.id, patch)}
          />
        </InspectorOverlay>
      ) : null}
    </div>
  );
}

function EmptyState({ label, tone = "muted" }: { label: string; tone?: "muted" | "error" }) {
  return (
    <div style={{ padding: "14px 12px", fontSize: 12, color: tone === "error" ? "#f87171" : "var(--text-muted)" }}>
      {label}
    </div>
  );
}

function CreateListItem({ label, sublabel, disabled, onClick }: { label: string; sublabel: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: "100%",
        minHeight: 54,
        marginBottom: 8,
        padding: "0 12px",
        border: "1px dashed color-mix(in srgb, var(--shell-edge) 90%, transparent)",
        borderRadius: 16,
        background: "color-mix(in srgb, var(--bg) 70%, transparent)",
        color: disabled ? "var(--text-dim)" : "var(--text)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        textAlign: "left",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{ width: 26, height: 26, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--accent) 10%, var(--bg))", color: "var(--accent)", flexShrink: 0, fontSize: 18, lineHeight: 1 }}>+</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 800 }}>{label}</span>
        <span style={{ display: "block", marginTop: 2, fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sublabel}</span>
      </span>
    </button>
  );
}

function ProfileGroup({
  label,
  profiles,
  onInspect,
}: {
  label: string;
  profiles: AgentProfileItem[];
  onInspect: (profile: AgentProfileItem) => void;
}) {
  return (
    <details open style={{ marginBottom: 8 }}>
      <summary style={{ cursor: "pointer", padding: "8px 6px", color: "var(--text-muted)", fontSize: 11, fontWeight: 850, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span>{label}</span>
        <span className="codex-pill" style={{ fontSize: 10, minHeight: 20, padding: "0 7px" }}>{profiles.length}</span>
      </summary>
      <div>
        {profiles.map((profile) => (
          <ProfileListItem key={profile.id} profile={profile} onInspect={() => onInspect(profile)} />
        ))}
      </div>
    </details>
  );
}

function ProfileListItem({ profile, onInspect }: { profile: AgentProfileItem; onInspect: () => void }) {
  const displayName = profileDisplayName(profile);
  return (
    <div
      role="button"
      tabIndex={0}
      className="codex-card"
      draggable
      onClick={onInspect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onInspect();
      }}
      onDragStart={(event) => {
        const payload = JSON.stringify({
          id: profile.id,
          name: displayName,
          skills: profile.skills || [],
        });
        event.dataTransfer.setData("application/pi-profile", payload);
        event.dataTransfer.setData("text/plain", displayName);
        event.dataTransfer.effectAllowed = "copy";
      }}
      style={{ borderRadius: 16, padding: "13px 14px 11px", marginBottom: 8, cursor: "grab" }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 820, color: "var(--text)", marginBottom: 3 }}>{displayName}</div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.id}</div>
      </div>
      <div style={{ marginTop: 9, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
        {profile.name && profile.name !== displayName ? profile.name : profile.defaultModel || "No default model"}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(profile.skills || []).slice(0, 3).map((skill) => (
          <span key={`${profile.id}-${skill}`} className="codex-pill" style={{ fontSize: 10 }}>
            {skill}
          </span>
        ))}
        {(profile.skills || []).length > 3 ? (
          <span className="codex-pill" style={{ fontSize: 10 }}>+{(profile.skills || []).length - 3}</span>
        ) : null}
      </div>
    </div>
  );
}

function WorkflowGroup({
  label,
  workflows,
  selectedWorkflowId,
  workflowBusyId,
  onSelectWorkflow,
  onDeleteWorkflow,
}: {
  label: string;
  workflows: WorkflowDefinition[];
  selectedWorkflowId?: string | null;
  workflowBusyId?: string | null;
  onSelectWorkflow: (workflow: WorkflowDefinition) => void;
  onDeleteWorkflow: (workflow: WorkflowDefinition) => void;
}) {
  const legacy = workflows.every((workflow) => workflow.status === "legacy");
  return (
    <details open={!legacy} style={{ marginBottom: 8 }}>
      <summary style={{ cursor: "pointer", padding: "8px 6px", color: "var(--text-muted)", fontSize: 11, fontWeight: 850, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span>{label}</span>
        <span className="codex-pill" style={{ fontSize: 10, minHeight: 20, padding: "0 7px" }}>{workflows.length}</span>
      </summary>
      <div>
        {workflows.map((workflow) => (
          <WorkflowListItem
            key={workflow.id}
            workflow={workflow}
            active={workflow.id === selectedWorkflowId}
            busy={workflowBusyId === workflow.id}
            onSelect={() => onSelectWorkflow(workflow)}
            onDelete={() => onDeleteWorkflow(workflow)}
          />
        ))}
      </div>
    </details>
  );
}

function WorkflowListItem({ workflow, active, busy, onSelect, onDelete }: { workflow: WorkflowDefinition; active: boolean; busy: boolean; onSelect: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="codex-card"
      style={{
        width: "100%",
        textAlign: "left",
        borderRadius: 18,
        padding: "14px 14px 12px",
        marginBottom: 8,
        cursor: "pointer",
        background: active ? "color-mix(in srgb, var(--accent) 8%, var(--bg))" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workflow.name}</div>
            {workflow.debugStatus === "polished" ? (
              <span
                aria-label="已验证"
                title="已验证"
                style={{
                  flex: "0 0 auto",
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "var(--status-success)",
                  boxShadow: "0 0 0 3px color-mix(in srgb, var(--status-success) 16%, transparent)",
                }}
              />
            ) : null}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {workflow.tasks?.length || 0} tasks · {workflow.reviewPolicy || "lead_plus_reviewer"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, opacity: hovered || busy ? 1 : 0, pointerEvents: hovered || busy ? "auto" : "none", transition: "opacity 0.14s ease" }}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            disabled={busy}
            style={{
              border: "none",
              background: "transparent",
              color: "#ef4444",
              cursor: busy ? "default" : "pointer",
              fontSize: 11,
              fontWeight: 750,
              padding: 0,
            }}
          >
            {busy ? "..." : "Delete"}
          </button>
        </div>
      </div>
      {workflow.description ? (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.7 }}>
          {workflow.description}
        </div>
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

function InspectorOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", justifyContent: "flex-end", background: "rgba(15,23,42,0.18)" }} onClick={onClose}>
      <aside onClick={(event) => event.stopPropagation()} className="codex-card" style={{ width: 360, maxWidth: "92vw", height: "100%", borderRadius: "22px 0 0 22px", padding: 18, overflow: "auto" }}>
        {children}
      </aside>
    </div>
  );
}

function ProfileInspectorPanel({
  profile,
  skills,
  models,
  saving,
  onClose,
  onSave,
}: {
  profile: AgentProfileItem;
  skills: SkillOption[];
  models: ModelOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (patch: Partial<AgentProfileItem>) => void;
}) {
  const [draft, setDraft] = useState<AgentProfileItem>({
    ...profile,
    skills: [...(profile.skills || [])],
    availableSkills: [...(profile.availableSkills || [])],
  });
  const [editingField, setEditingField] = useState<"name" | "protocol" | null>(null);
  const [picker, setPicker] = useState<"model" | "skills" | null>(null);

  const fixedSkills = draft.skills || [];
  const optionalSkills = (draft.availableSkills || []).filter((skill) => !fixedSkills.includes(skill));
  const skillDescriptions = useMemo(() => new Map(skills.map((skill) => [skill.id, skill.description || "No description"])), [skills]);
  const changed = JSON.stringify({
    name: draft.name || "",
    defaultModel: draft.defaultModel || "",
    skills: draft.skills || [],
    availableSkills: draft.availableSkills || [],
    collaborationProtocol: draft.collaborationProtocol || "",
  }) !== JSON.stringify({
    name: profile.name || "",
    defaultModel: profile.defaultModel || "",
    skills: profile.skills || [],
    availableSkills: profile.availableSkills || [],
    collaborationProtocol: profile.collaborationProtocol || "",
  });

  const toggleOptionalSkill = (skillId: string) => {
    setDraft((prev) => {
      const current = new Set(prev.availableSkills || []);
      if (current.has(skillId)) current.delete(skillId);
      else current.add(skillId);
      for (const fixed of prev.skills || []) current.delete(fixed);
      return { ...prev, availableSkills: [...current].sort() };
    });
  };

  return (
    <div style={{ minHeight: "100%", display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
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
              style={{ ...inputStyle, fontSize: 15, fontWeight: 850 }}
            />
          ) : (
            <div
              title="Double click to edit"
              onDoubleClick={() => setEditingField("name")}
              style={{ fontSize: 15, fontWeight: 850, color: "var(--text)", lineHeight: 1.35, cursor: "text" }}
            >
              {draft.name || draft.id}
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{draft.id}</div>
        </div>
        <button type="button" aria-label="Close" title="Close" onClick={onClose} style={plainIconButtonStyle}>×</button>
      </div>

      <div style={{ display: "grid", gap: 15, alignContent: "start" }}>
        <Field label="Model">
          <button type="button" onClick={() => setPicker("model")} style={selectLikeButtonStyle}>
            {draft.defaultModel || "选择模型"}
          </button>
        </Field>

        <Field label="Fixed Skills">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
          {optionalSkills.length ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {optionalSkills.map((skill) => (
                <span key={skill} title={skillDescriptions.get(skill) || skill} className="codex-pill" style={{ fontSize: 10 }}>
                  {skill}
                </span>
              ))}
            </div>
          ) : null}
        </Field>

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
              style={{ ...inputStyle, minHeight: 128, resize: "vertical", lineHeight: 1.6 }}
            />
          ) : (
            <div
              title="Double click to edit"
              onDoubleClick={() => setEditingField("protocol")}
              style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "9px 10px", background: "var(--bg-secondary)", color: draft.collaborationProtocol ? "var(--text)" : "var(--text-dim)", fontSize: 12, lineHeight: 1.7, cursor: "text", minHeight: 96, whiteSpace: "pre-wrap" }}
            >
              {draft.collaborationProtocol || "Double click to add protocol"}
            </div>
          )}
        </Field>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <span style={{ fontSize: 11, color: changed ? "var(--text-muted)" : "var(--text-dim)" }}>
          {changed ? "Unsaved changes" : "No changes"}
        </span>
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
        <ProfilePickerDialog title="选择模型" onClose={() => setPicker(null)}>
          <div style={{ display: "grid", gap: 7 }}>
            {models.length ? models.map((model) => {
              const active = draft.defaultModel === model.value;
              return (
                <button
                  key={model.value}
                  type="button"
                  onClick={() => {
                    setDraft((prev) => ({ ...prev, defaultModel: model.value }));
                    setPicker(null);
                  }}
                  style={pickerRowStyle(active)}
                >
                  <span style={{ fontWeight: 800 }}>{model.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 11 }}>{model.value}</span>
                </button>
              );
            }) : <div style={{ fontSize: 12, color: "var(--text-muted)" }}>没有可用模型。请先在 API 面板配置模型。</div>}
          </div>
        </ProfilePickerDialog>
      ) : null}

      {picker === "skills" ? (
        <ProfilePickerDialog title="选择可装配 Skill" onClose={() => setPicker(null)}>
          <div style={{ display: "grid", gap: 7 }}>
            {skills.length ? skills.map((skill) => {
              const fixed = fixedSkills.includes(skill.id);
              const active = optionalSkills.includes(skill.id);
              return (
                <button
                  key={skill.id}
                  type="button"
                  disabled={fixed}
                  onClick={() => toggleOptionalSkill(skill.id)}
                  style={{ ...pickerRowStyle(active || fixed), opacity: fixed ? 0.55 : 1, cursor: fixed ? "not-allowed" : "pointer" }}
                >
                  <span style={{ fontWeight: 800 }}>{skill.id}{fixed ? " · fixed" : ""}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5 }}>{skill.description || "No description"}</span>
                </button>
              );
            }) : <div style={{ fontSize: 12, color: "var(--text-muted)" }}>没有可用 Skill。</div>}
          </div>
        </ProfilePickerDialog>
      ) : null}
    </div>
  );
}

function ProfilePickerDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 940, display: "grid", placeItems: "center", background: "rgba(15,23,42,0.2)", padding: 18 }} onClick={onClose}>
      <section className="codex-card" onClick={(event) => event.stopPropagation()} style={{ width: "min(560px, 92vw)", maxHeight: "78vh", overflow: "auto", borderRadius: 18, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 850, color: "var(--text)" }}>{title}</div>
          <button type="button" aria-label="Close" title="Close" onClick={onClose} style={plainIconButtonStyle}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function SessionTreeItem({
  node,
  selectedSessionId,
  onSelectSession,
  onSessionsChanged,
  onSessionDeleted,
  depth,
}: {
  node: SessionTreeNode;
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo) => void;
  onSessionsChanged: () => void;
  onSessionDeleted?: (sessionId: string) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <SessionItem
        session={node.session}
        isSelected={node.session.id === selectedSessionId}
        depth={depth}
        hasChildren={hasChildren}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        onClick={() => onSelectSession(node.session)}
        onChanged={onSessionsChanged}
        onDeleted={onSessionDeleted}
      />
      {hasChildren && !collapsed ? node.children.map((child) => (
        <SessionTreeItem
          key={child.session.id}
          node={child}
          selectedSessionId={selectedSessionId}
          onSelectSession={onSelectSession}
          onSessionsChanged={onSessionsChanged}
          onSessionDeleted={onSessionDeleted}
          depth={depth + 1}
        />
      )) : null}
    </div>
  );
}

function SessionItem({
  session,
  isSelected,
  depth,
  hasChildren,
  collapsed,
  onToggleCollapse,
  onClick,
  onChanged,
  onDeleted,
}: {
  session: SessionInfo;
  isSelected: boolean;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClick: () => void;
  onChanged: () => void;
  onDeleted?: (sessionId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.name || "");
  const inputRef = useRef<HTMLInputElement>(null);

  const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const commitRename = useCallback(async () => {
    const nextName = renameValue.trim();
    setRenaming(false);
    if (nextName === (session.name || "")) return;
    await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    }).catch(() => null);
    onChanged();
  }, [renameValue, session.id, session.name, onChanged]);

  const deleteSession = useCallback(async () => {
    if (!window.confirm(`Delete session "${title}"?`)) return;
    await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" }).catch(() => null);
    onDeleted?.(session.id);
    onChanged();
  }, [session.id, title, onDeleted, onChanged]);

  return (
    <div style={{ marginBottom: 3 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={renaming ? undefined : onClick}
        onKeyDown={(event) => {
          if (renaming) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onClick();
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          minHeight: 40,
          paddingLeft: 2 + depth * 14,
          paddingRight: 8,
          borderRadius: 14,
          background: isSelected ? "color-mix(in srgb, var(--accent) 10%, var(--bg))" : hovered ? "color-mix(in srgb, var(--bg-hover) 85%, var(--bg))" : "transparent",
          boxShadow: isSelected ? "var(--shell-shadow-sm)" : "none",
          cursor: renaming ? "default" : "pointer",
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse();
            }}
            style={{ ...iconButtonStyle, transform: collapsed ? "rotate(-90deg)" : "none" }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2 3.5 5 6.5 8 3.5" />
            </svg>
          </button>
        ) : (
          <div style={{ width: 20, flexShrink: 0 }} />
        )}

        <div style={{ minWidth: 0, flex: 1, marginLeft: "-2ch" }}>
          {renaming ? (
            <input
              ref={inputRef}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") void commitRename();
                if (event.key === "Escape") setRenaming(false);
              }}
              style={{
                width: "100%",
                height: 28,
                borderRadius: 10,
                border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 12,
                padding: "0 10px",
              }}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--text-dim)", width: 28, textAlign: "left" }}>
                {formatRelativeTime(session.modified)}
              </span>
              <div style={{ minWidth: 0, flex: 1, fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {title}
              </div>
            </div>
          )}
        </div>

        {(hovered || expanded || isSelected) && !renaming ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((value) => !value);
              }}
              title="Details"
              style={iconButtonStyle}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setRenameValue(session.name || "");
                setRenaming(true);
              }}
              title="Rename"
              style={iconButtonStyle}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void deleteSession();
              }}
              title="Delete"
              style={iconButtonStyle}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div style={{ marginTop: 2, marginLeft: 40 + depth * 14, padding: "3px 8px 6px", borderLeft: "1px solid color-mix(in srgb, var(--shell-edge) 82%, transparent)" }}>
          <div style={{ display: "grid", gap: 8, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>Directory</span>
              <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{shortenCwd(session.cwd)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>Created</span>
              <span style={{ color: "var(--text)" }}>{new Date(session.created).toLocaleDateString()}</span>
            </div>
            <div style={{ color: "var(--text-dim)" }}>{session.firstMessage || "No summary yet."}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const ghostButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  height: 30,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  color: "var(--text)",
  fontSize: 11,
  cursor: "pointer",
};

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

const iconButtonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "var(--bg-secondary)",
  color: "var(--text-muted)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};
