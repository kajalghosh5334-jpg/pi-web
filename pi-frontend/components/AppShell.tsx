"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { SessionSidebar } from "./SessionSidebar";
import type { Tab } from "./TabBar";
import type { FlowState } from "./monitor/MultiAgentVisuals";
import { useOrchestrate, type TrainRound } from "@/hooks/useOrchestrate";
import type { AgentMessage, SessionInfo, SessionTreeNode, WorkflowDefinition } from "@/lib/types";
import type { ChatInputHandle, AttachedImage } from "./ChatInput";

type MainView = "chat" | "workflow" | "train";

interface TrainRoundDetail {
  challengerOutput?: string;
  challenger_output?: string;
  base_output_before?: string;
  base_output_after?: string;
  user_feedback?: string;
  suggestion?: TrainRound["suggestion"];
  alignment?: TrainRound["alignment"];
  summary?: string;
}

type TrainRoundDetailState =
  | { status: "loading" }
  | { status: "loaded"; detail: TrainRoundDetail }
  | { status: "error"; error: string }
  | undefined;

interface WorkflowRecommendationResult {
  model: string;
  decision: "use-existing" | "customize-template" | "create-from-profiles";
  mode?: string;
  cleanContext?: boolean;
  searchSummary?: string;
  generationReason?: string;
  inferred?: {
    domain?: string;
    templateType?: string;
    confidence?: number;
  };
  recommendations?: Array<{
    workflow: WorkflowDefinition;
    score: number;
    reasons: string[];
  }>;
  templateRecommendations?: Array<{
    workflow: WorkflowDefinition;
    score: number;
    reasons: string[];
  }>;
  generatedWorkflow?: WorkflowDefinition;
  profilePlan?: Array<{
    id: string;
    name: string;
    tier: string;
    model: string;
    role: string;
  }>;
  guidance?: string[];
}

interface GuardianDecision {
  complexity?: "L0_chat" | "L1_simple" | "L2_complex" | string;
  shouldUseMultiAgent?: boolean;
  requiresClarification?: boolean;
  clarificationQuestion?: string;
  handoffToLead?: boolean;
  reason?: string;
}

const ChatWindow = dynamic(() => import("./ChatWindow").then((mod) => mod.ChatWindow), { ssr: false });
const FileViewer = dynamic(() => import("./FileViewer").then((mod) => mod.FileViewer), { ssr: false });
const ApiGuide = dynamic(() => import("./ApiGuide").then((mod) => mod.ApiGuide), { ssr: false });
const ModelsConfig = dynamic(() => import("./ModelsConfig").then((mod) => mod.ModelsConfig), { ssr: false });
const SkillsConfig = dynamic(() => import("./SkillsConfig").then((mod) => mod.SkillsConfig), { ssr: false });
const ProfilesPanel = dynamic(() => import("./ProfilesPanel").then((mod) => mod.ProfilesPanel), { ssr: false });
const BranchNavigator = dynamic(() => import("./BranchNavigator").then((mod) => mod.BranchNavigator), { ssr: false });
const AgentWorkbench = dynamic(() => import("./monitor/AgentWorkbench").then((mod) => mod.AgentWorkbench), { ssr: false });
const WorkflowEditor = dynamic(() => import("./WorkflowEditor").then((mod) => mod.WorkflowEditor), { ssr: false });
const StageFlowView = dynamic(() => import("./monitor/MultiAgentVisuals").then((mod) => mod.StageFlowView), { ssr: false });
const ArtifactFlowView = dynamic(() => import("./monitor/MultiAgentVisuals").then((mod) => mod.ArtifactFlowView), { ssr: false });
const LedgerTimelineView = dynamic(() => import("./monitor/MultiAgentVisuals").then((mod) => mod.LedgerTimelineView), { ssr: false });
const AgentDagView = dynamic(() => import("./monitor/MultiAgentVisuals").then((mod) => mod.AgentDagView), { ssr: false });
const ProjectMemoryView = dynamic(() => import("./monitor/MultiAgentVisuals").then((mod) => mod.ProjectMemoryView), { ssr: false });

function isFlowState(value: unknown): value is FlowState {
  return typeof value === "object" && value !== null;
}

function decisionLabel(decision: WorkflowRecommendationResult["decision"]) {
  if (decision === "use-existing") return "推荐使用已有 Workflow";
  if (decision === "customize-template") return "推荐从模板微调";
  return "已从 Profile 生成 Workflow";
}

function workflowDomainName(domain?: string) {
  const labels: Record<string, string> = {
    "self-media": "自媒体",
    ecommerce: "电商",
    "customer-support": "客服",
    research: "行业调研",
    sales: "电话销售",
    generic: "通用模板",
  };
  return labels[domain || ""] || domain || "未分类";
}

