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
  "self-media": "自媒体",
  research: "行业调研",
  ecommerce: "电商",
  "customer-support": "客服",
  sales: "电话销售",
  generic: "通用模板",
  internal: "内部旧项",
  evaluation: "评测旧项",
};

const WORKFLOW_DOMAIN_ORDER = ["self-media", "research", "ecommerce", "customer-support", "sales", "generic", "internal", "evaluation"];
const WORKFLOW_TEMPLATE_LABELS: Record<string, string> = {
  "fetch-summarize": "抓取-摘要",
  "generate-variants": "生成-多版本",
  "classify-route": "分类-路由",
  "monitor-alert": "监控-告警",
  "extract-writeback": "结构化回写",
  "smoke-test": "烟测旧项",
  "manual-check": "手动检查",
  "eval-run": "评测运行",
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
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
  return WORKFLOW_DOMAIN_LABELS[domain] || domain || "未分类";
}

function workflowTemplateLabel(templateType: string | undefined): string {
  return templateType ? WORKFLOW_TEMPLATE_LABELS[templateType] || templateType : "Workflow";
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function workflowWasDebuggedToday(workflow: WorkflowDefinition): boolean {
  if (workflow.status === "template" || workflow.status === "legacy") return false;
  if (workflow.debugStatus !== "polished" || !workflow.debuggedAt) return false;
  const debuggedAt = new Date(workflow.debuggedAt);
  if (Number.isNaN(debuggedAt.getTime())) return false;
  return isSameLocalDate(debuggedAt, new Date());
}

function sortWorkflowDomains(domains: string[]) {
  return domains.sort((a, b) => {
    const ia = WORKFLOW_DOMAIN_ORDER.indexOf(a);
    const ib = WORKFLOW_DOMAIN_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return workflowDomainLabel(a).localeCompare(workflowDomainLabel(b));
  });
}

function slugDomain(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "custom";
  return trimmed
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "custom";
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
  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null);
  const [profileInspector, setProfileInspector] = useState<AgentProfileItem | null>(null);
  const [workflowCreateOpen, setWorkflowCreateOpen] = useState(false);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { workflows?: WorkflowDefinition[] };
      setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
    } catch {
      setWorkflows([]);
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

  const createWorkflow = useCallback(async (payload: {
    name: string;
    description: string;
    templateId: string;
    domain: string;
    category: string;
    templateType: string;
  }) => {
    const template = workflows.find((workflow) => workflow.id === payload.templateId);
    const tasks = (template?.tasks || []).map((task) => ({
      ...task,
      deps: [...(task.deps || [])],
      skills: [...(task.skills || [])],
      acceptanceCriteria: [...(task.acceptanceCriteria || [])],
      layout: task.layout ? { ...task.layout } : undefined,
      budget: task.budget ? { ...task.budget } : undefined,
    }));
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        cwd: effectiveCwd ?? template?.cwd ?? "",
        status: "active",
        domain: payload.domain,
        category: payload.category,
        templateType: payload.templateType || template?.templateType || "",
        leadProfileId: template?.leadProfileId || "strong-task-architect",
        reviewPolicy: template?.reviewPolicy || "lead_plus_reviewer",
        tasks,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.workflow) {
      window.alert(data?.error || "Workflow creation failed");
      return;
    }
    await loadWorkflows();
    setWorkflowCreateOpen(false);
    onSelectWorkflow?.(data.workflow);
  }, [effectiveCwd, loadWorkflows, onSelectWorkflow, workflows]);

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

  const currentWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId],
  );

  const workflowTemplates = useMemo(
    () => workflows.filter((workflow) => workflow.status === "template" || workflow.id.startsWith("template-")),
    [workflows],
  );

  const workflowGroups = useMemo(() => {
    const groups = new Map<string, WorkflowDefinition[]>();
    for (const workflow of workflows.filter(workflowWasDebuggedToday)) {
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

  const visibleWorkflowCount = useMemo(() => workflows.filter(workflowWasDebuggedToday).length, [workflows]);

  const workflowDomains = useMemo(() => {
    const domains = new Set<string>();
    for (const workflow of workflows) {
      if (workflow.status === "legacy" || workflow.status === "template") continue;
      domains.add(workflowDomain(workflow));
    }
    return sortWorkflowDomains([...domains]);
  }, [workflows]);

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
            <button onClick={() => onSelectWorkflow?.(null)} style={ghostButtonStyle}>Back</button>
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
              sublabel={effectiveCwd ? shortenCwd(effectiveCwd) : "Choose a workspace first"}
              disabled={!effectiveCwd}
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
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="codex-card"
                draggable
                onDragStart={(event) => {
                  const payload = JSON.stringify({
                    id: profile.id,
                    name: profile.name || profile.id,
                    skills: profile.skills || [],
                  });
                  event.dataTransfer.setData("application/pi-profile", payload);
                  event.dataTransfer.setData("text/plain", profile.name || profile.id);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                style={{ borderRadius: 18, padding: "14px 14px 12px", marginBottom: 8, cursor: "grab" }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 3 }}>{profile.name || profile.id}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{profile.id}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setProfileInspector(profile);
                      }}
                      style={ghostButtonStyle}
                    >
                      Inspector
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  {profile.defaultModel || "No default model"}
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
            ))}
          </>
        ) : (
          <>
            <CreateListItem
              label="New workflow"
              sublabel="Choose a template and category"
              onClick={() => setWorkflowCreateOpen(true)}
            />
            {visibleWorkflowCount === 0 ? <EmptyState label="今天还没有调试通过的 workflow。" /> : null}
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
      {workflowCreateOpen ? (
        <WorkflowCreateOverlay
          templates={workflowTemplates}
          domains={workflowDomains}
          onClose={() => setWorkflowCreateOpen(false)}
          onCreate={(payload) => void createWorkflow(payload)}
        />
      ) : null}
      {profileInspector ? (
        <InspectorOverlay title={profileInspector.name || profileInspector.id} onClose={() => setProfileInspector(null)}>
          <div style={{ display: "grid", gap: 10, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
            <div><strong style={{ color: "var(--text)" }}>ID</strong><br /><span style={{ fontFamily: "var(--font-mono)" }}>{profileInspector.id}</span></div>
            <div><strong style={{ color: "var(--text)" }}>Default Model</strong><br />{profileInspector.defaultModel || "No default model"}</div>
            <div><strong style={{ color: "var(--text)" }}>Skills</strong><br />{(profileInspector.skills || []).length ? profileInspector.skills?.join(", ") : "No skills"}</div>
            {profileInspector.collaborationProtocol ? <div><strong style={{ color: "var(--text)" }}>Protocol</strong><br />{profileInspector.collaborationProtocol}</div> : null}
          </div>
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

function WorkflowCreateOverlay({
  templates,
  domains,
  onClose,
  onCreate,
}: {
  templates: WorkflowDefinition[];
  domains: string[];
  onClose: () => void;
  onCreate: (payload: { name: string; description: string; templateId: string; domain: string; category: string; templateType: string }) => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const selectedTemplate = templates.find((template) => template.id === templateId);
  const [name, setName] = useState(selectedTemplate ? `${selectedTemplate.name.replace(/^模板：/, "")} Copy` : "New Workflow");
  const [description, setDescription] = useState(selectedTemplate?.description || "");
  const [domain, setDomain] = useState(domains[0] || "self-media");
  const [customDomain, setCustomDomain] = useState("");

  const effectiveDomain = domain === "__new__" ? slugDomain(customDomain) : domain;
  const effectiveCategory = domain === "__new__" ? customDomain.trim() : workflowDomainLabel(domain);
  const canCreate = name.trim().length > 0 && effectiveDomain.length > 0;

  const selectTemplate = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId);
    const template = templates.find((item) => item.id === nextTemplateId);
    if (!template) return;
    setName(`${template.name.replace(/^模板：/, "")} Copy`);
    setDescription(template.description || "");
    if (template.templateType && !domain) setDomain("self-media");
  };

  return (
    <InspectorOverlay title="New workflow" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Template">
          <select value={templateId} onChange={(event) => selectTemplate(event.target.value)} style={inputStyle}>
            <option value="">Blank workflow</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name} · {workflowTemplateLabel(template.templateType)}</option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input value={name} onChange={(event) => setName(event.target.value)} style={{ ...inputStyle, fontWeight: 800 }} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} style={{ ...inputStyle, minHeight: 76, resize: "vertical" }} />
        </Field>
        <Field label="Category">
          <select value={domain} onChange={(event) => setDomain(event.target.value)} style={inputStyle}>
            {domains.map((item) => (
              <option key={item} value={item}>{workflowDomainLabel(item)}</option>
            ))}
            <option value="__new__">New category</option>
          </select>
        </Field>
        {domain === "__new__" ? (
          <Field label="New Category">
            <input value={customDomain} onChange={(event) => setCustomDomain(event.target.value)} style={inputStyle} />
          </Field>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={ghostButtonStyle}>Cancel</button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => onCreate({
              name: name.trim(),
              description: description.trim(),
              templateId,
              domain: effectiveDomain,
              category: effectiveCategory || effectiveDomain,
              templateType: selectedTemplate?.templateType || "",
            })}
            style={{ ...ghostButtonStyle, background: canCreate ? "var(--text)" : "var(--bg-secondary)", color: canCreate ? "var(--bg)" : "var(--text-dim)" }}
          >
            Create
          </button>
        </div>
      </div>
    </InspectorOverlay>
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
            <span
              aria-label="今天已调试通过"
              title="今天已调试通过"
              style={{
                flex: "0 0 auto",
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "var(--status-success)",
                boxShadow: "0 0 0 3px color-mix(in srgb, var(--status-success) 16%, transparent)",
              }}
            />
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
            style={{ ...ghostButtonStyle, color: "#ef4444" }}
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

function InspectorOverlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", justifyContent: "flex-end", background: "rgba(15,23,42,0.18)" }} onClick={onClose}>
      <aside onClick={(event) => event.stopPropagation()} className="codex-card" style={{ width: 360, maxWidth: "92vw", height: "100%", borderRadius: "22px 0 0 22px", padding: 18, overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 850, color: "var(--text)", letterSpacing: "-0.02em" }}>{title}</div>
          <button type="button" onClick={onClose} style={iconButtonStyle}>×</button>
        </div>
        {children}
      </aside>
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
    <div style={{ marginBottom: 6 }}>
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
          gap: 8,
          minHeight: 54,
          paddingLeft: 12 + depth * 14,
          paddingRight: 10,
          borderRadius: 16,
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

        <div style={{ minWidth: 0, flex: 1 }}>
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
                height: 30,
                borderRadius: 10,
                border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 12,
                padding: "0 10px",
              }}
            />
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {title}
              </div>
              <div className="session-row-meta" style={{ marginTop: 2, display: "flex", gap: 8, fontSize: 11, color: "var(--text-dim)" }}>
                <span>{formatRelativeTime(session.modified)}</span>
                <span>{session.messageCount} msgs</span>
              </div>
            </>
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
        <div style={{ marginTop: 4, marginLeft: 44 + depth * 14, padding: "4px 10px 8px", borderLeft: "1px solid color-mix(in srgb, var(--shell-edge) 82%, transparent)" }}>
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
