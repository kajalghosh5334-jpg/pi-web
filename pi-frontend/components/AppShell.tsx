"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SessionSidebar } from "./SessionSidebar";
import { ChatWindow } from "./ChatWindow";
import { FileViewer } from "./FileViewer";
import { TabBar, type Tab } from "./TabBar";
import { ModelsConfig } from "./ModelsConfig";
import { SkillsConfig } from "./SkillsConfig";
import { BranchNavigator } from "./BranchNavigator";
import { AgentWorkbench } from "./monitor/AgentWorkbench";
import { WorkflowEditor } from "./WorkflowEditor";
import { ProfilesPanel } from "./ProfilesPanel";
import { AgentDagView, AgentDetailView, ArtifactFlowView, ProjectMemoryView, StageFlowView } from "./monitor/MultiAgentVisuals";
import { useOrchestrate } from "@/hooks/useOrchestrate";
import { useTheme } from "@/hooks/useTheme";
import type { AgentMessage, SessionInfo, SessionTreeNode, WorkflowDefinition } from "@/lib/types";
import type { ChatInputHandle, AttachedImage } from "./ChatInput";

export function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDark, toggleTheme } = useTheme();
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);
  const [workflowRefreshKey, setWorkflowRefreshKey] = useState(0);
  // When user clicks +, we only store the cwd — no fake session id
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [draftChatOpen, setDraftChatOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  const [modelsConfigOpen, setModelsConfigOpen] = useState(false);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [skillsConfigOpen, setSkillsConfigOpen] = useState(false);
  const [profilesPanelOpen, setProfilesPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);

  // Branch navigator state — populated by ChatWindow via onBranchDataChange
  const [branchTree, setBranchTree] = useState<SessionTreeNode[]>([]);
  const [branchActiveLeafId, setBranchActiveLeafId] = useState<string | null>(null);
  const branchLeafChangeFnRef = useRef<((leafId: string | null) => void) | null>(null);

  const handleBranchDataChange = useCallback((tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => {
    setBranchTree(tree);
    setBranchActiveLeafId(activeLeafId);
    branchLeafChangeFnRef.current = onLeafChange;
  }, []);

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    branchLeafChangeFnRef.current?.(leafId);
  }, []);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const systemBtnRef = useRef<HTMLButtonElement>(null);

  const handleSystemPromptChange = useCallback((prompt: string | null) => {
    setSystemPrompt(prompt);
  }, []);

  // Session stats (tokens + cost) — populated by ChatWindow, displayed in top bar
  const [sessionStats, setSessionStats] = useState<{ tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null>(null);
  const handleSessionStatsChange = useCallback((stats: { tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null) => {
    setSessionStats(stats);
  }, []);

  // Context usage — populated by ChatWindow, displayed in top bar
  const [contextUsage, setContextUsage] = useState<{ percent: number | null; contextWindow: number; tokens: number | null } | null>(null);
  const handleContextUsageChange = useCallback((usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => {
    setContextUsage(usage);
  }, []);

  // Single active panel — only one dropdown open at a time
  const [activeTopPanel, setActiveTopPanel] = useState<"branches" | "system" | null>(null);
  const [topPanelPos, setTopPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const toggleTopPanel = useCallback((panel: "branches" | "system") => {
    setActiveTopPanel((cur) => cur === panel ? null : panel);
  }, []);

  useEffect(() => {
    if (!activeTopPanel || !topBarRef.current) return;
    const update = () => {
      const rect = topBarRef.current!.getBoundingClientRect();
      setTopPanelPos({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activeTopPanel]);

  // Right panel — file tabs + monitor
  const [fileTabs, setFileTabs] = useState<Tab[]>([]);
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const [multiAgentMode, setMultiAgentMode] = useState(false);
  const [guardianAutoMultiAgentSuppressed, setGuardianAutoMultiAgentSuppressed] = useState(false);
  const [multiAgentMessages, setMultiAgentMessages] = useState<AgentMessage[]>([]);
  const [focusedAgentTaskId, setFocusedAgentTaskId] = useState<string | null>(null);
  const persistedMultiAgentOutputRef = useRef<string | null>(null);
  const persistedProgressIdsRef = useRef<Set<string>>(new Set());
  const activeMultiAgentSessionRef = useRef<string | null>(null);
  const { state: orchestrateState, run: runOrchestrate, switchModel, abortTask, pauseTask, resumeTask, rerunTask, promoteProfile, promoteTaskSkills, confirm: confirmOrchestrate, clearProjectSummaries, refreshProjectMemory } = useOrchestrate();

  const multiAgentModeKey = selectedSession?.id
    ? `session:${selectedSession.id}`
    : null;

  const guardianSuppressionKey = selectedSession?.id
    ? `pi.guardianAutoMultiAgentSuppressed.session:${selectedSession.id}`
    : null;

  useEffect(() => {
    if (!multiAgentModeKey) {
      setMultiAgentMode(false);
      setGuardianAutoMultiAgentSuppressed(false);
      return;
    }
    setMultiAgentMode(localStorage.getItem(`pi.multiAgentMode.${multiAgentModeKey}`) === "1");
    setGuardianAutoMultiAgentSuppressed(guardianSuppressionKey ? localStorage.getItem(guardianSuppressionKey) === "1" : false);
  }, [multiAgentModeKey, guardianSuppressionKey]);

  const abortCurrentMultiAgent = useCallback(async () => {
    const sessionId = orchestrateState.sessionId || activeMultiAgentSessionRef.current;
    if (!sessionId) return;
    await fetch(`/api/orchestrate/${encodeURIComponent(sessionId)}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Multi-Agent switch turned off" }),
    }).catch(() => {});
    setMultiAgentMessages([]);
    activeMultiAgentSessionRef.current = null;
  }, [orchestrateState.sessionId]);

  const toggleMultiAgentMode = useCallback(() => {
    setMultiAgentMode((prev) => {
      const next = !prev;
      if (multiAgentModeKey) {
        localStorage.setItem(`pi.multiAgentMode.${multiAgentModeKey}`, next ? "1" : "0");
      }
      if (guardianSuppressionKey) {
        if (!next) {
          localStorage.setItem(guardianSuppressionKey, "1");
          setGuardianAutoMultiAgentSuppressed(true);
        } else {
          localStorage.removeItem(guardianSuppressionKey);
          setGuardianAutoMultiAgentSuppressed(false);
        }
      }
      if (!next) void abortCurrentMultiAgent();
      return next;
    });
  }, [multiAgentModeKey, guardianSuppressionKey, abortCurrentMultiAgent]);

  const handleAtMention = useCallback((relativePath: string) => {
    chatInputRef.current?.insertText("`" + relativePath + "`");
  }, []);

  const appendMessageToSession = useCallback(async (message: AgentMessage, sessionId = selectedSession?.id): Promise<boolean> => {
    if (!sessionId) return false;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/append-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [selectedSession?.id]);

  const ensureMultiAgentSession = useCallback(async (firstMessage: string): Promise<string | null> => {
    if (selectedSession?.id) return selectedSession.id;
    const cwd = newSessionCwd || activeCwd;
    if (!cwd) return null;

    const res = await fetch("/api/sessions/create-empty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, name: firstMessage.slice(0, 80) || "Multi-Agent Session" }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { sessionId?: string; filePath?: string };
    if (!data.sessionId) return null;

    const session: SessionInfo = {
      id: data.sessionId,
      path: data.filePath || "",
      cwd,
      name: firstMessage.slice(0, 80) || "Multi-Agent Session",
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      messageCount: 0,
      firstMessage: firstMessage || "(no messages)",
    };
    setNewSessionCwd(null);
    setSelectedSession(session);
    if (multiAgentMode) {
      localStorage.setItem(`pi.multiAgentMode.session:${data.sessionId}`, "1");
    }
    setRefreshKey((k) => k + 1);
    router.replace(`?session=${encodeURIComponent(data.sessionId)}`, { scroll: false });
    return data.sessionId;
  }, [selectedSession?.id, selectedSession, newSessionCwd, activeCwd, router, multiAgentMode]);

  const buildContextualMultiAgentInput = useCallback(async (latestMessage: string, sessionId: string | null): Promise<string> => {
    if (!sessionId) return latestMessage;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return latestMessage;
      const data = await res.json() as { context?: { messages?: Array<{ role?: string; content?: unknown }> } };
      const recent = (data.context?.messages || [])
        .slice(-8)
        .map((m) => {
          const content = typeof m.content === "string"
            ? m.content
            : Array.isArray(m.content)
              ? m.content.map((b) => typeof b === "string" ? b : ((b as { text?: string }).text || "")).join("")
              : "";
          return `${m.role || "message"}: ${content}`;
        })
        .filter((line) => line.trim())
        .join("\n");
      if (!recent) return latestMessage;
      return `这是当前主对话的最近上下文，请基于上下文理解用户最新消息，不要因为最新消息很短就要求用户重复项目目标。\n\n${recent}\n\n用户最新消息：${latestMessage}`;
    } catch {
      return latestMessage;
    }
  }, []);

  const isCoachingIntent = useCallback((message: string) => {
    return /不满意|不太满意|继续调教|调教|改得不对|结果不对|这部分不对|不符合|再优化|重新优化|修正这个结果|teach|coach|not satisfied/i.test(message);
  }, []);

  const getMultiAgentAssistantText = useCallback(() => {
    return orchestrateState.mainOutput || (
      orchestrateState.phase === "guardian" ? "🧠 Guardian 正在分析任务..." :
      orchestrateState.phase === "running" ? "🤖 Sub-Agents 正在并行工作，详情见右侧监控面板..." :
      orchestrateState.phase === "waiting_confirmation" ? `⏸️ 子 Agent 需要确认：${orchestrateState.pendingConfirmation?.question ?? "请在右侧监控面板确认后继续"}` :
      orchestrateState.phase === "synthesizing" ? "⚡ 正在整合各 Sub-Agent 结果..." :
      orchestrateState.phase === "error" ? `❌ ${orchestrateState.error ?? "多Agent执行失败"}` :
      ""
    );
  }, [orchestrateState.mainOutput, orchestrateState.phase, orchestrateState.error, orchestrateState.pendingConfirmation]);

  const handleMultiAgentSend = useCallback(async (message: string) => {
    if (!message.trim()) return;
    const now = Date.now();
    const userMsg: AgentMessage = { role: "user", content: message, timestamp: now };
    persistedMultiAgentOutputRef.current = null;

    const sessionId = await ensureMultiAgentSession(message);
    activeMultiAgentSessionRef.current = sessionId;
    await appendMessageToSession(userMsg, sessionId || undefined);

    // Reload the real session so the user message is shown from persisted history.
    setSessionKey((k) => k + 1);
    setRefreshKey((k) => k + 1);

    // Only the in-progress assistant status is temporary. Final assistant output
    // is appended to the session and then this temporary message is cleared.
    setMultiAgentMessages([{
      role: "assistant",
      content: [{ type: "text", text: "🧠 Guardian 正在分析任务..." }],
      model: "multi-agent",
      provider: "orchestrator",
      timestamp: now + 1,
    }]);

    const orchestrateInput = await buildContextualMultiAgentInput(message, sessionId);
    await runOrchestrate(orchestrateInput, { cwd: selectedSession?.cwd ?? newSessionCwd ?? activeCwd, sessionId });
  }, [runOrchestrate, appendMessageToSession, ensureMultiAgentSession, buildContextualMultiAgentInput, selectedSession?.cwd, newSessionCwd, activeCwd]);

  const runMultiAgentInBackground = useCallback(async (message: string) => {
    const now = Date.now();
    // 如果普通主模型还在创建新会话，先不抢建另一个 Multi-Agent session，避免一条消息分裂成两个会话。
    if (!selectedSession?.id) return;
    const sessionId = selectedSession.id;
    activeMultiAgentSessionRef.current = sessionId;

    // 不向主对话插入 Multi-Agent 提示文字；状态只显示在右侧监控面板。
    setMultiAgentMessages([]);

    const orchestrateInput = await buildContextualMultiAgentInput(message, sessionId);
    await runOrchestrate(orchestrateInput, { cwd: selectedSession?.cwd ?? activeCwd ?? newSessionCwd, sessionId });
  }, [selectedSession?.id, selectedSession?.cwd, activeCwd, newSessionCwd, ensureMultiAgentSession, buildContextualMultiAgentInput, runOrchestrate]);

  const handleGuardianRoutedSend = useCallback(async (
    message: string,
    images: AttachedImage[] | undefined,
    defaultSend: (message: string, images?: AttachedImage[]) => void | Promise<void>,
  ) => {
    if (!selectedSession?.id && !(newSessionCwd ?? activeCwd)) {
      window.alert("先选择工作地址，再发送第一句消息。");
      return;
    }

    // 用户明确不满意时：直接触发 agent-coach 调教闭环，不等待 Guardian 重新规划。
    if (selectedSession?.id && isCoachingIntent(message)) {
      setMultiAgentMode(true);
      localStorage.setItem(`pi.multiAgentMode.session:${selectedSession.id}`, "1");
      void runMultiAgentInBackground(message);
      return;
    }

    // Multi-Agent 开关打开时：本轮直接由 Lead 接管，主对话不再深答。
    if (multiAgentMode) {
      await handleMultiAgentSend(message);
      return;
    }

    // 当前会话里用户主动关闭过 Multi-Agent，表示用户接管控制权；Guardian 不再自动开关。
    if (guardianAutoMultiAgentSuppressed) {
      void defaultSend(message, images);
      return;
    }

    // 开关未开时：先做超轻量 owner 判定。复杂任务直接由 Lead 接管，避免同轮双线程深答。
    const res = await fetch("/api/guardian/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: message, sessionId: selectedSession?.id }),
    }).catch(() => null);
    const decision = res ? await res.json().catch(() => null) : null;

    if (decision?.shouldUseMultiAgent) {
      setMultiAgentMode(true);
      const key = selectedSession?.id ? `session:${selectedSession.id}` : null;
      if (key) localStorage.setItem(`pi.multiAgentMode.${key}`, "1");
      await handleMultiAgentSend(message);
      return;
    }

    // 简单任务仍由主对话直接处理。
    void defaultSend(message, images);
  }, [multiAgentMode, guardianAutoMultiAgentSuppressed, runMultiAgentInBackground, selectedSession?.id, newSessionCwd, activeCwd, isCoachingIntent, handleMultiAgentSend]);

  const pickDraftCwd = useCallback(async () => {
    const res = await fetch("/api/cwd/pick", { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) as { cwd?: string; error?: string; cancelled?: boolean } : null;
    if (!res || !res.ok || !data?.cwd) {
      if (data?.cancelled) return;
      window.alert(data?.error || "选择地址失败");
      return;
    }
    setActiveCwd(data.cwd);
    setNewSessionCwd(data.cwd);
  }, []);

  const handleFileContextSend = useCallback(async (
    message: string,
    images: AttachedImage[] | undefined,
    defaultSend: (message: string, images?: AttachedImage[]) => void | Promise<void>,
  ) => {
    const filePath = fileTabs.find((t) => t.id === activeFileTabId)?.filePath;
    const contextualMessage = filePath
      ? `当前正在查看文件：\`${filePath}\`\n\n用户问题：${message}`
      : message;
    await handleGuardianRoutedSend(contextualMessage, images, defaultSend);
  }, [activeFileTabId, fileTabs, handleGuardianRoutedSend]);

  useEffect(() => {
    const text = getMultiAgentAssistantText();
    if (!text) return;
    setMultiAgentMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === "assistant" && "model" in m && m.model === "multi-agent");
      if (idx < 0) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.map((m, i) => i === realIdx ? {
        role: "assistant",
        content: [{ type: "text", text }],
        model: "multi-agent",
        provider: "orchestrator",
        timestamp: m.timestamp,
      } : m);
    });
    if (orchestrateState.phase === "done" && orchestrateState.mainOutput && persistedMultiAgentOutputRef.current !== orchestrateState.mainOutput) {
      persistedMultiAgentOutputRef.current = orchestrateState.mainOutput;
      void (async () => {
        const saved = await appendMessageToSession({
          role: "assistant",
          content: [{ type: "text", text: orchestrateState.mainOutput }],
          model: "multi-agent",
          provider: "orchestrator",
          timestamp: Date.now(),
        }, activeMultiAgentSessionRef.current || undefined);
        if (saved) {
          setSessionKey((k) => k + 1);
          setRefreshKey((k) => k + 1);
          setExplorerRefreshKey((k) => k + 1);
          setMultiAgentMessages([]);
          activeMultiAgentSessionRef.current = null;
        }
      })();
    }
  }, [getMultiAgentAssistantText, orchestrateState.phase, orchestrateState.mainOutput, appendMessageToSession]);

  useEffect(() => {
    const sessionId = orchestrateState.sessionId || activeMultiAgentSessionRef.current || selectedSession?.id;
    if (!sessionId) return;
    for (const update of orchestrateState.progressUpdates || []) {
      if (!update?.id || persistedProgressIdsRef.current.has(update.id)) continue;
      persistedProgressIdsRef.current.add(update.id);
      void appendMessageToSession({
        role: "custom",
        customType: "collaboration_progress",
        content: update.text,
        display: true,
        details: update,
        timestamp: update.timestamp,
      }, sessionId);
    }
  }, [orchestrateState.progressUpdates, orchestrateState.sessionId, selectedSession?.id, appendMessageToSession]);

  const [initialSessionId] = useState<string | null>(() => searchParams.get("session"));
  // True once the initial ?session= URL param has been resolved (or confirmed absent)
  const [initialSessionRestored, setInitialSessionRestored] = useState<boolean>(() => !searchParams.get("session"));
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);

  const handleCwdChange = useCallback((cwd: string | null) => {
    setActiveCwd(cwd);
    // Skip if cwd is null (initial mount) or during the initial URL restore.
    if (!cwd) return;
    if (suppressCwdBumpRef.current) {
      suppressCwdBumpRef.current = false;
      return;
    }
    // Close any session that belongs to a different cwd — it no longer
    // matches the selected project directory.
    setSelectedWorkflow(null);
    setSelectedSession((prev) => {
      if (prev && prev.cwd !== cwd) return null;
      return prev;
    });
    setNewSessionCwd((prev) => {
      if (prev && prev !== cwd) return null;
      return prev;
    });
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
    router.replace("/", { scroll: false });
  }, [router]);

  const handleSelectSession = useCallback((session: SessionInfo, isRestore = false) => {
    setDraftChatOpen(false);
    setNewSessionCwd(null);
    setSelectedWorkflow(null);
    setSelectedSession(session);
    setSessionKey((k) => k + 1);
    setSystemPrompt(null);
    setInitialSessionRestored(true);
    if (isRestore) {
      // Suppress the redundant sessionKey bump that would come from the
      // onCwdChange effect firing after setSelectedCwd in the sidebar
      suppressCwdBumpRef.current = true;
    }
    // Skip router.replace when restoring from URL — the param is already correct
    // and calling replace in production Next.js triggers a Suspense remount loop
    if (!isRestore) {
      router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
    }
  }, [router]);

  const handleNewSession = useCallback(async (sessionId: string, cwd: string | null) => {
    if (sessionId) {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
        if (res.ok) {
          const data = await res.json() as { info?: SessionInfo };
          if (data.info) {
            setNewSessionCwd(null);
            setSelectedWorkflow(null);
            setSelectedSession(data.info);
            setRefreshKey((k) => k + 1);
            router.replace(`?session=${encodeURIComponent(data.info.id)}`, { scroll: false });
            return;
          }
        }
      } catch {}
    }
    setSelectedWorkflow(null);
    setSelectedSession(null);
    setRightPanelOpen(false);
    setDraftChatOpen(true);
    setNewSessionCwd(cwd ?? null);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
    router.replace("/", { scroll: false });
  }, [router]);

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback((session: SessionInfo) => {
    setDraftChatOpen(false);
    setNewSessionCwd(null);
    setSelectedWorkflow(null);
    setSelectedSession(session);
    setRefreshKey((k) => k + 1);
    router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
  }, [router]);

  const handleAgentEnd = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setExplorerRefreshKey((k) => k + 1);
  }, []);

  const handleSessionForked = useCallback((newSessionId: string) => {
    setRefreshKey((k) => k + 1);
    setSessionKey((k) => k + 1);
    setNewSessionCwd(null);
    setSelectedWorkflow(null);
    setSelectedSession((prev) => ({
      ...(prev ?? { path: "", cwd: "", created: "", modified: "", messageCount: 0, firstMessage: "" }),
      id: newSessionId,
    }));
    router.replace(`?session=${encodeURIComponent(newSessionId)}`, { scroll: false });
  }, [router]);

  const handleInitialRestoreDone = useCallback(() => {
    setInitialSessionRestored(true);
  }, []);

  const handleSessionDeleted = useCallback((sessionId: string) => {
    setRefreshKey((k) => k + 1);
    if (selectedSession?.id === sessionId) {
      const cwd = selectedSession.cwd;
      setSelectedWorkflow(null);
      setSelectedSession(null);
      setRightPanelOpen(false);
      setDraftChatOpen(true);
      setNewSessionCwd(cwd ?? null);
      setSessionKey((k) => k + 1);
      setBranchTree([]);
      setBranchActiveLeafId(null);
      setSystemPrompt(null);
      setActiveTopPanel(null);
      router.replace("/", { scroll: false });
    }
  }, [selectedSession, router]);

  const handleSelectWorkflow = useCallback((workflow: WorkflowDefinition | null) => {
    setDraftChatOpen(false);
    setSelectedSession(null);
    setNewSessionCwd(null);
    setSelectedWorkflow(workflow);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
    router.replace("/", { scroll: false });
  }, [router]);

  const handleWorkflowChange = useCallback((workflow: WorkflowDefinition) => {
    setSelectedWorkflow(workflow);
    setWorkflowRefreshKey((k) => k + 1);
  }, []);

  const handleWorkflowDeleted = useCallback(() => {
    setSelectedWorkflow(null);
    setWorkflowRefreshKey((k) => k + 1);
  }, []);

  const handleWorkflowRan = useCallback(async (sessionId: string, cwd: string) => {
    setSelectedWorkflow(null);
    await handleNewSession(sessionId, cwd);
  }, [handleNewSession]);

  const handleOpenFile = useCallback((filePath: string, fileName: string) => {
    const tabId = `file:${filePath}`;
    setFileTabs((prev) => {
      if (prev.find((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, label: fileName, filePath }];
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(false);
    setSidebarOpen(false);
  }, []);

  const handleCloseFileTab = useCallback((tabId: string) => {
    setFileTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) setRightPanelOpen(false);
      return next;
    });
    setActiveFileTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = fileTabs.filter((t) => t.id !== tabId);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [fileTabs]);

  const handleExportSession = useCallback(() => {
    if (!selectedSession) return;
    window.location.href = `/api/sessions/${encodeURIComponent(selectedSession.id)}/export`;
  }, [selectedSession]);

  const handlePromoteSessionProfile = useCallback(async () => {
    if (!selectedSession?.id) return;
    const name = window.prompt("Profile 名称", `${selectedSession.name || selectedSession.firstMessage || "Session"} Profile`);
    if (!name) return;
    const description = window.prompt("Profile 说明", selectedSession.firstMessage || "");
    const res = await fetch(`/api/sessions/${encodeURIComponent(selectedSession.id)}/promote-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, sessionName: selectedSession.name, firstMessage: selectedSession.firstMessage, cwd: selectedSession.cwd }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return window.alert(data?.error || "保存为 Profile 失败");
    window.alert(`已保存为 Profile：${data.profile?.name || data.profile?.id || name}`);
  }, [selectedSession]);

  const handleRenameProfile = useCallback(async (profileId: string, name: string) => {
    const res = await fetch(`/api/agent-profiles/${encodeURIComponent(profileId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return res.json().catch(() => ({ ok: res.ok, error: "rename failed" }));
  }, []);

  const handleSaveWorkflow = useCallback(async () => {
    if (!orchestrateState.sessionId) return;
    const baseTitle = (selectedSession?.name || selectedSession?.firstMessage || "当前对话").trim();
    const name = window.prompt("Workflow 名称", `${baseTitle} Workflow`);
    if (!name) return;
    const description = window.prompt("Workflow 说明", baseTitle);
    const res = await fetch(`/api/workflows/from-session/${encodeURIComponent(orchestrateState.sessionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return window.alert(data?.error || "保存为 Workflow 失败");
    window.alert(`已保存为 Workflow：${data.workflow?.name || data.workflow?.id || name}`);
  }, [orchestrateState.sessionId, selectedSession]);

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && !selectedWorkflow && draftChatOpen ? activeCwd : null);
  const showWorkflow = selectedWorkflow !== null;
  const showChat = !showWorkflow && (selectedSession !== null || draftChatOpen || effectiveNewSessionCwd !== null);

  useEffect(() => {
    // Clear only when navigating to a different saved session. If we just created
    // a session for the current Multi-Agent turn, keep the optimistic messages visible
    // until the persisted session reload catches up.
    if (selectedSession?.id && selectedSession.id !== activeMultiAgentSessionRef.current) {
      setMultiAgentMessages([]);
    }
    persistedProgressIdsRef.current.clear();
  }, [selectedSession?.id, effectiveNewSessionCwd]);
  // While restoring initial session from URL, don't show the placeholder
  const showPlaceholder = initialSessionRestored && !showChat && !showWorkflow;

  const activeFileTab = fileTabs.find((t) => t.id === activeFileTabId) ?? null;
  const workspaceMode: "workflow" | "chat" | "file" | "agent" | "empty" = showWorkflow
    ? "workflow"
    : activeFileTab?.filePath
    ? "file"
    : focusedAgentTaskId && orchestrateState.tasks.some((t) => t.id === focusedAgentTaskId)
      ? "agent"
      : showChat
        ? "chat"
        : "empty";
  const filePreviewMode = workspaceMode === "file";
  const conversationTitle = (selectedWorkflow?.name || selectedSession?.name || selectedSession?.firstMessage || "当前对话").trim();
  const collaborationSummary = {
    running: orchestrateState.tasks.filter((t) => t.status === "running").length,
    needsConfirmation: orchestrateState.tasks.filter((t) => t.status === "waiting_confirmation").length,
    waiting: orchestrateState.tasks.filter((t) => (t.collaborationStatus || "").startsWith("waiting") || t.status === "waiting_for_dependency").length,
    debugging: orchestrateState.tasks.filter((t) => t.collaborationStatus === "debugging").length,
    review: orchestrateState.tasks.filter((t) => t.collaborationStatus === "ready_for_review").length,
    blocked: orchestrateState.tasks.filter((t) => t.collaborationStatus === "blocked" || t.status === "error").length,
    stage: orchestrateState.flowState?.currentStage || "未开始",
    artifactsReady: orchestrateState.artifacts.filter((a) => a.status === "ready").length,
    artifactsTotal: orchestrateState.artifacts.length,
  };
  const collaborationAccessory = showChat && workspaceMode !== "agent" ? (
    <div
      role="button"
      tabIndex={0}
      onClick={selectedSession?.id ? () => setRightPanelOpen((v) => !v) : () => void pickDraftCwd()}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (selectedSession?.id) setRightPanelOpen((v) => !v);
        else void pickDraftCwd();
      }}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: 0,
        background: "transparent",
        border: "none",
        color: "var(--text)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {!selectedSession?.id ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minWidth: 0, width: "100%" }}>
          <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 750, letterSpacing: "0.01em", flexShrink: 0 }}>地址</span>
            <span style={{ fontSize: 11, color: newSessionCwd || activeCwd ? "var(--text-muted)" : "var(--text-dim)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={newSessionCwd || activeCwd || ""}>
              {newSessionCwd || activeCwd || "先选择工作地址"}
            </span>
          </div>
          <span style={{ fontSize: 10, color: "#f59e0b", padding: "2px 6px", borderRadius: 999, background: "rgba(245,158,11,0.10)", flexShrink: 0 }}>用户接管</span>
        </div>
      ) : !multiAgentMode ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 750, letterSpacing: "0.01em" }}>协作</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{collaborationSummary.stage}</span>
          {guardianAutoMultiAgentSuppressed && <span style={{ fontSize: 10, color: "#f59e0b", padding: "2px 6px", borderRadius: 999, background: "rgba(245,158,11,0.10)" }}>用户接管</span>}
        </div>
      ) : (() => {
        const chips: { label: string; value: number | string; color: string }[] = [];
        if (collaborationSummary.running > 0) chips.push({ label: "运行", value: collaborationSummary.running, color: "#3b82f6" });
        if (collaborationSummary.needsConfirmation > 0) chips.push({ label: "需确认", value: collaborationSummary.needsConfirmation, color: "#f97316" });
        if (collaborationSummary.waiting > 0) chips.push({ label: "等待", value: collaborationSummary.waiting, color: "#8b5cf6" });
        if (collaborationSummary.debugging > 0) chips.push({ label: "调试", value: collaborationSummary.debugging, color: "#f59e0b" });
        if (collaborationSummary.review > 0) chips.push({ label: "审查", value: collaborationSummary.review, color: "#22c55e" });
        if (collaborationSummary.blocked > 0) chips.push({ label: "阻塞", value: collaborationSummary.blocked, color: "#ef4444" });
        if (collaborationSummary.artifactsTotal > 0) chips.push({ label: "产物", value: `${collaborationSummary.artifactsReady}/${collaborationSummary.artifactsTotal}`, color: "var(--text-muted)" });
        return (
          <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 750, letterSpacing: "0.01em" }}>协作</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>阶段：{collaborationSummary.stage}</span>
            {guardianAutoMultiAgentSuppressed && <span style={{ fontSize: 10, color: "#f59e0b", padding: "2px 6px", borderRadius: 999, background: "rgba(245,158,11,0.10)" }}>用户接管</span>}
            {collaborationSummary.needsConfirmation > 0 && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f97316", display: "inline-block", flexShrink: 0 }} />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" }}>
              {chips.map(({ label, value, color }) => (
                <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 999, background: "var(--bg-secondary)", fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  <span style={{ color, fontWeight: 700 }}>{label}</span>
                  <span>{value}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: selectedSession?.id && rightPanelOpen ? "rotate(90deg)" : "none", transition: "transform 0.18s ease", color: "var(--text-muted)", flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  ) : null;

  const sidebarContent = (
    <>
      <SessionSidebar
        selectedSessionId={selectedSession?.id ?? null}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        initialSessionId={initialSessionId}
        onInitialRestoreDone={handleInitialRestoreDone}
        refreshKey={refreshKey}
        onSessionDeleted={handleSessionDeleted}
        selectedCwd={selectedSession?.cwd ?? newSessionCwd ?? null}
        onCwdChange={handleCwdChange}
        onOpenFile={handleOpenFile}
        explorerRefreshKey={explorerRefreshKey}
        onAtMention={handleAtMention}
        selectedWorkflowId={selectedWorkflow?.id ?? null}
        onSelectWorkflow={handleSelectWorkflow}
        workflowRefreshKey={workflowRefreshKey}
      />
      <div style={{ padding: "8px", flexShrink: 0, display: "flex", justifyContent: "space-between", gap: 4 }}>
        {([
          {
            label: "Models",
            onClick: () => setModelsConfigOpen(true),
            disabled: false,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
              </svg>
            ),
          },
          {
            label: "Skills",
            onClick: () => setSkillsConfigOpen(true),
            disabled: !activeCwd && !selectedSession?.cwd && !newSessionCwd,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            ),
          },
        ] as { label: string; onClick: () => void; disabled: boolean; icon: React.ReactNode }[]).map(({ label, onClick, disabled, icon }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={disabled}
            title={label}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              height: 32, padding: 0, background: "none", border: "none",
              borderRadius: 9, color: "var(--text-muted)", cursor: disabled ? "default" : "pointer",
              fontSize: 12, opacity: disabled ? 0.35 : 1,
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <>
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "var(--bg)" }}>
      {/* Mobile overlay backdrop */}
      <div
        className="sidebar-overlay-backdrop"
        onClick={() => setSidebarOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 199,
          background: "rgba(0,0,0,0.4)",
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      />

      {/* Left sidebar */}
      <div
        className={`sidebar-container${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}
        style={{
          background: "var(--bg-panel)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          zIndex: 200,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {sidebarContent}
        {rightPanelOpen && showChat && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: "var(--bg-panel)",
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 10px", borderBottom: "1px solid var(--border)", minWidth: 0, flexShrink: 0 }}>
              <button
                onClick={() => setRightPanelOpen(false)}
                style={{ width: 24, height: 24, borderRadius: 8, border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0 }}
                title="收起协作区"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div style={{ minWidth: 0, flex: 1, fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conversationTitle}</div>
              {!focusedAgentTaskId && orchestrateState.sessionId && orchestrateState.tasks.length > 0 ? <button onClick={() => void handleSaveWorkflow()} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", cursor: "pointer", flexShrink: 0 }}>保存为 Workflow</button> : null}
              <button
                onClick={toggleMultiAgentMode}
                style={{ width: 32, height: 18, borderRadius: 10, border: "none", cursor: "pointer", background: multiAgentMode ? "#3b82f6" : "var(--border)", position: "relative", flexShrink: 0 }}
                title={multiAgentMode ? "关闭 Multi-Agent" : "开启 Multi-Agent"}
              >
                <span style={{ position: "absolute", top: 2, left: multiAgentMode ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {focusedAgentTaskId ? (
                  <AgentDetailView
                    task={orchestrateState.tasks.find((t) => t.id === focusedAgentTaskId)}
                    artifacts={orchestrateState.artifacts}
                    onAbort={abortTask}
                    onPause={pauseTask}
                    onResume={resumeTask}
                  />
                ) : (
                  <>
                    <StageFlowView flowState={orchestrateState.flowState} />
                    <ProjectMemoryView memory={orchestrateState.projectMemory} onRefresh={() => orchestrateState.sessionId && void refreshProjectMemory(orchestrateState.sessionId)} onClearSummaries={() => void clearProjectSummaries()} />
                    <AgentDagView
                      tasks={orchestrateState.tasks}
                      artifacts={orchestrateState.artifacts}
                      onOpenTask={setFocusedAgentTaskId}
                      onSwitchModel={switchModel}
                      onAbortTask={abortTask}
                      onPauseTask={pauseTask}
                      onResumeTask={resumeTask}
                      pendingConfirmation={orchestrateState.pendingConfirmation}
                      onConfirm={confirmOrchestrate}
                    />
                    <ArtifactFlowView artifacts={orchestrateState.artifacts} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Center: chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar with sidebar toggle */}
        <div ref={topBarRef} style={{ display: "flex", alignItems: "center", flexShrink: 0, borderBottom: "1px solid var(--border)", height: 36, background: "var(--bg-panel)" }}>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, padding: 0,
              background: "none", border: "none", borderRight: "1px solid var(--border)",
              color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {sidebarOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
          {selectedSession ? <button onClick={() => void handlePromoteSessionProfile()} title="保存当前对话为 Profile" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 36, padding: "0 10px", background: "none", border: "none", borderRight: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s", fontSize: 12, fontWeight: 600 }} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}>保存为Profile</button> : null}
          <button onClick={() => setProfilesPanelOpen(true)} title="管理 Profile 名称" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 36, padding: "0 10px", background: "none", border: "none", borderRight: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s", fontSize: 12, fontWeight: 600 }} onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}>Profile</button>
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            }}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={isDark}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, padding: 0,
              background: "none", border: "none", borderRight: "1px solid var(--border)",
              color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          {showChat && (
            <div style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
              <button
                onClick={handleExportSession}
                disabled={!selectedSession}
                title={selectedSession ? "Export HTML" : "Export is available after the session is saved"}
                aria-label="Export HTML"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: "100%",
                  padding: "0 12px",
                  background: "none",
                  border: "none",
                  borderTop: "2px solid transparent",
                  borderRight: "1px solid var(--border)",
                  color: selectedSession ? "var(--text-muted)" : "var(--text-dim)",
                  cursor: selectedSession ? "pointer" : "not-allowed",
                  opacity: selectedSession ? 1 : 0.45,
                  flexShrink: 0,
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  transition: "color 0.1s, background 0.1s, opacity 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!selectedSession) return;
                  e.currentTarget.style.color = "var(--text)";
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = selectedSession ? "var(--text-muted)" : "var(--text-dim)";
                  e.currentTarget.style.background = "none";
                }}
              >
                <span style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  background: "transparent",
                  color: selectedSession ? "var(--text-muted)" : "var(--text-dim)",
                  flexShrink: 0,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                <span>Export</span>
              </button>
              <BranchNavigator
                tree={branchTree}
                activeLeafId={branchActiveLeafId}
                onLeafChange={handleBranchLeafChange}
                inline
                containerRef={topBarRef}
                open={activeTopPanel === "branches"}
                onToggle={() => toggleTopPanel("branches")}
                hasSession
              />
              <button
                ref={systemBtnRef}
                onClick={() => toggleTopPanel("system")}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  height: "100%", padding: "0 12px",
                  background: activeTopPanel === "system" ? "var(--bg-selected)" : "none",
                  border: "none",
                  borderTop: activeTopPanel === "system" ? "2px solid var(--accent)" : "2px solid transparent",
                  borderRight: "1px solid var(--border)",
                  cursor: "pointer",
                  color: activeTopPanel === "system" ? "var(--text)" : "var(--text-muted)",
                  fontSize: 11, whiteSpace: "nowrap", transition: "color 0.1s, background 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = activeTopPanel === "system" ? "var(--text)" : "var(--text-muted)"; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: systemPrompt ? "var(--accent)" : "var(--text-dim)", flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
                <span>System</span>
              </button>
            </div>
          )}
          {/* Session stats — right-aligned in top bar */}
          {showChat && (sessionStats || contextUsage) && (() => {
            const t = sessionStats?.tokens;
            const c = sessionStats?.cost ?? 0;
            const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
            const costStr = c > 0 ? (c >= 0.01 ? `$${c.toFixed(2)}` : `<$0.01`) : null;

            let ctxColor = "var(--text-muted)";
            let ctxStr: string | null = null;
            if (contextUsage?.contextWindow) {
              const pct = contextUsage.percent;
              if (pct !== null && pct > 90) ctxColor = "#ef4444";
              else if (pct !== null && pct > 70) ctxColor = "rgba(234,179,8,0.95)";
              ctxStr = pct !== null ? `${pct.toFixed(0)}% / ${fmt(contextUsage.contextWindow)}` : `? / ${fmt(contextUsage.contextWindow)}`;
            }

            const tooltipParts: string[] = [];
            if (t) {
              tooltipParts.push(`in: ${t.input.toLocaleString()}`);
              tooltipParts.push(`out: ${t.output.toLocaleString()}`);
              tooltipParts.push(`cache read: ${t.cacheRead.toLocaleString()}`);
              tooltipParts.push(`cache write: ${t.cacheWrite.toLocaleString()}`);
              if (c > 0) tooltipParts.push(`cost: $${c.toFixed(4)}`);
            }
            if (contextUsage?.contextWindow) {
              const pct = contextUsage.percent;
              tooltipParts.push(`context: ${pct !== null ? pct.toFixed(1) + "%" : "unknown"} of ${contextUsage.contextWindow.toLocaleString()} tokens`);
            }
            const tooltip = tooltipParts.join("  |  ");

            return (
              <div
                title={tooltip}
                style={{
                  marginLeft: "auto",
                  display: "flex", alignItems: "center", gap: 10,
                  paddingLeft: 12,
                  paddingRight: rightPanelOpen ? 12 : 48,
                  height: "100%",
                  fontSize: 11, color: "var(--text-muted)",
                  whiteSpace: "nowrap", cursor: "default",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {t && t.input > 0 && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="8.5" x2="5" y2="1.5" /><polyline points="2 4 5 1.5 8 4" />
                    </svg>
                    {fmt(t.input)}
                  </span>
                )}
                {t && t.output > 0 && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="1.5" x2="5" y2="8.5" /><polyline points="2 6 5 8.5 8 6" />
                    </svg>
                    {fmt(t.output)}
                  </span>
                )}
                {t && t.cacheRead > 0 && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8.5 5a3.5 3.5 0 1 1-1-2.45" /><polyline points="6.5 1.5 8.5 2.5 7.5 4.5" />
                    </svg>
                    {fmt(t.cacheRead)}
                  </span>
                )}
                {costStr && (
                  <span style={{ display: "flex", alignItems: "center", color: "var(--text)", fontWeight: 500 }}>
                    {costStr}
                  </span>
                )}
                {ctxStr && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: ctxColor }}>
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 9 L1 5 Q1 1 5 1 Q9 1 9 5 L9 9" /><line x1="1" y1="9" x2="9" y2="9" />
                    </svg>
                    {ctxStr}
                  </span>
                )}
              </div>
            );
          })()}
          {/* Top panel dropdown — shared, only one active at a time */}
          {activeTopPanel && topPanelPos && (
            <div style={{
              position: "fixed",
              top: topPanelPos.top,
              left: topPanelPos.left,
              width: topPanelPos.width,
              zIndex: 500,
            }}>
              {activeTopPanel === "system" && (
                <div style={{
                  background: "var(--bg-panel)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  {systemPrompt ? (
                    <div style={{
                      maxHeight: "min(600px, 75vh)",
                      overflowY: "auto",
                      padding: "12px 16px",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {systemPrompt}
                    </div>
                  ) : systemPrompt === "" ? (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      System prompt is empty (tools are disabled)
                    </div>
                  ) : (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      Send a message to load the system prompt
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Chat / file preview content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", display: filePreviewMode ? "flex" : "block" }}>
          {filePreviewMode && activeFileTab ? (
            <>
              <div style={{ width: 360, minWidth: 280, maxWidth: 440, borderRight: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
                {showChat ? (
                  <ChatWindow
                    session={selectedSession}
                    newSessionCwd={effectiveNewSessionCwd}
                    onAgentEnd={handleAgentEnd}
                    onSessionCreated={handleSessionCreated}
                    onSessionForked={handleSessionForked}
                    modelsRefreshKey={modelsRefreshKey}
                    chatInputRef={chatInputRef}
                    onBranchDataChange={handleBranchDataChange}
                    onSystemPromptChange={handleSystemPromptChange}
                    onSessionStatsChange={handleSessionStatsChange}
                    onContextUsageChange={handleContextUsageChange}
                    onSendOverride={handleFileContextSend}
                    externalMessages={multiAgentMessages}
                    inputPlaceholder={activeFileTab ? `针对当前文件提问：${activeFileTab.filePath}` : "Message…"}
                    inputAccessory={collaborationAccessory}
                  />
                ) : <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>无主会话</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ height: 34, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, padding: "0 10px", background: "var(--bg-panel)", flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>文件预览</span>
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeFileTab.filePath}</span>
                  <button onClick={() => setActiveFileTabId(null)} style={{ marginLeft: "auto", fontSize: 12, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>关闭</button>
                </div>
                <div style={{ flex: 1, overflow: "auto" }}>
                  <FileViewer filePath={activeFileTab.filePath} cwd={activeCwd ?? undefined} />
                </div>
              </div>
            </>
          ) : focusedAgentTaskId && orchestrateState.tasks.find((t) => t.id === focusedAgentTaskId) ? (
            <AgentWorkbench
              task={orchestrateState.tasks.find((t) => t.id === focusedAgentTaskId)!}
              sessionId={orchestrateState.sessionId}
              onBack={() => setFocusedAgentTaskId(null)}
              onRerun={rerunTask}
              onPromoteProfile={promoteProfile}
              onPromoteTaskSkills={promoteTaskSkills}
              onRenameProfile={handleRenameProfile}
            />
          ) : showWorkflow && selectedWorkflow ? (
            <WorkflowEditor
              workflow={selectedWorkflow}
              onBack={() => setSelectedWorkflow(null)}
              onChange={handleWorkflowChange}
              onDeleted={handleWorkflowDeleted}
              onRan={handleWorkflowRan}
            />
          ) : showChat ? (
            <ChatWindow
              session={selectedSession}
              newSessionCwd={effectiveNewSessionCwd}
              onAgentEnd={handleAgentEnd}
              onSessionCreated={handleSessionCreated}
              onSessionForked={handleSessionForked}
              modelsRefreshKey={modelsRefreshKey}
              chatInputRef={chatInputRef}
              onBranchDataChange={handleBranchDataChange}
              onSystemPromptChange={handleSystemPromptChange}
              onSessionStatsChange={handleSessionStatsChange}
              onContextUsageChange={handleContextUsageChange}
              onSendOverride={handleGuardianRoutedSend}
              externalMessages={multiAgentMessages}
              inputPlaceholder={!selectedSession?.id && !(newSessionCwd ?? activeCwd) ? "先选择工作地址，再发送第一句消息…" : "Message…"}
              inputAccessory={collaborationAccessory}
            />
          ) : showPlaceholder ? (
            activeCwd ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 15 }}>
                Select a session from the sidebar
              </div>
            ) : (
              <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "flex-start", gap: 8, userSelect: "none", pointerEvents: "none" }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
                  <line x1="20" y1="12" x2="4" y2="12" /><polyline points="10 6 4 12 10 18" />
                </svg>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Get Started</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                    <span style={{ color: "var(--text-dim)", marginRight: 6 }}>1.</span>Select a project directory from the sidebar<br />
                    <span style={{ color: "var(--text-dim)", marginRight: 6 }}>2.</span>Add models via the <strong style={{ color: "var(--text)" }}>Models</strong> button at the bottom
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>


    </div>

    {modelsConfigOpen && <ModelsConfig onClose={() => { setModelsConfigOpen(false); setModelsRefreshKey((k) => k + 1); }} />}
    {skillsConfigOpen && (activeCwd ?? selectedSession?.cwd ?? newSessionCwd) && (
      <SkillsConfig cwd={(activeCwd ?? selectedSession?.cwd ?? newSessionCwd)!} onClose={() => setSkillsConfigOpen(false)} />
    )}
    {profilesPanelOpen && <ProfilesPanel onClose={() => setProfilesPanelOpen(false)} />}
    </>
  );
}
