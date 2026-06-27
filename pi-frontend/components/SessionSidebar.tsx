"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SessionInfo, WorkflowDefinition } from "@/lib/types";
import { FileExplorer } from "./FileExplorer";

interface Props {
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string | null) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string) => void;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
  explorerRefreshKey?: number;
  onAtMention?: (relativePath: string) => void;
  selectedWorkflowId?: string | null;
  onSelectWorkflow?: (workflow: WorkflowDefinition | null) => void;
  workflowRefreshKey?: number;
}

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

/** Return the 5 most recently active cwds across all sessions */
function getRecentCwds(sessions: SessionInfo[]): string[] {
  const latestByCwd = new Map<string, string>(); // cwd -> most recent modified
  for (const s of sessions) {
    if (!s.cwd) continue;
    const prev = latestByCwd.get(s.cwd);
    if (!prev || s.modified > prev) {
      latestByCwd.set(s.cwd, s.modified);
    }
  }
  return [...latestByCwd.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 5)
    .map(([cwd]) => cwd);
}

function shortenCwd(cwd: string, homeDir?: string): string {
  const path = (homeDir && cwd.startsWith(homeDir)) ? "~" + cwd.slice(homeDir.length) : cwd;
  const sep = path.includes("/") ? "/" : "\\";
  const parts = path.split(sep).filter(Boolean);
  if (parts.length <= 2) return path;
  return "…/" + parts.slice(-2).join(sep);
}

function decodeDroppedFileUri(uri: string): string | null {
  const value = uri.trim();
  if (!value.startsWith("file://")) return null;
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname || "") || null;
  } catch {
    return null;
  }
}

function extractDroppedDirectoryPath(dataTransfer: DataTransfer): string | null {
  const files = Array.from(dataTransfer.files || []);
  const firstWithPath = files.find((file) => Boolean((file as File & { path?: string }).path));
  if (firstWithPath) return (firstWithPath as File & { path?: string }).path || null;

  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    const firstUri = uriList.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("#"));
    if (firstUri) {
      const decoded = decodeDroppedFileUri(firstUri);
      if (decoded) return decoded;
    }
  }

  const plain = dataTransfer.getData("text/plain").trim();
  if (plain.startsWith("/") || /^[A-Za-z]:[\\/]/.test(plain) || plain.startsWith("~/")) {
    return plain;
  }

  return null;
}

interface SessionTreeNode {
  session: SessionInfo;
  children: SessionTreeNode[];
}

function buildSessionTree(sessions: SessionInfo[]): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>();
  for (const s of sessions) {
    byId.set(s.id, { session: s, children: [] });
  }

  // Build a map of parentSessionId chains so we can resolve missing ancestors
  const parentOf = new Map<string, string>();
  for (const s of sessions) {
    if (s.parentSessionId) parentOf.set(s.id, s.parentSessionId);
  }

  // Walk up the parentSessionId chain to find the nearest ancestor that exists in byId
  function resolveAncestor(id: string): string | null {
    let cur = parentOf.get(id);
    const visited = new Set<string>();
    while (cur) {
      if (visited.has(cur)) return null; // cycle guard
      visited.add(cur);
      if (byId.has(cur)) return cur;
      cur = parentOf.get(cur);
    }
    return null;
  }

  const roots: SessionTreeNode[] = [];
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id);
    if (ancestor) {
      byId.get(ancestor)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort each level by modified desc
  const sort = (nodes: SessionTreeNode[]) => {
    nodes.sort((a, b) => b.session.modified.localeCompare(a.session.modified));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

function PiAgentTitle() {
  const [showVersion, setShowVersion] = useState(false);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(() => {
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);
    setShowVersion(true);
    revertTimerRef.current = setTimeout(() => setShowVersion(false), 3000);
  }, []);

  useEffect(() => () => { if (revertTimerRef.current) clearTimeout(revertTimerRef.current); }, []);

  return (
    <button
      onClick={handleClick}
      title={showVersion ? `web v${process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"} · pi v${process.env.NEXT_PUBLIC_PI_VERSION ?? "0.0.0"}` : "Pi Web.app"}
      style={{
        background: "none", border: "none", padding: 0, cursor: "default",
        display: "flex", alignItems: "center", gap: 8,
        color: showVersion ? "var(--accent)" : "var(--text)",
      }}
    >
      <img src="/pi-web-app-icon.png" alt="Pi Web.app" style={{ width: 32, height: 32, borderRadius: 8, display: "block" }} />
      {showVersion ? <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: "-0.01em", fontFamily: "var(--font-mono)" }}>{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}p{process.env.NEXT_PUBLIC_PI_VERSION ?? "0.0.0"}</span> : null}
    </button>
  );
}