function WorkflowFlashGuide({ onSelectWorkflow }: { onSelectWorkflow: (workflow: WorkflowDefinition) => void }) {
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkflowRecommendationResult | null>(null);
  const topRecommendation = result?.recommendations?.[0];
  const topTemplate = result?.templateRecommendations?.[0];
  const generatedWorkflow = result?.generatedWorkflow;
  const primaryWorkflow = generatedWorkflow
    || (result?.decision === "use-existing" ? topRecommendation?.workflow : null)
    || (result?.decision === "customize-template" ? topTemplate?.workflow : null);
  const canAsk = task.trim().length > 3 && !busy;

  const askFlash = async () => {
    if (!canAsk) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workflow-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResult(data as WorkflowRecommendationResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="codex-card" style={{ borderRadius: 22, padding: "22px 24px", minHeight: 360, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 260 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--accent) 10%, var(--bg))", color: "var(--accent)", flexShrink: 0 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 7h4" />
              <path d="M14 7h4" />
              <path d="M6 17h4" />
              <path d="M14 17h4" />
              <path d="M10 7h4" />
              <path d="M10 17h4" />
              <path d="M12 7v10" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 850, color: "var(--text)" }}>选择或新建一个 Workflow</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              Flash 会先精确匹配已有 Workflow；匹配不到再推荐模板；模板也不匹配时才组合 Profile 生成新 Workflow。
            </div>
          </div>
        </div>
        <span className="codex-pill" style={{ fontSize: 11, minHeight: 26, alignSelf: "center" }}>
          {result?.model || "opencode-go/deepseek-v4-flash"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void askFlash();
          }}
          placeholder="输入你想让 workflow 完成的任务，例如：把近 7 天 AI Agent 行业新闻整理成每日监控简报，并标记融资、政策和竞品变化。"
          style={{
            width: "100%",
            minHeight: 92,
            borderRadius: 16,
            border: "1px solid var(--shell-edge)",
            background: "var(--bg)",
            color: "var(--text)",
            padding: "13px 14px",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.65,
            fontSize: 13,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["评论区分级回复", "通话纪要回写 CRM", "竞品变化监控"].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setTask(sample)}
                style={{ border: "1px solid var(--shell-edge)", background: "transparent", color: "var(--text-muted)", borderRadius: 999, padding: "6px 9px", fontSize: 11, cursor: "pointer" }}
              >
                {sample}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!canAsk}
            onClick={() => void askFlash()}
            style={{
              border: "1px solid var(--text)",
              background: canAsk ? "var(--text)" : "var(--bg-secondary)",
              color: canAsk ? "var(--bg)" : "var(--text-dim)",
              borderRadius: 12,
              padding: "9px 13px",
              fontSize: 12,
              fontWeight: 850,
              cursor: canAsk ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "推荐中..." : "让 Flash 推荐"}
          </button>
        </div>
        {error ? <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div> : null}
      </div>

      {result ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ border: "1px solid var(--shell-edge)", borderRadius: 16, padding: "14px 15px", background: "color-mix(in srgb, var(--bg-secondary) 58%, transparent)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 850, color: "var(--text)" }}>{decisionLabel(result.decision)}</div>
                <div style={{ marginTop: 5, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  行业：{workflowDomainName(result.inferred?.domain)} · 模式：{result.inferred?.templateType || topTemplate?.workflow.templateType || "待确认"} · 置信度：{Math.round((result.inferred?.confidence || 0) * 100)}%
                </div>
              </div>
              {primaryWorkflow ? (
                <button
                  type="button"
                  onClick={() => onSelectWorkflow(primaryWorkflow)}
                  style={{ border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, var(--bg))", color: "var(--accent)", borderRadius: 12, padding: "8px 11px", fontSize: 12, fontWeight: 850, cursor: "pointer" }}
                >
                  {generatedWorkflow ? "打开生成 Workflow" : result.decision === "customize-template" ? "打开模板 Workflow" : "打开推荐 Workflow"}
                </button>
              ) : null}
            </div>
            {result.searchSummary || result.generationReason ? (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                {result.searchSummary}
                {result.generationReason ? ` ${result.generationReason}` : ""}
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {generatedWorkflow ? (
                <button
                  type="button"
                  onClick={() => onSelectWorkflow(generatedWorkflow)}
                  style={{ width: "100%", textAlign: "left", border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 9%, transparent)", color: "var(--text)", borderRadius: 14, padding: "11px 12px", cursor: "pointer" }}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 850 }}>{generatedWorkflow.name}</span>
                    <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 800 }}>generated</span>
                  </span>
                  <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {generatedWorkflow.description || `已保存为 ${generatedWorkflow.tasks?.length || 0} 个节点的 Workflow`}
                  </span>
                </button>
              ) : null}
              {!generatedWorkflow && result.decision === "customize-template" && topTemplate ? (
                <button
                  type="button"
                  onClick={() => onSelectWorkflow(topTemplate.workflow)}
                  style={{ width: "100%", textAlign: "left", border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 9%, transparent)", color: "var(--text)", borderRadius: 14, padding: "11px 12px", cursor: "pointer" }}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 850 }}>{topTemplate.workflow.name}</span>
                    <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 800 }}>template</span>
                  </span>
                  <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {topTemplate.reasons.join("；") || topTemplate.workflow.description || "可作为当前任务的模板起点"}
                  </span>
                </button>
              ) : null}
              {(result.recommendations || []).slice(0, 3).map((item, index) => (
                <button
                  key={item.workflow.id}
                  type="button"
                  onClick={() => onSelectWorkflow(item.workflow)}
                  style={{ width: "100%", textAlign: "left", border: "1px solid var(--shell-edge)", background: index === 0 ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent", color: "var(--text)", borderRadius: 14, padding: "11px 12px", cursor: "pointer" }}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 820 }}>{item.workflow.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.score}</span>
                  </span>
                  <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {item.reasons.join("；") || item.workflow.description || "可作为当前任务的起点"}
                  </span>
                </button>
              ))}
              {(!result.recommendations || result.recommendations.length === 0) && topTemplate ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  推荐从「{topTemplate.workflow.name}」开始新建，左侧点击 New workflow 后选择这个模板。
                </div>
              ) : null}
            </div>
          </div>

          {(result.profilePlan || []).length ? (
            <div style={{ border: "1px solid var(--shell-edge)", borderRadius: 16, padding: "13px 15px" }}>
              <div style={{ fontSize: 12, fontWeight: 850, color: "var(--text)", marginBottom: 9 }}>Profile 链路</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(result.profilePlan || []).map((profile) => (
                  <span key={profile.id} className="codex-pill" style={{ fontSize: 11, maxWidth: "100%" }}>
                    <span style={{ fontWeight: 800 }}>{profile.name}</span>
                    <span>{profile.tier}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {(result.guidance || []).length ? (
            <div style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              {(result.guidance || []).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);
  const [mainView, setMainView] = useState<MainView>("chat");
  const [workflowRefreshKey, setWorkflowRefreshKey] = useState(0);
  // When user clicks +, we only store the cwd — no fake session id
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [draftChatOpen, setDraftChatOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [apiGuideOpen, setApiGuideOpen] = useState(false);
  const [modelsConfigOpen, setModelsConfigOpen] = useState(false);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [skillsConfigOpen, setSkillsConfigOpen] = useState(false);
  const [profilesPanelOpen, setProfilesPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [trainSaveOpen, setTrainSaveOpen] = useState(false);
  const [trainSaveName, setTrainSaveName] = useState("");
  const [trainSaveBusy, setTrainSaveBusy] = useState(false);
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
  const [multiAgentSwitchNotice, setMultiAgentSwitchNotice] = useState<string | null>(null);
  const [focusedAgentTaskId, setFocusedAgentTaskId] = useState<string | null>(null);
  const [openTrainRounds, setOpenTrainRounds] = useState<Record<number, boolean>>({});
  const [trainRoundDetails, setTrainRoundDetails] = useState<Record<number, TrainRoundDetailState>>({});
  const [trainNotice, setTrainNotice] = useState<string | null>(null);
  const [trainBusy, setTrainBusy] = useState(false);
  const [trainFeedback, setTrainFeedback] = useState("");
  const trainRoundDetailsRef = useRef<Record<number, TrainRoundDetailState>>({});
  const persistedMultiAgentOutputRef = useRef<string | null>(null);
  const activeMultiAgentSessionRef = useRef<string | null>(null);
  const { state: orchestrateState, run: runOrchestrate, switchModel, abortTask, pauseTask, resumeTask, rerunTask, promoteProfile, promoteTaskSkills, confirm: confirmOrchestrate, refreshTrain, startTrain, cancelTrain, saveTrain, clearProjectSummaries, refreshProjectMemory } = useOrchestrate();
  const activeTrainSessionId = orchestrateState.training?.sessionId || orchestrateState.sessionId || selectedSession?.id || null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("pi.modelRoutingSetupSeen") === "1") return;
    fetch("/api/models-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((config: { providers?: Record<string, { models?: Array<{ id?: string; role?: string }> }>; modelSetup?: { guideModel?: string } }) => {
        const models = Object.values(config.providers ?? {}).flatMap((provider) => provider.models ?? []);
        const hasWorker = models.some((model) => model.id?.trim() && model.role !== "strong");
        const hasStrong = models.some((model) => model.id?.trim() && model.role === "strong");
        const hasGuide = Boolean(config.modelSetup?.guideModel);
        if (!models.some((model) => model.id?.trim()) || !hasGuide || !hasWorker || !hasStrong) {
          sessionStorage.setItem("pi.modelRoutingSetupSeen", "1");
          setModelsConfigOpen(true);
        }
      })
      .catch(() => {});
  }, []);

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
      const hasRunningTasks = orchestrateState.tasks.some((task) => ["queued", "running", "waiting_for_dependency", "waiting_confirmation"].includes(task.status));
      setMultiAgentSwitchNotice(hasRunningTasks
        ? `Workflow 已${next ? "开启" : "关闭"}，将在下一条消息生效；当前任务组会继续跑完。`
        : `Workflow 已${next ? "开启" : "关闭"}，下一条消息生效。`);
      if (next) {
        setRightPanelOpen(true);
        setMainView("chat");
      }
      return next;
    });
  }, [multiAgentModeKey, guardianSuppressionKey, orchestrateState.tasks]);

  useEffect(() => {
    if (!multiAgentSwitchNotice) return;
    const timer = setTimeout(() => setMultiAgentSwitchNotice(null), 3600);
    return () => clearTimeout(timer);
  }, [multiAgentSwitchNotice]);

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
      body: JSON.stringify({ cwd, name: firstMessage.slice(0, 80) || "Workflow Session" }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { sessionId?: string; filePath?: string };
    if (!data.sessionId) return null;

    const session: SessionInfo = {
      id: data.sessionId,
      path: data.filePath || "",
      cwd,
      name: firstMessage.slice(0, 80) || "Workflow Session",
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

  const askGuardianForRouting = useCallback(async (message: string, sessionId: string): Promise<GuardianDecision | null> => {
    try {
      const res = await fetch("/api/guardian/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: message, sessionId }),
      });
      if (!res.ok) return null;
      return await res.json().catch(() => null) as GuardianDecision | null;
    } catch {
      return null;
    }
  }, []);

  const getMultiAgentAssistantText = useCallback(() => {
    return orchestrateState.mainOutput || "";
  }, [orchestrateState.mainOutput]);

  const handleMultiAgentSend = useCallback(async (message: string) => {
    if (!message.trim()) return;
    const now = Date.now();
    const userMsg: AgentMessage = { role: "user", content: message, timestamp: now };
    persistedMultiAgentOutputRef.current = null;
    setRightPanelOpen(true);

    const sessionId = await ensureMultiAgentSession(message);
    activeMultiAgentSessionRef.current = sessionId;
    await appendMessageToSession(userMsg, sessionId || undefined);

    // Reload the real session so the user message is shown from persisted history.
    setSessionKey((k) => k + 1);
    setRefreshKey((k) => k + 1);

    // Codex-style transcript: process state lives in the collaboration strip/panel;
    // only the final assistant report is persisted into the chat.
    setMultiAgentMessages([]);

    const orchestrateInput = await buildContextualMultiAgentInput(message, sessionId);
    await runOrchestrate(orchestrateInput, { cwd: selectedSession?.cwd ?? newSessionCwd ?? activeCwd, sessionId });
  }, [runOrchestrate, appendMessageToSession, ensureMultiAgentSession, buildContextualMultiAgentInput, selectedSession?.cwd, newSessionCwd, activeCwd]);

  const runMultiAgentInBackground = useCallback(async (message: string) => {
    // 如果普通主模型还在创建新会话，先不抢建另一个 Workflow session，避免一条消息分裂成两个会话。
    if (!selectedSession?.id) return;
    const sessionId = selectedSession.id;
    activeMultiAgentSessionRef.current = sessionId;

    // 不向主对话插入 Workflow 提示文字；状态只显示在右侧监控面板。
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

    // Workflow 开关关闭时，普通聊天路径不再调用 Guardian 或后台编排。
    if (!multiAgentMode) {
      void defaultSend(message, images);
      return;
    }

    // 用户明确不满意时：在 Workflow 开启状态下直接触发 agent-coach 调教闭环。
    if (selectedSession?.id && isCoachingIntent(message)) {
      setMultiAgentMode(true);
      localStorage.setItem(`pi.multiAgentMode.session:${selectedSession.id}`, "1");
      setRightPanelOpen(true);
      void runMultiAgentInBackground(message);
      return;
    }

    // Workflow 开关打开时只启用 Guardian 路由；普通问答仍走当前主模型聊天。
    // 只有 Guardian 明确判定需要多 Agent/Lead 时，才进入编排层。
    const sessionId = selectedSession?.id;
    if (!sessionId) {
      void defaultSend(message, images);
      return;
    }
    const decision = await askGuardianForRouting(message, sessionId);
    const shouldUseWorkflow = Boolean(
      decision?.shouldUseMultiAgent ||
      decision?.handoffToLead ||
      decision?.complexity === "L2_complex"
    );
    if (shouldUseWorkflow) {
      await handleMultiAgentSend(message);
      return;
    }

    void defaultSend(message, images);
  }, [multiAgentMode, runMultiAgentInBackground, selectedSession?.id, newSessionCwd, activeCwd, isCoachingIntent, askGuardianForRouting, handleMultiAgentSend]);

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
          setMultiAgentMessages([]);
          activeMultiAgentSessionRef.current = null;
        }
      })();
    }
  }, [getMultiAgentAssistantText, orchestrateState.phase, orchestrateState.mainOutput, appendMessageToSession]);

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
    setMainView("chat");
    setSelectedSession(session);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
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
    setMainView("chat");
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
    setMainView("chat");
    setSelectedSession(session);
    setRefreshKey((k) => k + 1);
    router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
  }, [router]);

  const handleAgentEnd = useCallback(() => {
    setRefreshKey((k) => k + 1);
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
    setMainView("workflow");
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
    setMainView("chat");
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

  const trainStatusText = useCallback((phase: string | undefined) => {
    switch (phase) {
      case "DISPATCH_CHALLENGER":
        return "派生中";
      case "CHALLENGER_RUNNING":
        return "等待结果";
      case "EVALUATING":
      case "SUGGESTION_READY":
        return "对比分析中";
      case "APPLYING_PATCH":
        return "打补丁中";
      case "BASE_MODEL_RERUNNING":
        return "重跑中";
      default:
        return "取消";
    }
  }, []);

  useEffect(() => {
    setTrainNotice(null);
    setOpenTrainRounds({});
    trainRoundDetailsRef.current = {};
    setTrainRoundDetails({});
    if (!selectedSession?.id) return;
    const sessionId = selectedSession.id;
    let cancelled = false;
    const timer = setTimeout(() => {
      void refreshTrain({ sessionId })
      .then((result) => {
        if (cancelled) return;
        const restored = result as { restoredForTrain?: boolean; error?: string };
        if (restored?.restoredForTrain) {
          setTrainNotice("已从历史 Session 恢复最近一组用户问题和最终回答，可用于 Train；这不是完整 Workflow 运行态恢复。");
        }
      })
      .catch(() => {});
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refreshTrain, selectedSession?.id]);

  const trainErrorText = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || "Train request failed");
    if (message.includes("session not found")) {
      return "Train 需要当前会话仍在后端活动状态；请先在该 Session 里发起一次 Workflow 运行，再开始训练。";
    }
    if (message.includes("no task available for training")) {
      return "当前 Session 还没有可训练的 Agent 任务；请先完成一次 Workflow 任务。";
    }
    if (message.includes("timed out")) {
      return "Train 后端请求超时；当前训练服务没有在 15 秒内返回，请稍后重试或重启 monitor server。";
    }
    if (message.includes("fetch failed") || message.includes("Backend not available")) {
      return "Train 后端暂时不可用；请确认 monitor server 正在运行后重试。";
    }
    return message;
  }, []);

  const handleOpenTrainView = useCallback(() => {
    setMainView("train");
    setSelectedWorkflow(null);
    setRightPanelOpen(false);
    setActiveTopPanel(null);
    setTrainNotice(null);
  }, []);

  const handleTrainClick = useCallback(async (userFeedback?: string) => {
    if (trainBusy) return;
    const training = orchestrateState.training;
    const sessionId = activeTrainSessionId;
    setTrainNotice(null);
    if (!sessionId) {
      setTrainNotice("请先打开或创建一个 Session，再开始 Train。");
      return;
    }
    setTrainBusy(true);
    try {
      if (training?.status === "running") {
        if (!training.hasChallengerOutput && training.phase === "CHALLENGER_RUNNING") {
          const ok = window.confirm("挑战者高端调用仍在运行，取消会丢弃本轮且下次需要重新派生。确认取消？");
          if (!ok) return;
        }
        const result = await cancelTrain({ sessionId }) as { ok?: boolean; error?: string };
        if (result?.error || result?.ok === false) setTrainNotice(trainErrorText(result.error));
        return;
      }
      const result = await startTrain({ taskId: focusedAgentTaskId || undefined, sessionId, userFeedback }) as { ok?: boolean; error?: string };
      if (result?.error || result?.ok === false) setTrainNotice(trainErrorText(result.error));
    } finally {
      setTrainBusy(false);
    }
  }, [activeTrainSessionId, cancelTrain, focusedAgentTaskId, orchestrateState.training, startTrain, trainBusy, trainErrorText]);

  const handleSubmitTrainFeedback = useCallback(async () => {
    const feedback = trainFeedback.trim();
    const currentRound = orchestrateState.training?.currentRound ?? 0;
    if (!feedback && currentRound > 0) {
      setTrainNotice("请先填写你对当前模型差距或修改方向的评价。");
      return;
    }
    await handleTrainClick(feedback || undefined);
    setTrainFeedback("");
  }, [handleTrainClick, orchestrateState.training?.currentRound, trainFeedback]);

  const openTrainSave = useCallback(() => {
    setTrainSaveName(`${selectedSession?.name || selectedSession?.id || "Trained"} Profile`);
    setTrainSaveOpen(true);
  }, [selectedSession]);

  const handleSaveTrain = useCallback(async () => {
    const name = trainSaveName.trim();
    if (!name) return;
    setTrainSaveBusy(true);
    try {
      setTrainNotice(null);
      const result = await saveTrain({ name, sessionId: activeTrainSessionId || undefined }) as { ok?: boolean; error?: string };
      if (result?.error || result?.ok === false) {
        setTrainNotice(trainErrorText(result.error));
      } else {
        setTrainSaveOpen(false);
      }
    } finally {
      setTrainSaveBusy(false);
    }
  }, [activeTrainSessionId, saveTrain, trainErrorText, trainSaveName]);

  const loadTrainRoundDetail = useCallback((round: number) => {
    if (!activeTrainSessionId) return;
    const current = trainRoundDetailsRef.current[round];
    if (current?.status === "loaded" || current?.status === "loading") return;
    trainRoundDetailsRef.current = { ...trainRoundDetailsRef.current, [round]: { status: "loading" } };
    setTrainRoundDetails(trainRoundDetailsRef.current);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 17_000);
    void fetch(`/api/train/${encodeURIComponent(activeTrainSessionId)}/round/${round}`, { signal: controller.signal })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data?.error || "round detail load failed");
        trainRoundDetailsRef.current = { ...trainRoundDetailsRef.current, [round]: { status: "loaded", detail: data.detail as TrainRoundDetail } };
        setTrainRoundDetails(trainRoundDetailsRef.current);
      })
      .catch((error) => {
        const message = error instanceof Error && error.name === "AbortError"
          ? "Train request timed out"
          : error instanceof Error ? error.message : String(error);
        trainRoundDetailsRef.current = { ...trainRoundDetailsRef.current, [round]: { status: "error", error: message } };
        setTrainRoundDetails(trainRoundDetailsRef.current);
      })
      .finally(() => {
        clearTimeout(timeout);
      });
  }, [activeTrainSessionId]);

  useEffect(() => {
    const rounds = orchestrateState.training?.rounds?.filter((round) => round.status !== "discarded") || [];
    const latest = rounds[rounds.length - 1];
    if (!latest || latest.status !== "done") return;
    if (openTrainRounds[latest.round] === false) return;
    loadTrainRoundDetail(latest.round);
  }, [loadTrainRoundDetail, openTrainRounds, orchestrateState.training?.rounds]);

  const handleRenameProfile = useCallback(async (profileId: string, name: string) => {
    const res = await fetch(`/api/agent-profiles/${encodeURIComponent(profileId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return res.json().catch(() => ({ ok: res.ok, error: "rename failed" }));
  }, []);


  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && !selectedWorkflow && draftChatOpen ? activeCwd : null);
  const showWorkflow = selectedWorkflow !== null;
  const showTrain = mainView === "train" && selectedSession !== null;
  const showChat = !showWorkflow && !showTrain && (selectedSession !== null || draftChatOpen || effectiveNewSessionCwd !== null);

  useEffect(() => {
    // Clear only when navigating to a different saved session. If we just created
    // a session for the current Workflow turn, keep the optimistic messages visible
    // until the persisted session reload catches up.
    if (selectedSession?.id && selectedSession.id !== activeMultiAgentSessionRef.current) {
      setMultiAgentMessages([]);
    }
  }, [selectedSession?.id, effectiveNewSessionCwd]);
  // While restoring initial session from URL, don't show the placeholder
  const showPlaceholder = initialSessionRestored && !showChat && !showWorkflow && !showTrain;

  const activeFileTab = fileTabs.find((t) => t.id === activeFileTabId) ?? null;
  const workspaceMode: "workflow" | "train" | "chat" | "file" | "agent" | "empty" = showTrain
    ? "train"
    : showWorkflow
    ? "workflow"
    : activeFileTab?.filePath
    ? "file"
    : focusedAgentTaskId && orchestrateState.tasks.some((t) => t.id === focusedAgentTaskId)
      ? "agent"
      : showChat
        ? "chat"
        : "empty";
  const filePreviewMode = workspaceMode === "file";
  const flowState = isFlowState(orchestrateState.flowState) ? orchestrateState.flowState : null;
  const collaborationSummary = {
    running: orchestrateState.tasks.filter((t) => t.status === "running").length,
    needsConfirmation: orchestrateState.tasks.filter((t) => t.status === "waiting_confirmation").length,
    waiting: orchestrateState.tasks.filter((t) => (t.collaborationStatus || "").startsWith("waiting") || t.status === "waiting_for_dependency").length,
    debugging: orchestrateState.tasks.filter((t) => t.collaborationStatus === "debugging").length,
    review: orchestrateState.tasks.filter((t) => t.collaborationStatus === "ready_for_review").length,
    blocked: orchestrateState.tasks.filter((t) => t.collaborationStatus === "blocked" || t.status === "error").length,
    stage: flowState?.currentStage || "Not started",
    artifactsReady: orchestrateState.artifacts.filter((a) => a.status === "ready").length,
    artifactsTotal: orchestrateState.artifacts.length,
  };
  const workflowSignalCount = collaborationSummary.running + collaborationSummary.waiting + collaborationSummary.needsConfirmation + collaborationSummary.blocked;
  const hasWorkflowRuntimeSignals = Boolean(selectedSession?.id || orchestrateState.tasks.length || workflowSignalCount > 0 || collaborationSummary.artifactsTotal > 0);
  const collaborationPanelBody = selectedSession?.id ? (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", marginTop: 10 }}>
      <StageFlowView flowState={flowState} />
      <ArtifactFlowView artifacts={orchestrateState.artifacts} />
      <LedgerTimelineView events={orchestrateState.ledgerEvents} />
      <div style={{ gridColumn: "1 / -1" }}>
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
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <ProjectMemoryView memory={orchestrateState.projectMemory} onRefresh={() => orchestrateState.sessionId && void refreshProjectMemory(orchestrateState.sessionId)} onClearSummaries={() => void clearProjectSummaries()} />
      </div>
    </div>
  ) : null;
  const activeWorkflowTask = focusedAgentTaskId
    ? orchestrateState.tasks.find((task) => task.id === focusedAgentTaskId) ?? null
    : orchestrateState.tasks[0]
      ? orchestrateState.tasks[0]
      : null;
  const workflowStages = activeWorkflowTask?.taskStages?.length
    ? activeWorkflowTask.taskStages
    : [
        { name: "Dispatch", status: "completed", goal: "派发任务" },
        { name: activeWorkflowTask?.currentTaskStage || "执行", status: activeWorkflowTask?.status === "completed" ? "completed" : "active", goal: activeWorkflowTask?.nextAction || activeWorkflowTask?.prompt || "任务执行中" },
        { name: "结果聚合", status: activeWorkflowTask?.status === "completed" ? "completed" : "pending", goal: activeWorkflowTask?.leadDecision || "等待主线程汇总" },
      ];
  const workflowBody = (
    <div className="codex-scroll-column" style={{ height: "100%", overflowY: selectedWorkflow ? "hidden" : "auto", padding: selectedWorkflow ? "8px 12px 12px" : "10px 16px 16px" }}>
      <div style={{ display: "grid", gap: 12, height: selectedWorkflow ? "100%" : undefined, minHeight: 0 }}>
        {!selectedWorkflow && hasWorkflowRuntimeSignals ? <div className="codex-card" style={{ borderRadius: 20, padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
                {activeWorkflowTask?.name || "Workflow"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {activeWorkflowTask?.profileName || "Build your workflow by dragging profiles into the canvas."}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: "运行中", value: collaborationSummary.running, color: "#0a84ff" },
                { label: "等待中", value: collaborationSummary.waiting, color: "#8b5cf6" },
                { label: "需确认", value: collaborationSummary.needsConfirmation, color: "#f97316" },
                { label: "阻塞", value: collaborationSummary.blocked, color: "#ef4444" },
              ].filter((item) => item.value > 0).map((item) => (
                <span key={item.label} className="codex-pill" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: item.color }} />
                  <span style={{ color: item.color, fontWeight: 700 }}>{item.label}</span>
                  <span>{item.value}</span>
                </span>
              ))}
            </div>
          </div>
        </div> : null}

        {mainView === "workflow" && selectedWorkflow ? (
          <WorkflowEditor
            workflow={selectedWorkflow}
            onBack={() => {
              setSelectedWorkflow(null);
              setMainView("workflow");
            }}
            onChange={handleWorkflowChange}
            onDeleted={handleWorkflowDeleted}
            onRan={handleWorkflowRan}
          />
        ) : (
          <WorkflowFlashGuide onSelectWorkflow={(workflow) => {
            setSelectedWorkflow(workflow);
            setMainView("workflow");
          }} />
        )}

        {!selectedWorkflow && hasWorkflowRuntimeSignals ? <details open className="codex-card" style={{ borderRadius: 22, padding: "16px 18px" }}>
          <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)" }}>
              Workflow Runtime
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {workflowSignalCount} active signals
            </span>
          </summary>
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {workflowStages.map((stage, index) => {
                const status = stage.status || "pending";
                const tone = status === "completed" ? "#22c55e" : status === "active" || status === "current" ? "#0a84ff" : "#94a3b8";
                return (
                  <div key={`${stage.name || stage.stage}-${index}`} style={{ display: "flex", alignItems: "center", minWidth: 180, flex: index === workflowStages.length - 1 ? "0 0 180px" : "0 0 220px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: `${tone}16`, color: tone, fontSize: 12, fontWeight: 800, marginBottom: 10 }}>
                        {status === "completed" ? "✓" : status === "active" || status === "current" ? "●" : index + 1}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{stage.name || stage.stage || `Stage ${index + 1}`}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>{stage.goal || "等待进入该阶段"}</div>
                    </div>
                    {index < workflowStages.length - 1 ? (
                      <div style={{ width: 56, height: 1, background: status === "completed" ? "rgba(34,197,94,0.45)" : "color-mix(in srgb, var(--shell-edge) 80%, transparent)", margin: "0 10px" }} />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>故障隔离</div>
                重试上限：{activeWorkflowTask?.budget?.maxRetries ?? 0} · 超时：{activeWorkflowTask?.budget?.timeoutMs ? `${Math.round(activeWorkflowTask.budget.timeoutMs / 1000)}s` : "未设置"}
                <br />
                {activeWorkflowTask?.error || activeWorkflowTask?.leadDecisionReason || activeWorkflowTask?.definitionOfDone || "当前没有新的故障升级信息。"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>下一动作</div>
                {activeWorkflowTask?.nextAction || activeWorkflowTask?.handoff?.nextStep || "继续等待任务推进或切换回总览查看其他 agent。"}
              </div>
            </div>
          </div>
        </details> : null}

        {!selectedWorkflow && hasWorkflowRuntimeSignals ? collaborationPanelBody : null}
      </div>
    </div>
  );
  const collaborationAccessory = showChat && workspaceMode !== "agent" ? (() => {
    const activeTaskCount = orchestrateState.tasks.filter((task) => !["completed", "aborted"].includes(task.status)).length;
    const latestProgress = orchestrateState.progressUpdates.at(-1);
    const chips: { label: string; value: number | string; color: string }[] = [];
    if (collaborationSummary.running > 0) chips.push({ label: "运行", value: collaborationSummary.running, color: "#0a84ff" });
    if (collaborationSummary.needsConfirmation > 0) chips.push({ label: "需确认", value: collaborationSummary.needsConfirmation, color: "#f97316" });
    if (collaborationSummary.waiting > 0) chips.push({ label: "等待", value: collaborationSummary.waiting, color: "#8b5cf6" });
    if (collaborationSummary.debugging > 0) chips.push({ label: "调教", value: collaborationSummary.debugging, color: "#f59e0b" });
    if (collaborationSummary.review > 0) chips.push({ label: "审查", value: collaborationSummary.review, color: "#22c55e" });
    if (collaborationSummary.blocked > 0) chips.push({ label: "阻塞", value: collaborationSummary.blocked, color: "#ef4444" });
    if (collaborationSummary.artifactsTotal > 0) chips.push({ label: "产物", value: `${collaborationSummary.artifactsReady}/${collaborationSummary.artifactsTotal}`, color: "var(--text-muted)" });
    return (
    <div style={{ width: "100%", display: "grid", gap: 8 }}>
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
        ) : (
          <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, letterSpacing: "0.01em" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: multiAgentMode ? "#0a84ff" : "var(--border)", boxShadow: multiAgentMode ? "0 0 0 4px rgba(10,132,255,0.12)" : "none" }} />
              Workflow
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {multiAgentMode ? (latestProgress?.text || `阶段：${collaborationSummary.stage}`) : "关闭，下一条复杂消息走普通聊天"}
            </span>
            {activeTaskCount > 0 && <span style={{ fontSize: 10, color: "#0a84ff", padding: "2px 7px", borderRadius: 999, background: "rgba(10,132,255,0.10)" }}>任务组运行中</span>}
            {guardianAutoMultiAgentSuppressed && <span style={{ fontSize: 10, color: "#f59e0b", padding: "2px 6px", borderRadius: 999, background: "rgba(245,158,11,0.10)" }}>用户接管</span>}
            {multiAgentMode ? (
              <>
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
              </>
            ) : null}
          </div>
        )}
        {selectedSession?.id ? (
          <button
            onClick={(e) => { e.stopPropagation(); toggleMultiAgentMode(); }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              height: 28,
              padding: "0 9px 0 4px",
              borderRadius: 999,
              border: multiAgentMode ? "1px solid rgba(10,132,255,0.45)" : "1px solid var(--border)",
              cursor: "pointer",
              background: multiAgentMode ? "#0a84ff" : "var(--bg-secondary)",
              color: multiAgentMode ? "white" : "var(--text-muted)",
              flexShrink: 0,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.02em",
              boxShadow: multiAgentMode ? "0 8px 18px rgba(10,132,255,0.18)" : "none",
              transition: "background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease",
            }}
            title={multiAgentMode ? "关闭 Workflow" : "开启 Workflow"}
          >
            <span style={{ position: "relative", width: 22, height: 20, borderRadius: 999, background: multiAgentMode ? "rgba(255,255,255,0.22)" : "var(--border)", display: "inline-block" }}>
              <span style={{ position: "absolute", top: 3, left: multiAgentMode ? 10 : 3, width: 14, height: 14, borderRadius: 999, background: multiAgentMode ? "white" : "var(--bg)", transition: "left 0.16s ease" }} />
            </span>
            {multiAgentMode ? "ON" : "OFF"}
          </button>
        ) : null}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: selectedSession?.id && rightPanelOpen ? "rotate(90deg)" : "none", transition: "transform 0.18s ease", color: "var(--text-muted)", flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
      {multiAgentSwitchNotice ? (
        <div style={{ fontSize: 11, lineHeight: 1.5, color: "#0a84ff", background: "rgba(10,132,255,0.08)", border: "1px solid rgba(10,132,255,0.18)", borderRadius: 10, padding: "7px 9px" }}>
          {multiAgentSwitchNotice}
        </div>
      ) : null}
      {selectedSession?.id && multiAgentMode && rightPanelOpen ? collaborationPanelBody : null}
    </div>
    );
  })() : null;

  const trainRoundsPanel = showChat && orchestrateState.training?.rounds?.some((round) => round.status !== "discarded") ? (
    <div style={{ display: "grid", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "color-mix(in srgb, var(--bg-panel) 78%, transparent)" }}>
      {orchestrateState.training.rounds.filter((round) => round.status !== "discarded").map((round, index, rounds) => {
        const latest = index === rounds.length - 1;
        const open = openTrainRounds[round.round] ?? latest;
        return (
          <TrainRoundCard
            key={`${round.round}-${round.timestamp || index}`}
            sessionId={activeTrainSessionId}
            round={round}
            open={open}
            detailState={trainRoundDetails[round.round]}
            onToggle={(nextOpen) => {
              setOpenTrainRounds((prev) => ({ ...prev, [round.round]: nextOpen }));
              if (nextOpen) loadTrainRoundDetail(round.round);
            }}
          />
        );
      })}
    </div>
  ) : null;
  const trainNoticePanel = showChat && trainNotice ? (
    <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(245,158,11,0.28)", background: "rgba(245,158,11,0.08)", color: "#b45309", fontSize: 12, lineHeight: 1.5 }}>
      {trainNotice}
    </div>
  ) : null;
  const trainCurrentRound = orchestrateState.training?.currentRound ?? 0;
  const trainMaxRounds = orchestrateState.training?.maxRounds ?? 5;
  const trainRunning = orchestrateState.training?.status === "running";
  const trainAtLimit = trainCurrentRound >= trainMaxRounds && !trainRunning;
  const trainDisabled = trainAtLimit || trainBusy;
  const trainCanSave = Boolean(orchestrateState.training) && trainCurrentRound >= 1 && !trainRunning;
  const trainRounds = orchestrateState.training?.rounds?.filter((round) => round.status !== "discarded") || [];
  const latestTrainRound = trainRounds[trainRounds.length - 1] || null;
  const latestTrainDetail = latestTrainRound && trainRoundDetails[latestTrainRound.round]?.status === "loaded"
    ? (trainRoundDetails[latestTrainRound.round] as { status: "loaded"; detail: TrainRoundDetail }).detail
    : null;
  const latestChallengerText = latestTrainDetail?.challengerOutput || latestTrainDetail?.challenger_output || latestTrainRound?.challengerPreview || orchestrateState.training?.challengerPreview || "";
  const latestCurrentBefore = latestTrainDetail?.base_output_before || latestTrainRound?.baseBeforePreview || "";
  const latestCurrentAfter = latestTrainDetail?.base_output_after || latestTrainRound?.baseAfterPreview || "";
  const trainBody = showTrain ? (
    <div className="codex-scroll-column" style={{ height: "100%", overflowY: "auto", padding: "18px 22px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 860, color: "var(--text)", letterSpacing: "-0.03em" }}>Train</div>
            <div style={{ marginTop: 5, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              当前模型和最强模型并排产出；你评价差距后，当前模型按本轮经验重答，满意后保存为 Profile 与 Skill 经验。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="codex-pill" style={{ fontSize: 11 }}>第 {trainCurrentRound}/{trainMaxRounds} 轮</span>
            {orchestrateState.training?.savedProfileId ? (
              <span className="codex-pill" style={{ fontSize: 11, color: "#22c55e" }}>Saved: {orchestrateState.training.savedProfileId}</span>
            ) : null}
            <button
              type="button"
              onClick={() => setMainView("chat")}
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-muted)", borderRadius: 10, height: 32, padding: "0 10px", cursor: "pointer", fontSize: 12, fontWeight: 750 }}
            >
              Back
            </button>
          </div>
        </div>

        {trainNotice ? (
          <div style={{ border: "1px solid rgba(245,158,11,0.28)", background: "rgba(245,158,11,0.08)", color: "#b45309", borderRadius: 14, padding: "10px 12px", fontSize: 12, lineHeight: 1.6 }}>
            {trainNotice}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
          <TrainComparePanel
            title="当前模型成果"
            subtitle={latestCurrentAfter ? "按训练补丁重答" : "原始输出 / 等待重答"}
            text={latestCurrentAfter || latestCurrentBefore || "点击开始后，当前模型会按本轮训练规则重新给出完整作答。"}
            tone="base"
          />
          <TrainComparePanel
            title="最强模型成果"
            subtitle={orchestrateState.training?.hasChallengerOutput ? "高端 challenger 参照" : "等待 challenger"}
            text={latestChallengerText || "点击开始后，最强模型会先给出参照答案，用于对齐当前模型。"}
            tone="challenger"
          />
        </div>

        <div className="codex-card" style={{ borderRadius: 18, padding: "14px 16px", display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 850, color: "var(--text)" }}>评价差距或输入修改意见</div>
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
                {trainCurrentRound === 0 ? "第一轮可直接开始；之后请写出差距，系统会把意见加入下一轮重答。" : "写下当前模型还差什么，下一轮会带着你的意见重新训练。"}
              </div>
            </div>
            {latestTrainRound?.alignment ? (
              <span className="codex-pill" style={{ fontSize: 11, color: latestTrainRound.alignment.score >= 80 ? "#22c55e" : "#f59e0b" }}>
                对齐 {latestTrainRound.alignment.score}/100
              </span>
            ) : null}
          </div>
          <textarea
            value={trainFeedback}
            onChange={(event) => setTrainFeedback(event.target.value)}
            placeholder={trainCurrentRound === 0 ? "可选：补充你希望本轮训练特别关注的质量标准。" : "例如：当前模型缺少边界条件分析，语气不够像最终交付，步骤三需要更具体。"}
            disabled={trainRunning || trainBusy || trainAtLimit}
            style={{
              width: "100%",
              minHeight: 92,
              borderRadius: 14,
              border: "1px solid var(--shell-edge)",
              background: "var(--bg)",
              color: "var(--text)",
              padding: "12px 13px",
              resize: "vertical",
              outline: "none",
              lineHeight: 1.6,
              fontSize: 13,
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {trainRunning ? `训练中：${trainStatusText(orchestrateState.training?.phase)}` : trainAtLimit ? "已达到最大轮次，可保存或返回。" : "满意后点击 Save 固化为可复用 Profile。"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void handleSubmitTrainFeedback()}
                disabled={trainDisabled}
                style={{ border: "1px solid var(--text)", background: trainDisabled ? "var(--bg-secondary)" : "var(--text)", color: trainDisabled ? "var(--text-dim)" : "var(--bg)", borderRadius: 12, padding: "9px 13px", fontSize: 12, fontWeight: 850, cursor: trainDisabled ? "not-allowed" : "pointer" }}
              >
                {trainRunning ? trainStatusText(orchestrateState.training?.phase) : trainCurrentRound === 0 ? "Start" : "重新作答"}
              </button>
              <button
                type="button"
                onClick={openTrainSave}
                disabled={!trainCanSave}
                style={{ border: "1px solid var(--shell-edge)", background: "var(--bg)", color: trainCanSave ? "var(--text)" : "var(--text-dim)", borderRadius: 12, padding: "9px 13px", fontSize: 12, fontWeight: 850, cursor: trainCanSave ? "pointer" : "not-allowed" }}
              >
                Save
              </button>
            </div>
          </div>
          {trainSaveOpen ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--shell-edge)", paddingTop: 12 }}>
              <input
                value={trainSaveName}
                onChange={(event) => setTrainSaveName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleSaveTrain();
                  if (event.key === "Escape") setTrainSaveOpen(false);
                }}
                placeholder="Profile name"
                style={{ height: 34, minWidth: 260, flex: "1 1 260px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", padding: "0 10px", fontSize: 12 }}
              />
              <button type="button" onClick={() => void handleSaveTrain()} disabled={trainSaveBusy || !trainSaveName.trim()} style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", borderRadius: 10, height: 34, padding: "0 11px", cursor: trainSaveBusy ? "default" : "pointer", fontSize: 12 }}>
                {trainSaveBusy ? "Saving..." : "Save Profile"}
              </button>
              <button type="button" onClick={() => setTrainSaveOpen(false)} disabled={trainSaveBusy} style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", borderRadius: 10, height: 34, padding: "0 11px", cursor: "pointer", fontSize: 12 }}>
                Cancel
              </button>
            </div>
          ) : null}
        </div>

        {trainRounds.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {trainRounds.map((round, index) => {
              const latest = index === trainRounds.length - 1;
              const open = openTrainRounds[round.round] ?? latest;
              return (
                <TrainRoundCard
                  key={`${round.round}-${round.timestamp || index}`}
                  sessionId={activeTrainSessionId}
                  round={round}
                  open={open}
                  detailState={trainRoundDetails[round.round]}
                  onToggle={(nextOpen) => {
                    setOpenTrainRounds((prev) => ({ ...prev, [round.round]: nextOpen }));
                    if (nextOpen) loadTrainRoundDetail(round.round);
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  const sidebarContent = (
    <>
      <SessionSidebar
        mode={mainView === "workflow" ? "workflow" : "chat"}
        onModeChange={(mode) => {
          setMainView(mode);
          if (mode === "chat") setSelectedWorkflow(null);
        }}
        selectedSessionId={selectedSession?.id ?? null}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        initialSessionId={initialSessionId}
        onInitialRestoreDone={handleInitialRestoreDone}
        refreshKey={refreshKey}
        onSessionDeleted={handleSessionDeleted}
        selectedCwd={selectedSession?.cwd ?? newSessionCwd ?? activeCwd ?? null}
        onCwdChange={handleCwdChange}
        selectedWorkflowId={selectedWorkflow?.id ?? null}
        onSelectWorkflow={handleSelectWorkflow}
        workflowRefreshKey={workflowRefreshKey}
      />
      <div style={{ padding: "8px", flexShrink: 0, display: "flex", justifyContent: "space-between", gap: 4 }}>
        {([
          {
            label: "API",
            onClick: () => setApiGuideOpen(true),
            disabled: false,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18" />
                <path d="M5 8h14" />
                <path d="M5 16h14" />
                <circle cx="7" cy="8" r="2" />
                <circle cx="17" cy="16" r="2" />
              </svg>
            ),
          },
          ...(mainView === "workflow" ? [{
            label: "Profiles",
            onClick: () => setProfilesPanelOpen(true),
            disabled: false,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="3" />
                <circle cx="16" cy="16" r="3" />
                <path d="M11 8h3a2 2 0 0 1 2 2v3" />
                <path d="M6 20v-1a4 4 0 0 1 4-4" />
              </svg>
            ),
          }] : []),
          ...(mainView === "workflow" ? [] : [{
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
          }]),
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
    <div style={{ height: "100dvh", overflow: "hidden", background: "transparent", padding: "14px" }}>
    <div className="codex-shell" style={{ display: "flex", height: "calc(100dvh - 28px)", overflow: "hidden", background: "transparent", borderRadius: 28, position: "relative" }}>
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
          background: "linear-gradient(180deg, color-mix(in srgb, var(--bg) 84%, transparent) 0%, color-mix(in srgb, var(--bg-panel) 92%, transparent) 100%)",
          borderRight: "1px solid color-mix(in srgb, var(--shell-edge) 80%, transparent)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          zIndex: 200,
          position: "relative",
          overflow: "hidden",
          boxShadow: "var(--surface-shadow)",
        }}
      >
        {sidebarContent}
        {false && rightPanelOpen && showChat && (
          <div />
        )}
      </div>

      {/* Center: chat */}
      <div className="app-shell-main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar with sidebar toggle */}
        <div ref={topBarRef} className="codex-top-hover-zone" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, borderBottom: "1px solid color-mix(in srgb, var(--shell-edge) 36%, transparent)", minHeight: 42, padding: "6px 12px", background: "linear-gradient(180deg, color-mix(in srgb, var(--bg) 76%, transparent) 0%, color-mix(in srgb, var(--bg) 26%, transparent) 72%, transparent 100%)" }}>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, padding: 0,
              background: "color-mix(in srgb, var(--bg) 50%, transparent)", border: "1px solid color-mix(in srgb, var(--shell-edge) 64%, transparent)",
              borderRadius: 10,
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
          <div style={{ minWidth: 0, flex: 1 }} />
          {mainView === "chat" && showChat && selectedSession?.id && (
            <div className="codex-top-reveal codex-top-actions codex-segmented" style={{ marginLeft: "auto" }}>
              <button
                onClick={handleOpenTrainView}
                disabled={trainBusy}
                title="Open Train"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 34,
                  padding: "0 12px",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: trainBusy ? "not-allowed" : "pointer",
                  opacity: trainBusy ? 0.45 : 1,
                  flexShrink: 0,
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  transition: "color 0.1s, background 0.1s, opacity 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "color-mix(in srgb, var(--bg-hover) 80%, var(--bg))"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
              >
                <span>{trainBusy ? "处理中" : trainRunning ? trainStatusText(orchestrateState.training?.phase) : "Train"}</span>
                <span style={{ color: "var(--text-dim)" }}>第 {Math.min(trainCurrentRound + (trainRunning ? 1 : 0), trainMaxRounds)}/{trainMaxRounds} 轮</span>
              </button>
              <button
                onClick={openTrainSave}
                disabled={!trainCanSave}
                title="Save trained shadow patches as a Profile"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 34,
                  padding: "0 12px",
                  border: "none",
                  color: trainCanSave ? "var(--text-muted)" : "var(--text-dim)",
                  cursor: trainCanSave ? "pointer" : "not-allowed",
                  opacity: trainCanSave ? 1 : 0.45,
                  flexShrink: 0,
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  transition: "color 0.1s, background 0.1s, opacity 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!trainCanSave) return;
                  e.currentTarget.style.color = "var(--text)";
                  e.currentTarget.style.background = "color-mix(in srgb, var(--bg-hover) 80%, var(--bg))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = trainCanSave ? "var(--text-muted)" : "var(--text-dim)";
                  e.currentTarget.style.background = "none";
                }}
              >
                <span>Save</span>
              </button>
              {trainSaveOpen ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 6px" }}>
                  <input
                    value={trainSaveName}
                    onChange={(event) => setTrainSaveName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleSaveTrain();
                      if (event.key === "Escape") setTrainSaveOpen(false);
                    }}
                    placeholder="Profile name"
                    style={{ height: 28, width: 210, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", padding: "0 9px", fontSize: 11 }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveTrain()}
                    disabled={trainSaveBusy || !trainSaveName.trim()}
                    style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text)", borderRadius: 8, height: 28, padding: "0 8px", cursor: trainSaveBusy ? "default" : "pointer", fontSize: 11 }}
                  >
                    {trainSaveBusy ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrainSaveOpen(false)}
                    disabled={trainSaveBusy}
                    style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-muted)", borderRadius: 8, height: 28, padding: "0 8px", cursor: "pointer", fontSize: 11 }}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <button
                onClick={handleExportSession}
                disabled={!selectedSession}
                title={selectedSession ? "Export HTML" : "Export is available after the session is saved"}
                aria-label="Export HTML"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 34,
                  padding: "0 12px",
                  border: "none",
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
                  e.currentTarget.style.background = "color-mix(in srgb, var(--bg-hover) 80%, var(--bg))";
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
                  minHeight: 34, padding: "0 12px",
                  background: activeTopPanel === "system" ? "color-mix(in srgb, var(--accent) 10%, var(--bg))" : "transparent",
                  border: "none",
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
          {mainView === "chat" && showChat && selectedSession?.id && (sessionStats || contextUsage) && (() => {
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
                className="codex-top-reveal"
                style={{
                  marginLeft: "auto",
                  display: "flex", alignItems: "center", gap: 10,
                  paddingLeft: 12,
                  paddingRight: rightPanelOpen ? 12 : 0,
                  fontSize: 11, color: "var(--text-muted)",
                  whiteSpace: "nowrap", cursor: "default",
                  fontVariantNumeric: "tabular-nums",
                  minHeight: 34,
                  borderRadius: 999,
                  border: "1px solid color-mix(in srgb, var(--shell-edge) 85%, transparent)",
                  background: "color-mix(in srgb, var(--bg) 82%, transparent)",
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
                  background: "var(--panel-gradient)",
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
        <div style={{ flex: 1, overflow: "hidden", position: "relative", display: filePreviewMode ? "flex" : "block", background: "linear-gradient(180deg, color-mix(in srgb, var(--bg) 95%, transparent) 0%, color-mix(in srgb, var(--bg-panel) 88%, transparent) 100%)" }}>
          {filePreviewMode && activeFileTab ? (
            <>
              <div style={{ width: 360, minWidth: 280, maxWidth: 440, borderRight: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
                {showChat ? (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                    {trainRoundsPanel}
                    {trainNoticePanel}
                    <ChatWindow
                      session={selectedSession}
                      newSessionCwd={effectiveNewSessionCwd}
                      onAgentEnd={handleAgentEnd}
                      onSessionCreated={handleSessionCreated}
                      onSessionForked={handleSessionForked}
                      modelsRefreshKey={modelsRefreshKey}
                      chatInputRef={chatInputRef}
                      onBranchDataChange={handleBranchDataChange}
                      loadBranchTree={activeTopPanel === "branches"}
                      onSystemPromptChange={handleSystemPromptChange}
                      onSessionStatsChange={handleSessionStatsChange}
                      onContextUsageChange={handleContextUsageChange}
                      onSendOverride={handleFileContextSend}
                      externalMessages={multiAgentMessages}
                      inputPlaceholder={activeFileTab ? `Ask about file: ${activeFileTab.filePath}` : "Message…"}
                      inputAccessory={collaborationAccessory}
                    />
                  </div>
                ) : <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>No active session</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ height: 34, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, padding: "0 10px", background: "var(--bg-panel)", flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Preview</span>
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeFileTab.filePath}</span>
                  <button onClick={() => setActiveFileTabId(null)} style={{ marginLeft: "auto", fontSize: 12, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Close</button>
                </div>
                <div style={{ flex: 1, overflow: "auto" }}>
                  <FileViewer filePath={activeFileTab.filePath} cwd={activeCwd ?? undefined} />
                </div>
              </div>
            </>
          ) : mainView !== "workflow" && focusedAgentTaskId && orchestrateState.tasks.find((t) => t.id === focusedAgentTaskId) ? (
            <AgentWorkbench
              task={orchestrateState.tasks.find((t) => t.id === focusedAgentTaskId)!}
              sessionId={orchestrateState.sessionId}
              onBack={() => setFocusedAgentTaskId(null)}
              onRerun={rerunTask}
              onPromoteProfile={promoteProfile}
              onPromoteTaskSkills={promoteTaskSkills}
              onRenameProfile={handleRenameProfile}
            />
          ) : mainView === "workflow" && focusedAgentTaskId && orchestrateState.tasks.find((t) => t.id === focusedAgentTaskId) ? (
            <AgentWorkbench
              task={orchestrateState.tasks.find((t) => t.id === focusedAgentTaskId)!}
              sessionId={orchestrateState.sessionId}
              onBack={() => {
                setFocusedAgentTaskId(null);
                setMainView("workflow");
              }}
              onRerun={rerunTask}
              onPromoteProfile={promoteProfile}
              onPromoteTaskSkills={promoteTaskSkills}
              onRenameProfile={handleRenameProfile}
            />
          ) : showTrain ? (
            trainBody
          ) : mainView === "workflow" ? (
            workflowBody
          ) : showChat ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
              {trainRoundsPanel}
              {trainNoticePanel}
              <ChatWindow
                session={selectedSession}
                newSessionCwd={effectiveNewSessionCwd}
                onAgentEnd={handleAgentEnd}
                onSessionCreated={handleSessionCreated}
                onSessionForked={handleSessionForked}
                modelsRefreshKey={modelsRefreshKey}
                chatInputRef={chatInputRef}
                onBranchDataChange={handleBranchDataChange}
                loadBranchTree={activeTopPanel === "branches"}
                onSystemPromptChange={handleSystemPromptChange}
                onSessionStatsChange={handleSessionStatsChange}
                onContextUsageChange={handleContextUsageChange}
                onSendOverride={handleGuardianRoutedSend}
                externalMessages={multiAgentMessages}
                inputPlaceholder={!selectedSession?.id && !(newSessionCwd ?? activeCwd) ? "Select a directory to start…" : "Message…"}
                inputAccessory={collaborationAccessory}
              />
            </div>
          ) : showPlaceholder ? (
            activeCwd ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
                <div className="codex-card" style={{ width: "min(620px, 100%)", borderRadius: 24, padding: "24px 26px", display: "grid", gap: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--accent) 10%, var(--bg))", color: "var(--accent)", flexShrink: 0 }}>
                      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16" />
                        <path d="M4 12h10" />
                        <path d="M4 17h7" />
                        <path d="M16 15l3 3 3-3" />
                      </svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 21, fontWeight: 850, color: "var(--text)", letterSpacing: "-0.03em", marginBottom: 5 }}>Workflow orchestration workspace</div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
                        This project turns repeatable tasks into workflows: strong models plan, review, and judge; faster weak models handle gathering, extraction, routing, drafting, and structured writeback through reusable Profiles.
                      </div>
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                    Open a session from the sidebar to continue debugging, or switch to Workflow to compose Profile nodes into a clean multi-model execution chain.
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
                <div className="codex-card" style={{ width: "min(720px, 100%)", borderRadius: 28, padding: "28px 30px", display: "grid", gap: 18, background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 5%, var(--bg)) 0%, color-mix(in srgb, var(--bg-panel) 92%, transparent) 100%)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--accent) 12%, var(--bg))", color: "var(--accent)" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 20h10" />
                        <path d="M10 20c5.5-2.5.8-6.4 3-10" />
                        <path d="M9.5 9.4c.6-1.9 2.1-3.1 4.1-3.8" />
                        <path d="M14.5 3c2.7 1.1 4.5 3.5 4.5 6.5 0 4.5-4 6.8-7 8.5" />
                        <path d="M5 10c0-2.1 1.1-3.9 2.8-5" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em", marginBottom: 6 }}>Start a Codex-style workspace</div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
                        Pick a project, open a session, and keep chat, files, and workflow state in one surface.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                    <div className="codex-card" style={{ borderRadius: 20, padding: "16px 16px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 6 }}>1. Project</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Choose a workspace folder</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>Bind sessions, files, and workflows to the same repo from the left project switcher.</div>
                    </div>
                    <div className="codex-card" style={{ borderRadius: 20, padding: "16px 16px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 6 }}>2. Models</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Connect model profiles</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>Add or switch model profiles from the footer so the composer can route work immediately.</div>
                    </div>
                    <div className="codex-card" style={{ borderRadius: 20, padding: "16px 16px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 6 }}>3. Collaborate</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Run chat or workflow</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>Stay in one transcript while the orchestration strip exposes progress, retries, and escalation state.</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>


    </div>
    </div>

    {apiGuideOpen && (
      <ApiGuide
        panel
        onClose={() => setApiGuideOpen(false)}
        onApplied={() => setModelsRefreshKey((k) => k + 1)}
        onOpenModels={() => {
          setApiGuideOpen(false);
          setModelsConfigOpen(true);
        }}
      />
    )}
    {modelsConfigOpen && (
      <ModelsConfig
        cwd={activeCwd ?? selectedSession?.cwd ?? newSessionCwd}
        onClose={() => { setModelsConfigOpen(false); setModelsRefreshKey((k) => k + 1); }}
        onOpenGuide={() => {
          setModelsConfigOpen(false);
          setApiGuideOpen(true);
        }}
      />
    )}
    {profilesPanelOpen && <ProfilesPanel onClose={() => setProfilesPanelOpen(false)} />}
    {skillsConfigOpen && (activeCwd ?? selectedSession?.cwd ?? newSessionCwd) && (
      <SkillsConfig cwd={(activeCwd ?? selectedSession?.cwd ?? newSessionCwd)!} onClose={() => setSkillsConfigOpen(false)} />
    )}
    </>
  );
}

function TrainRoundCard({
  sessionId,
  round,
  open,
  detailState,
  onToggle,
}: {
  sessionId: string | null;
  round: TrainRound;
  open: boolean;
  detailState: TrainRoundDetailState;
  onToggle: (open: boolean) => void;
}) {
  const detail = detailState?.status === "loaded" ? detailState.detail : null;
  const suggestion = detail?.suggestion || round.suggestion;
  const alignment = detail?.alignment || round.alignment;
  const challengerText = detail?.challengerOutput || detail?.challenger_output || round.challengerPreview || "";
  const beforeText = detail?.base_output_before || round.baseBeforePreview || "";
  const afterText = detail?.base_output_after || round.baseAfterPreview || "";
  const userFeedback = detail?.user_feedback || (round as TrainRound & { user_feedback?: string }).user_feedback || "";
  const suggestionText = suggestion
    ? `${suggestion.target_file}#${suggestion.target_section}\n${suggestion.change_type}: ${suggestion.after || ""}\n\n${suggestion.rationale || ""}`
    : "";
  const chars = [
    alignment?.score ? `对齐 ${alignment.score}/100` : "",
    round.challengerChars ? `高端 ${round.challengerChars.toLocaleString()} chars` : "",
    round.baseAfterChars ? `重跑 ${round.baseAfterChars.toLocaleString()} chars` : "",
  ].filter(Boolean).join(" · ");

  return (
    <details
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
      style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)", overflow: "hidden" }}
    >
      <summary style={{ cursor: "pointer", padding: "8px 10px", listStyle: "none", display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>Round {round.round}</span>
        <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {round.summary || round.suggestion?.rationale || "训练轮次完成"}
        </span>
        {chars ? <span style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>{chars}</span> : null}
      </summary>
      {open ? (
        <div style={{ display: "grid", gap: 8, padding: "0 10px 10px", fontSize: 12, color: "var(--text-muted)" }}>
          {!sessionId ? (
            <div style={{ color: "var(--text-dim)" }}>等待 session 连接…</div>
          ) : detailState?.status === "loading" ? (
            <div style={{ color: "var(--text-dim)" }}>正在加载本轮详情…</div>
          ) : detailState?.status === "error" ? (
            <div style={{ color: "#ef4444" }}>详情加载失败：{detailState.error}</div>
          ) : null}
          {alignment ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 8, background: "color-mix(in srgb, var(--bg-panel) 72%, transparent)" }}>
              <span style={{ fontWeight: 800, color: alignment.score >= 80 ? "#22c55e" : "#f59e0b" }}>对齐分 {alignment.score}/100</span>
              <span style={{ color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alignment.reason || alignment.remaining_gap || "已完成对齐评估"}</span>
            </div>
          ) : null}
          <TrainSection title="用户本轮评价" text={userFeedback} />
          <TrainSection title="当前模型原成果" text={beforeText} />
          <TrainSection title="最强模型成果" text={challengerText} />
          <TrainSection title="改进补丁" text={suggestionText} />
          <TrainSection title="当前模型重答" text={afterText} />
        </div>
      ) : null}
    </details>
  );
}

function TrainComparePanel({
  title,
  subtitle,
  text,
  tone,
}: {
  title: string;
  subtitle: string;
  text: string;
  tone: "base" | "challenger";
}) {
  const accent = tone === "challenger" ? "#8b5cf6" : "var(--accent)";
  return (
    <section className="codex-card" style={{ borderRadius: 18, padding: "14px 16px", minHeight: 360, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 850, color: "var(--text)" }}>{title}</div>
          <div style={{ marginTop: 3, fontSize: 11, color: "var(--text-muted)" }}>{subtitle}</div>
        </div>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: accent, boxShadow: `0 0 0 4px ${tone === "challenger" ? "rgba(139,92,246,0.12)" : "color-mix(in srgb, var(--accent) 14%, transparent)"}` }} />
      </div>
      <div
        className="codex-scroll-column"
        style={{
          flex: 1,
          minHeight: 280,
          maxHeight: "52vh",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          fontFamily: "var(--font-mono)",
          lineHeight: 1.62,
          padding: "12px 13px",
          borderRadius: 12,
          border: "1px solid var(--shell-edge)",
          background: "color-mix(in srgb, var(--bg-panel) 72%, transparent)",
          color: "var(--text-muted)",
          fontSize: 12,
        }}
      >
        {text}
      </div>
    </section>
  );
}

function TrainSection({ title, text }: { title: string; text: string }) {
  return (
    <section style={{ display: "grid", gap: 5 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text)", letterSpacing: "0.02em" }}>{title}</div>
      <div style={{
        maxHeight: 220,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        fontFamily: "var(--font-mono)",
        lineHeight: 1.55,
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--bg-panel) 72%, transparent)",
        color: "var(--text-muted)",
      }}>
        {text || "无"}
      </div>
    </section>
  );
}