export function SessionSidebar({ selectedSessionId, onSelectSession, onNewSession, initialSessionId, onInitialRestoreDone, refreshKey, onSessionDeleted, selectedCwd: selectedCwdProp, onCwdChange, onOpenFile, explorerRefreshKey, onAtMention, selectedWorkflowId, onSelectWorkflow, workflowRefreshKey }: Props) {
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customPathOpen, setCustomPathOpen] = useState(false);
  const [customPathValue, setCustomPathValue] = useState("");
  const [customPathError, setCustomPathError] = useState<string | null>(null);
  const [customPathValidating, setCustomPathValidating] = useState(false);
  const [projectPathDragOver, setProjectPathDragOver] = useState(false);
  const customPathInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<"sessions" | "workflows" | "files">("sessions");
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null);
  const [explorerKey, setExplorerKey] = useState(0);
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explorerRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { sessions: SessionInfo[] };
      setAllSessions(data.sessions);
      setError(null);
      if (!showLoading) {
        setSessionRefreshDone(true);
        if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
        sessionRefreshTimerRef.current = setTimeout(() => setSessionRefreshDone(false), 2000);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (showLoading) setLoading(false);
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

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst);
  }, [loadSessions, refreshKey]);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  useEffect(() => {
    if (activeSection === "workflows") void loadWorkflows();
  }, [activeSection, loadWorkflows]);

  useEffect(() => {
    if (workflowRefreshKey !== undefined) void loadWorkflows();
  }, [workflowRefreshKey, loadWorkflows]);

  useEffect(() => {
    if (explorerRefreshKey !== undefined) setExplorerKey((k) => k + 1);
  }, [explorerRefreshKey]);

  useEffect(() => {
    fetch("/api/home").then((r) => r.json()).then((d: { home?: string }) => {
      if (d.home) setHomeDir(d.home);
    }).catch(() => {});
  }, []);

  const restoredRef = useRef(false);

  useEffect(() => {
    onCwdChange?.(selectedCwd);
  }, [selectedCwd, onCwdChange]);

  // Auto-select cwd and restore session from URL on first load
  useEffect(() => {
    if (allSessions.length === 0) return;

    if (selectedCwd === null) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId && !restoredRef.current) {
        restoredRef.current = true;
        const target = allSessions.find((s) => s.id === initialSessionId);
        if (target) {
          setSelectedCwd(target.cwd);
          onSelectSession(target, true);
          return;
        }
        // Session not found — notify parent so it can show the placeholder
        onInitialRestoreDone?.();
      }
      const cwds = getRecentCwds(allSessions);
      if (cwds.length > 0) setSelectedCwd(cwds[0]);
    }
  }, [allSessions, selectedCwd, initialSessionId, onSelectSession, onInitialRestoreDone]);

  const commitCustomPath = useCallback(async () => {
    const path = customPathValue.trim();
    if (!path || customPathValidating) return;

    setCustomPathValidating(true);
    setCustomPathError(null);
    try {
      const res = await fetch("/api/cwd/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: path }),
      });
      const data = await res.json().catch(() => ({})) as { cwd?: string; error?: string };
      if (!res.ok || data.error) {
        setCustomPathError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSelectedCwd(data.cwd ?? path);
      setCustomPathOpen(false);
      setCustomPathValue("");
      setDropdownOpen(false);
    } catch (e) {
      setCustomPathError(e instanceof Error ? e.message : String(e));
    } finally {
      setCustomPathValidating(false);
    }
  }, [customPathValue, customPathValidating]);

  const handleDroppedProjectPath = useCallback(async (path: string) => {
    setCustomPathOpen(true);
    setCustomPathValue(path);
    setCustomPathError(null);
    setDropdownOpen(true);
    setProjectPathDragOver(false);
    setCustomPathValidating(true);
    try {
      const res = await fetch("/api/cwd/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: path }),
      });
      const data = await res.json().catch(() => ({})) as { cwd?: string; error?: string };
      if (!res.ok || data.error) {
        setCustomPathError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSelectedCwd(data.cwd ?? path);
      setCustomPathOpen(false);
      setCustomPathValue("");
      setCustomPathError(null);
      setDropdownOpen(false);
    } catch (e) {
      setCustomPathError(e instanceof Error ? e.message : String(e));
    } finally {
      setCustomPathValidating(false);
    }
  }, []);

  const handleProjectPathDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const path = extractDroppedDirectoryPath(e.dataTransfer);
    if (!path) {
      setProjectPathDragOver(false);
      setCustomPathError("这个浏览器拖拽目录时拿不到本地绝对路径，点下面的“选择文件夹…”更稳。");
      setCustomPathOpen(true);
      setDropdownOpen(true);
      return;
    }
    void handleDroppedProjectPath(path);
  }, [handleDroppedProjectPath]);

  const handleNativeFolderPick = useCallback(async () => {
    setCustomPathError(null);
    try {
      const res = await fetch("/api/cwd/pick", { method: "POST" });
      const data = await res.json().catch(() => ({})) as { cwd?: string; error?: string; cancelled?: boolean };
      if (data.cancelled) return;
      if (!res.ok || data.error || !data.cwd) {
        setCustomPathOpen(true);
        setDropdownOpen(true);
        setCustomPathError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSelectedCwd(data.cwd);
      setCustomPathOpen(false);
      setCustomPathValue("");
      setCustomPathError(null);
      setDropdownOpen(false);
    } catch (e) {
      setCustomPathOpen(true);
      setDropdownOpen(true);
      setCustomPathError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleDefaultCwd = useCallback(async () => {
    try {
      const res = await fetch("/api/default-cwd", { method: "POST" });
      const data = await res.json() as { cwd?: string; error?: string };
      if (data.cwd) {
        setSelectedCwd(data.cwd);
        setCustomPathOpen(false);
        setCustomPathValue("");
        setCustomPathError(null);
        setDropdownOpen(false);
      }
    } catch {
      // ignore
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setCustomPathOpen(false);
        setCustomPathValue("");
        setCustomPathError(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNewSession = useCallback(() => {
    const tempId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, selectedCwd ?? null);
  }, [selectedCwd, onNewSession]);

  const recentCwds = getRecentCwds(allSessions);
  const filteredSessions = selectedCwd
    ? allSessions.filter((s) => s.cwd === selectedCwd)
    : allSessions;

  // Build parent-child tree within the filtered set
  const sessionTree = buildSessionTree(filteredSessions);

  // ponytail: progressive render for long session lists — avoid rendering 200+ nodes at once
  const LIST_CHUNK = 50;
  const [visibleNodes, setVisibleNodes] = useState(LIST_CHUNK);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleNodes >= sessionTree.length) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisibleNodes((n) => Math.min(n + LIST_CHUNK, sessionTree.length));
      }
    }, { root: el.parentElement, rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleNodes, sessionTree.length]);

  // Reset visible count when tree changes (different session set)
  useEffect(() => { setVisibleNodes(LIST_CHUNK); }, [sessionTree.length]);

  const createWorkflow = useCallback(async () => {
    const name = window.prompt("Workflow 名称", "New Workflow");
    if (!name) return;
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, cwd: selectedCwdProp ?? selectedCwd ?? "", tasks: [] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.workflow) {
      alert(data?.error || "Workflow 创建失败");
      return;
    }
    onSelectWorkflow?.(data.workflow);
    void loadWorkflows();
  }, [loadWorkflows, onSelectWorkflow, selectedCwdProp, selectedCwd]);

  const runWorkflow = useCallback(async (workflow: WorkflowDefinition) => {
    setWorkflowBusyId(workflow.id);
    try {
      const input = window.prompt("本次 workflow 目标", workflow.description || workflow.name || "运行工作流");
      if (input === null) return;
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflow.id)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, cwd: selectedCwdProp ?? selectedCwd ?? workflow.cwd ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sessionId) {
        onNewSession?.(data.sessionId, data.workflow?.cwd || selectedCwdProp || selectedCwd || workflow.cwd || "");
      }
    } finally {
      setWorkflowBusyId(null);
    }
  }, [onNewSession, selectedCwdProp, selectedCwd]);

  const deleteWorkflow = useCallback(async (workflow: WorkflowDefinition) => {
    if (!window.confirm(`Delete workflow: ${workflow.name}?`)) return;
    await fetch(`/api/workflows/${encodeURIComponent(workflow.id)}`, { method: "DELETE" });
    if (selectedWorkflowId === workflow.id) onSelectWorkflow?.(null);
    await loadWorkflows();
  }, [loadWorkflows, onSelectWorkflow, selectedWorkflowId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 10px 10px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ height: 6 }} />

        {false && activeSection === "sessions" && !selectedSessionId && <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              padding: "6px 10px",
              background: selectedCwd ? "var(--bg-hover)" : "rgba(37,99,235,0.06)",
              border: selectedCwd ? "1px solid var(--border)" : "1px solid rgba(37,99,235,0.4)",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12,
              color: "var(--text)",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: selectedCwd ? "var(--text)" : "var(--text-dim)",
              }}
              title={selectedCwd ?? ""}
            >
              {selectedCwd ? shortenCwd(selectedCwd || "", homeDir) : (initialSessionId && !restoredRef.current ? "" : "Select project…")}
            </span>
          </button>

          {dropdownOpen && (
            <div
              onDragEnter={(e) => { e.preventDefault(); setProjectPathDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setProjectPathDragOver(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setProjectPathDragOver(false); }}
              onDrop={handleProjectPathDrop}
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                zIndex: 100,
                background: "var(--bg)",
                border: `1px solid ${projectPathDragOver ? "rgba(59,130,246,0.55)" : "var(--border)"}`,
                borderRadius: 8,
                boxShadow: projectPathDragOver ? "0 0 0 3px rgba(59,130,246,0.10), 0 6px 20px rgba(0,0,0,0.10)" : "0 6px 20px rgba(0,0,0,0.10)",
                overflow: "hidden",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
            >
              {projectPathDragOver && (
                <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "rgba(59,130,246,0.08)", color: "#2563eb", fontSize: 11, fontWeight: 600 }}>
                  松开以选择项目文件夹
                </div>
              )}
              {recentCwds.map((cwd) => (
                <button
                  key={cwd}
                  onClick={() => {
                    setSelectedCwd(cwd);
                    setCustomPathOpen(false);
                    setCustomPathValue("");
                    setCustomPathError(null);
                    setDropdownOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    padding: "8px 10px",
                    background: cwd === selectedCwd ? "var(--bg-selected)" : "none",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    color: cwd === selectedCwd ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={cwd}
                >
                  {cwd === selectedCwd && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="1.5 5 4 7.5 8.5 2.5" />
                    </svg>
                  )}
                  {cwd !== selectedCwd && <span style={{ width: 10, flexShrink: 0 }} />}
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortenCwd(cwd, homeDir)}</span>
                </button>
              ))}

              {!customPathOpen && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleNativeFolderPick(); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      width: "100%",
                      padding: "8px 10px",
                      background: "none",
                      border: "none",
                      borderTop: recentCwds.length > 0 ? "1px solid var(--border)" : "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 11,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                      <path d="M5 4.2v2.6" />
                      <path d="M3.7 5.5H6.3" />
                    </svg>
                    <span>选择文件夹…</span>
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); handleDefaultCwd(); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      width: "100%",
                      padding: "8px 10px",
                      background: "none",
                      border: "none",
                      borderTop: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 11,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                    </svg>
                    <span>Use default directory</span>
                  </button>
                </>
              )}

              {/* Custom path entry */}
              {!customPathOpen ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomPathOpen(true);
                    setCustomPathError(null);
                    setTimeout(() => customPathInputRef.current?.focus(), 0);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    padding: "8px 10px",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 11,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <line x1="5" y1="1" x2="5" y2="9" />
                    <line x1="1" y1="5" x2="9" y2="5" />
                  </svg>
                  <span>Custom path…</span>
                </button>
              ) : (
                <div style={{ padding: "6px 8px", borderTop: recentCwds.length > 0 ? "none" : undefined }}>
                  <input
                    ref={customPathInputRef}
                    value={customPathValue}
                    onChange={(e) => {
                      setCustomPathValue(e.target.value);
                      setCustomPathError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitCustomPath();
                      }
                      if (e.key === "Escape") {
                        setCustomPathOpen(false);
                        setCustomPathValue("");
                        setCustomPathError(null);
                      }
                    }}
                    placeholder="/path/to/project"
                    style={{
                      width: "100%",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      padding: "5px 8px",
                      border: "1px solid var(--accent)",
                      borderRadius: 5,
                      outline: "none",
                      background: "var(--bg)",
                      color: "var(--text)",
                      boxSizing: "border-box",
                    }}
                  />
                  {customPathError && (
                    <div style={{
                      marginTop: 5,
                      color: "#dc2626",
                      fontSize: 11,
                      lineHeight: 1.35,
                      overflowWrap: "anywhere",
                    }}>
                      {customPathError}
                    </div>
                  )}
                  <div style={{ marginTop: 6, padding: "6px 8px", border: `1px dashed ${projectPathDragOver ? "rgba(59,130,246,0.55)" : "var(--border)"}`, borderRadius: 6, background: projectPathDragOver ? "rgba(59,130,246,0.06)" : "var(--bg-hover)", color: projectPathDragOver ? "#2563eb" : "var(--text-dim)", fontSize: 11, textAlign: "center", transition: "border-color 0.15s, background 0.15s, color 0.15s" }}>
                    可拖拽文件夹；不行就点上面的“选择文件夹…”
                  </div>
                  <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                    <button
                      onClick={() => void commitCustomPath()}
                      disabled={customPathValidating || !customPathValue.trim()}
                      style={{
                        flex: 1,
                        padding: "4px 0",
                        background: "var(--accent)",
                        border: "none",
                        borderRadius: 5,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: customPathValidating || !customPathValue.trim() ? "not-allowed" : "pointer",
                        opacity: customPathValidating || !customPathValue.trim() ? 0.65 : 1,
                      }}
                    >
                      {customPathValidating ? "Checking…" : "Open"}
                    </button>
                    <button
                      onClick={() => { setCustomPathOpen(false); setCustomPathValue(""); setCustomPathError(null); }}
                      style={{
                        flex: 1,
                        padding: "4px 0",
                        background: "var(--bg-hover)",
                        border: "1px solid var(--border)",
                        borderRadius: 5,
                        color: "var(--text-muted)",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {([
            { id: "sessions", label: "对话" },
            { id: "workflows", label: "Workflow" },
            { id: "files", label: "资料" },
          ] as const).map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  padding: "7px 8px",
                  borderRadius: 8,
                  border: "none",
                  background: "none",
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: active ? 700 : 600,
                  textDecorationLine: active ? "underline" : "none",
                  textDecorationStyle: "solid",
                  textDecorationColor: active ? "currentColor" : "transparent",
                  textUnderlineOffset: "0.28em",
                  textDecorationThickness: "1.5px",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeSection === "sessions" && <div style={{ flex: "1 1 0", overflowY: "auto", padding: "0", minHeight: 80 }}>
        <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid color-mix(in srgb, var(--border) 65%, transparent)" }}>
          <button
            onClick={handleNewSession}
            title={selectedCwd ? `New session in ${selectedCwd}` : "新建对话"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "6px 4px",
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              opacity: 1,
              fontSize: 12,
              fontWeight: 600,
              textAlign: "left",
            }}
          >
            <span>新建对话</span>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          </button>
        </div>
        {loading && <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>Loading...</div>}
        {error && <div style={{ padding: "12px 14px", color: "#f87171", fontSize: 12 }}>{error}</div>}
        {!loading && !error && filteredSessions.length === 0 && <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>No sessions found</div>}
        {sessionTree.slice(0, visibleNodes).map((node) => (
          <SessionTreeItem
            key={node.session.id}
            node={node}
            selectedSessionId={selectedSessionId}
            onSelectSession={onSelectSession}
            onRenamed={loadSessions}
            onSessionDeleted={(id) => {
              onSessionDeleted?.(id);
              loadSessions();
            }}
            depth={0}
          />
        ))}
        {visibleNodes < sessionTree.length && <div ref={sentinelRef} style={{ height: 1 }} />}
      </div>}

      {activeSection === "workflows" && <div style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 10px 6px", borderBottom: "1px solid color-mix(in srgb, var(--border) 65%, transparent)", flexShrink: 0 }}>
          <button onClick={() => void createWorkflow()} title="New workflow" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, padding: 0, background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", borderRadius: 5, flexShrink: 0 }}>＋</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {workflows.length === 0 ? <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)" }}>还没有 workflow。点右上角 + 新建，主界面会直接进入编辑。</div> : workflows.map((workflow) => (
            <div
              key={workflow.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectWorkflow?.(workflow)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectWorkflow?.(workflow);
                }
              }}
              style={{ width: "100%", padding: "10px", borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: workflow.id === selectedWorkflowId ? "var(--bg-selected)" : "none", cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workflow.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{workflow.tasks?.length || 0} tasks · {workflow.reviewPolicy || "lead_plus_reviewer"}</div>
                {workflow.description ? <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)", whiteSpace: "pre-wrap" }}>{workflow.description}</div> : null}
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={(e) => { e.stopPropagation(); void runWorkflow(workflow); }} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", cursor: "pointer" }}>{workflowBusyId === workflow.id ? "..." : "Run"}</button>
                <button onClick={(e) => { e.stopPropagation(); void deleteWorkflow(workflow); }} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "#ef4444", cursor: "pointer" }}>Del</button>
              </div>
            </div>
          ))}
        </div>
      </div>}

      {activeSection === "files" && (selectedCwdProp || selectedCwd) && <div style={{ borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <button onClick={() => setExplorerOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, padding: "6px 10px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "left" }}>
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transform: explorerOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}><polyline points="3 2 7 5 3 8" /></svg>
            资源 / 物料
          </button>
          <button onClick={() => { setExplorerKey((k) => k + 1); setExplorerRefreshDone(true); if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current); explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000); }} title="Refresh explorer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, padding: 0, marginRight: 6, background: explorerRefreshDone ? "rgba(74,222,128,0.18)" : "none", border: "none", color: explorerRefreshDone ? "#4ade80" : "var(--text-dim)", cursor: "pointer", borderRadius: 5, flexShrink: 0, transition: "color 0.3s, background 0.3s" }}>↻</button>
        </div>
        {explorerOpen && <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}><FileExplorer cwd={selectedCwdProp ?? selectedCwd!} onOpenFile={onOpenFile ?? (() => {})} refreshKey={explorerKey} onAtMention={onAtMention} /></div>}
      </div>}
    </div>
  );
}

function SessionTreeItem({
  node,
  selectedSessionId,
  onSelectSession,
  onRenamed,
  onSessionDeleted,
  depth,
}: {
  node: SessionTreeNode;
  selectedSessionId: string | null;
  onSelectSession: (s: SessionInfo) => void;
  onRenamed?: () => void;
  onSessionDeleted?: (id: string) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div style={{ position: "relative" }}>
        {/* Indent line for child sessions */}
        {depth > 0 && (
          <div style={{
            position: "absolute",
            left: depth * 12 + 6,
            top: 0, bottom: 0,
            width: 1,
            background: "var(--border)",
            pointerEvents: "none",
          }} />
        )}
        <SessionItem
          session={node.session}
          isSelected={node.session.id === selectedSessionId}
          onClick={() => onSelectSession(node.session)}
          onRenamed={onRenamed}
          onDeleted={(id) => onSessionDeleted?.(id)}
          depth={depth}
          hasChildren={hasChildren}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </div>
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.id}
              node={child}
              selectedSessionId={selectedSessionId}
              onSelectSession={onSelectSession}
              onRenamed={onRenamed}
              onSessionDeleted={onSessionDeleted}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionItem({
  session,
  isSelected,
  onClick,
  onRenamed,
  onDeleted,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
}: {
  session: SessionInfo;
  isSelected: boolean;
  onClick: () => void;
  onRenamed?: () => void;
  onDeleted?: (id: string) => void;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);

  const startRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(session.name ?? "");
    setRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [session.name]);

  const commitRename = useCallback(async () => {
    const name = renameValue.trim();
    setRenaming(false);
    if (name === (session.name ?? "")) return;
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onRenamed?.();
    } catch {
      // ignore
    }
  }, [renameValue, session.id, session.name, onRenamed]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleDeleteConfirm = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
      onDeleted?.(session.id);
    } catch {
      setDeleting(false);
    }
  }, [session.id, onDeleted]);

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  // Fixed-height outer wrapper — content swaps in place so the list never reflows
  const ITEM_HEIGHT = 54;

  return (
    <div
      onClick={confirmDelete || renaming ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      style={{
        height: ITEM_HEIGHT,
        display: "flex",
        alignItems: "center",
        paddingLeft: depth > 0 ? depth * 12 + 14 : 14,
        paddingRight: 8,
        cursor: confirmDelete || renaming ? "default" : "pointer",
        background: confirmDelete
          ? "rgba(239,68,68,0.06)"
          : isSelected ? "var(--bg-selected)" : hovered ? "var(--bg-hover)" : "transparent",
        borderLeft: confirmDelete
          ? "2px solid #ef4444"
          : isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 0.1s",
        opacity: deleting ? 0.5 : 1,
        gap: 6,
        overflow: "hidden",
      }}
    >
      {confirmDelete ? (
        /* ── Delete confirmation: same height, two flat buttons ── */
        <>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Delete <span style={{ fontWeight: 600 }}>&ldquo;{title.slice(0, 22)}{title.length > 22 ? "…" : ""}&rdquo;</span>?
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            <button
              onClick={handleDeleteConfirm}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                height: 30, padding: "0 11px",
                background: "#ef4444", border: "none",
                borderRadius: 6, color: "#fff",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Delete
            </button>
            <button
              onClick={handleDeleteCancel}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: 30, padding: "0 11px",
                background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text-muted)",
                cursor: "pointer", fontSize: 12, fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : renaming ? (
        /* ── Rename: input fills the same row ── */
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          autoFocus
          style={{
            flex: 1,
            fontSize: 12,
            padding: "5px 8px",
            border: "1px solid var(--accent)",
            borderRadius: 5,
            outline: "none",
            background: "var(--bg)",
            color: "var(--text)",
            height: 30,
          }}
        />
      ) : (
        /* ── Normal view ── */
        <>
          {/* Fork indicator for child sessions */}
          {depth > 0 && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: isSelected ? 500 : 400,
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--text)",
              }}
              title={title}
            >
              {title}
            </div>
            <div style={{ marginTop: 2, display: "flex", gap: 8, color: "var(--text-dim)", fontSize: 11 }}>
              <span title={session.modified}>{formatRelativeTime(session.modified)}</span>
              <span>{session.messageCount} msgs</span>
            </div>
          </div>

          {/* Collapse toggle — always visible when has children */}
          {hasChildren && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
              title={collapsed ? "Expand forks" : "Collapse forks"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, padding: 0, flexShrink: 0,
                background: "none", border: "none",
                color: "var(--text-dim)", cursor: "pointer",
                transform: collapsed ? "rotate(-90deg)" : "none",
                transition: "transform 0.15s",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2 3.5 5 6.5 8 3.5" />
              </svg>
            </button>
          )}

          {/* Action buttons — shown on hover */}
          {hovered && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button
                onClick={startRename}
                title="Rename"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 7, color: "var(--text-muted)",
                  cursor: "pointer", flexShrink: 0,
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-selected)";
                  e.currentTarget.style.color = "var(--accent)";
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
              <button
                onClick={handleDeleteClick}
                title="Delete"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, padding: 0,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 7, color: "var(--text-muted)",
                  cursor: "pointer", flexShrink: 0,
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(239,68,68,0.08)";
                  e.currentTarget.style.color = "#ef4444";
                  e.currentTarget.style.borderColor = "rgba(239,68,68,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
