"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import type { CollaborationProgress } from "@/lib/types";

export interface AgentTask {
  id: string;
  name: string;
  model: string;
  requestedModel?: string;
  modelSource?: string;
  modelReason?: string;
  prompt?: string;
  status: "pending" | "queued" | "waiting_for_dependency" | "waiting_confirmation" | "running" | "completed" | "incomplete" | "blocked" | "error" | "aborted" | "paused";
  output: string;
  delta: string; // streaming partial
  deps?: string[];
  artifactId?: string;
  profileId?: string;
  profileName?: string;
  profileSkills?: string[];
  profileAvailableSkills?: string[];
  profileProjectConfig?: Record<string, unknown>;
  profileSavedExperiences?: Array<{ lesson?: string; taskName?: string; savedAt?: number }>;
  skills?: string[];
  promotedProfileSkills?: string[];
  skillScope?: string;
  taskStages?: Array<{ stage?: string; name?: string; status?: string; goal?: string }>;
  currentTaskStage?: string;
  needsPlanDiscussion?: boolean;
  needsDebugging?: boolean;
  collaborationStatus?: string;
  definitionOfDone?: string;
  acceptanceCriteria?: string[];
  budget?: { maxRetries?: number; timeoutMs?: number; progressTimeoutMs?: number; maxOutputChars?: number };
  heartbeat?: TaskHeartbeat | null;
  lastProgressAt?: number;
  lastProgressStage?: string;
  completionGate?: CompletionGate;
  handoff?: HandoffPacket;
  memoryDiff?: string;
  leadDecision?: string;
  leadDecisionReason?: string;
  nextAction?: string;
  error?: string;
}

export interface TaskHeartbeat {
  phase?: "waiting_model_response" | "receiving_model_output" | string;
  message?: string;
  startedAt?: number;
  updatedAt?: number;
  elapsedMs?: number;
  model?: string;
}

export interface CompletionGate {
  taskId: string;
  status: "passed" | "failed";
  artifactId?: string;
  qualityStatus?: string;
  issues?: string[];
  checkedAt?: number;
}

export interface HandoffPacket {
  found?: boolean;
  completionStatus?: "completed" | "incomplete" | "blocked" | "unknown" | string;
  rawCompletionStatus?: string;
  acceptanceMapping?: string;
  downstreamDeliverable?: string;
  blockingReason?: string;
  nextStep?: string;
  memoryDiff?: string;
  issues?: string[];
}

export interface LedgerEvent {
  id: string;
  ts: number;
  isoTime?: string;
  sessionId: string;
  type: string;
  taskId?: string;
  stage?: string;
  status?: string;
  payload?: Record<string, unknown>;
}

export interface TrainSuggestion {
  target_file: string;
  target_section: string;
  change_type: "add" | "modify" | "remove" | string;
  before: string | null;
  after: string | null;
  rationale: string;
}

export interface TrainAlignment {
  score: number;
  similar?: boolean;
  improved?: boolean;
  reason?: string;
  remaining_gap?: string;
}

export interface TrainRound {
  round: number;
  status: "in_progress" | "done" | "discarded" | string;
  challenger_output?: string;
  challengerOutput?: string;
  challengerOutputRef?: string;
  detailRef?: string;
  suggestion?: TrainSuggestion | null;
  alignment?: TrainAlignment | null;
  summary?: string;
  challengerPreview?: string;
  baseBeforePreview?: string;
  baseAfterPreview?: string;
  challengerChars?: number;
  baseBeforeChars?: number;
  baseAfterChars?: number;
  base_output_before?: string;
  base_output_after?: string;
  timestamp?: number;
}

export interface TrainingState {
  sessionId?: string;
  status: "idle" | "running" | "error" | "saved" | string;
  phase: string;
  currentRound: number;
  maxRounds: number;
  hasChallengerOutput?: boolean;
  challengerOutputRef?: string;
  appliedPatches?: TrainSuggestion[];
  rounds: TrainRound[];
  activeTaskId?: string;
  lastError?: string;
  savedProfileId?: string;
  updatedAt?: number;
}

interface AgentProfilePayload {
  id?: string;
  name?: string;
  skills?: string[];
  availableSkills?: string[];
  projectConfig?: Record<string, unknown>;
  savedExperiences?: Array<{ lesson?: string; taskName?: string; savedAt?: number }>;
}

export interface ArtifactInfo {
  id: string;
  type: string;
  status: string;
  path: string;
  producerTaskId: string;
  producerTaskName?: string;
  consumers?: string[];
  consumerContracts?: Array<{ consumerTaskId?: string; consumedAt?: number; expectedUse?: string; observedStatus?: string; knownIssues?: string[] }>;
  handoff?: HandoffPacket;
  producerContract?: Record<string, unknown>;
  size?: number;
  summary?: string;
}

export interface PendingConfirmation {
  id: string;
  taskId: string;
  taskName: string;
  question: string;
  options: string;
  recommendation: string;
  raw?: string;
}

export interface ProjectMemorySnapshot {
  projectId?: string;
  cwd?: string;
  context?: string;
  progress?: string;
  bugs?: string;
  recentSummaries?: Array<{ id?: string; kind?: string; title?: string; path?: string; createdAt?: number; body?: string }>;
}

export interface OrchestrateState {
  sessionId: string | null;
  phase: "idle" | "guardian" | "running" | "waiting_confirmation" | "synthesizing" | "done" | "error";
  tasks: AgentTask[];
  artifacts: ArtifactInfo[];
  mainOutput: string; // final/streaming synthesis
  error: string | null;
  pendingConfirmation: PendingConfirmation | null;
  flowState?: unknown;
  projectMemory?: ProjectMemorySnapshot | null;
  progressUpdates: CollaborationProgress[];
  ledgerEvents: LedgerEvent[];
  training?: TrainingState | null;
}

const INITIAL: OrchestrateState = {
  sessionId: null,
  phase: "idle",
  tasks: [],
  artifacts: [],
  mainOutput: "",
  error: null,
  pendingConfirmation: null,
  flowState: null,
  projectMemory: null,
  progressUpdates: [],
  ledgerEvents: [],
  training: null,
};

export function useOrchestrate() {
  const [state, setState] = useState<OrchestrateState>(INITIAL);
  const wsRef = useRef<WebSocket | null>(null);

  // ponytail: rAF-batched delta buffer for task_delta events
  const deltaBufferRef = useRef<Map<string, string>>(new Map());
  const rafIdRef = useRef<number | null>(null);

  const flushDeltas = useCallback(() => {
    rafIdRef.current = null;
    const buf = deltaBufferRef.current;
    if (buf.size === 0) return;
    deltaBufferRef.current = new Map();
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => {
        const delta = buf.get(t.id);
        return delta ? { ...t, delta: t.delta + delta } : t;
      }),
    }));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushDeltas);
    }
  }, [flushDeltas]);

  const refreshProjectMemory = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/project-memory/${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setState((s) => ({ ...s, projectMemory: data.snapshot || null }));
    } catch {}
  }, []);

  const refreshLedger = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/ledger/${encodeURIComponent(sessionId)}?limit=200`);
      if (!res.ok) return;
      const data = await res.json() as { events?: LedgerEvent[] };
      setState((s) => ({ ...s, ledgerEvents: Array.isArray(data.events) ? data.events : s.ledgerEvents }));
    } catch {}
  }, []);

  useEffect(() => {
    if (state.sessionId) {
      void refreshProjectMemory(state.sessionId);
      void refreshLedger(state.sessionId);
    }
  }, [state.sessionId, refreshProjectMemory, refreshLedger]);

  // Connect WebSocket once
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3000");
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      handleEvent(msg);
    };

    return () => {
      ws.close();
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      // Flush any remaining deltas synchronously
      flushDeltas();
    };
  }, [flushDeltas]);

  function handleEvent(msg: Record<string, unknown>) {
    switch (msg.type) {
      case "session_start":
        setState({ sessionId: msg.sessionId as string, phase: "guardian", tasks: [], artifacts: [], mainOutput: "", error: null, pendingConfirmation: null, progressUpdates: [], ledgerEvents: [] });
        break;

      case "guardian_thinking":
        setState((s) => ({ ...s, phase: "guardian" }));
        break;

      case "guardian_done":
        setState((s) => ({ ...s, phase: "running" }));
        break;

      case "tasks_planned": {
        const tasks = (msg.tasks as AgentTask[]).map((t) => ({
          ...t,
          status: (t.status || "pending") as AgentTask["status"],
          output: t.output || "",
          delta: t.delta || "",
        }));
        setState((s) => ({ ...s, phase: "running", tasks, flowState: msg.flowState ?? s.flowState }));
        break;
      }

      case "artifact_update":
        setState((s) => ({ ...s, artifacts: (msg.artifacts as ArtifactInfo[]) || [], flowState: msg.flowState ?? s.flowState }));
        break;

      case "task_start":
        const profile = msg.profile as AgentProfilePayload | undefined;
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === msg.taskId ? {
              ...t,
              status: "running",
              model: (msg.model as string) || t.model,
              requestedModel: (msg.requestedModel as string) || t.requestedModel,
              modelSource: (msg.modelSource as string) || t.modelSource,
              modelReason: (msg.modelReason as string) || t.modelReason,
              skills: (msg.equippedSkills as string[]) || t.skills,
              skillScope: (msg.skillScope as string) || t.skillScope,
              definitionOfDone: ((msg.task as AgentTask | undefined)?.definitionOfDone) || t.definitionOfDone,
              acceptanceCriteria: ((msg.task as AgentTask | undefined)?.acceptanceCriteria) || t.acceptanceCriteria,
              budget: ((msg.task as AgentTask | undefined)?.budget) || t.budget,
              profileId: profile?.id || t.profileId,
              profileName: profile?.name || t.profileName,
              profileSkills: profile?.skills || t.profileSkills,
              profileAvailableSkills: profile?.availableSkills || t.profileAvailableSkills,
              profileProjectConfig: profile?.projectConfig || t.profileProjectConfig,
              profileSavedExperiences: profile?.savedExperiences || t.profileSavedExperiences,
            } : t
          ),
        }));
        break;

      case "task_delta": {
        const id = msg.taskId as string;
        const text = msg.delta as string;
        if (id && text) {
          const buf = deltaBufferRef.current;
          buf.set(id, (buf.get(id) ?? "") + text);
          scheduleFlush();
        }
        break;
      }

      case "task_done":
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === msg.taskId ? { ...t, status: "completed", output: msg.output as string, delta: "", artifactId: (msg.artifactId as string) || t.artifactId, handoff: (msg.handoff as HandoffPacket) || t.handoff } : t
          ),
        }));
        break;

      case "ledger_event":
        setState((s) => ({
          ...s,
          ledgerEvents: [...s.ledgerEvents, msg.event as LedgerEvent].slice(-100),
        }));
        break;

      case "train_state":
        setState((s) => ({ ...s, training: (msg.training as TrainingState) || s.training }));
        break;

      case "train_round_update":
        setState((s) => ({ ...s, training: (msg.training as TrainingState) || s.training }));
        break;

      case "train_saved":
        setState((s) => ({ ...s, training: (msg.training as TrainingState) || s.training }));
        break;

      case "train_error":
        setState((s) => ({
          ...s,
          training: (msg.training as TrainingState) || (s.training ? { ...s.training, status: "error", lastError: msg.error as string } : s.training),
        }));
        break;

      case "progress_reported":
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === msg.taskId ? {
              ...t,
              lastProgressAt: Date.now(),
              lastProgressStage: msg.milestone as string,
              collaborationStatus: ((msg.payload as { collaborationStatus?: string } | undefined)?.collaborationStatus) || t.collaborationStatus,
            } : t
          ),
        }));
        break;

      case "task_heartbeat":
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === msg.taskId ? { ...t, heartbeat: (msg.heartbeat as TaskHeartbeat | null) || null } : t
          ),
        }));
        break;

      case "task_completion_gate":
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === msg.taskId ? {
              ...t,
              completionGate: msg.gate as CompletionGate,
              collaborationStatus: (msg.gate as CompletionGate | undefined)?.status === "passed" ? "ready_for_review" : "needs_revision",
            } : t
          ),
        }));
        break;

      case "confirmation_required":
      case "session_paused":
        setState((s) => ({
          ...s,
          phase: "waiting_confirmation",
          pendingConfirmation: msg.confirmation as PendingConfirmation,
          tasks: s.tasks.map((t) =>
            t.id === (msg.taskId || (msg.confirmation as PendingConfirmation | undefined)?.taskId) ? { ...t, status: "waiting_confirmation", output: (msg.output as string) || t.output } : t
          ),
        }));
        break;

      case "confirmation_resolved":
        setState((s) => ({ ...s, phase: "running", pendingConfirmation: null }));
        break;

      case "task_error":
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === msg.taskId ? { ...t, status: "error", error: msg.error as string } : t
          ),
        }));
        break;

      case "task_incomplete":
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === msg.taskId ? { ...t, status: "incomplete", error: msg.error as string, completionGate: (msg.gate as CompletionGate) || t.completionGate } : t
          ),
        }));
        break;

      case "synthesizing":
        setState((s) => ({ ...s, phase: "synthesizing" }));
        break;

      case "coaching_start":
        setState((s) => ({
          ...s,
          phase: "running",
          tasks: msg.task ? [...s.tasks.filter((t) => t.id !== (msg.task as AgentTask).id), { ...(msg.task as AgentTask), status: "pending", output: "", delta: "" }] : s.tasks,
        }));
        break;

      case "coaching_done":
        setState((s) => ({ ...s, phase: "done", mainOutput: (msg.output as string) || s.mainOutput }));
        if (msg.sessionId) void refreshProjectMemory(msg.sessionId as string);
        break;

      case "coaching_error":
        setState((s) => ({ ...s, phase: "error", error: msg.error as string }));
        break;

      case "main_delta":
        setState((s) => ({ ...s, mainOutput: s.mainOutput + (msg.delta as string) }));
        break;

      case "session_done":
        setState((s) => ({
          ...s,
          phase: "done",
          mainOutput: (msg.output as string) || s.mainOutput,
        }));
        if (msg.sessionId) void refreshProjectMemory(msg.sessionId as string);
        break;

      case "lead_progress":
        setState((s) => ({
          ...s,
          progressUpdates: [
            ...s.progressUpdates,
            {
              id: String(msg.id || `${Date.now()}-${Math.random()}`),
              stage: msg.stage as string | undefined,
              text: String(msg.text || ""),
              status: (msg.status as CollaborationProgress["status"]) || "info",
              timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
            },
          ],
        }));
        break;

      case "session_aborted":
        setState((s) => ({ ...s, phase: "idle", tasks: [], artifacts: [], mainOutput: "", error: null }));
        break;

      case "task_aborted":
        setState((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === msg.taskId ? { ...t, status: "aborted", error: msg.reason as string } : t) }));
        break;

      case "task_rerun":
      case "task_resumed":
        setState((s) => ({ ...s, phase: "running", tasks: s.tasks.map((t) => t.id === msg.taskId ? { ...t, status: "pending", model: (msg.model as string) || t.model, requestedModel: (msg.model as string) || t.requestedModel, output: "", delta: "" } : t) }));
        break;

      case "task_paused":
        setState((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === msg.taskId ? { ...t, status: "paused" } : t) }));
        break;

      case "agent_decisions":
        setState((s) => ({ ...s, tasks: (msg.tasks as AgentTask[]) || s.tasks }));
        break;

      case "profile_skills_promoted":
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === msg.taskId
              ? {
                  ...t,
                  promotedProfileSkills: (msg.skills as string[]) || t.promotedProfileSkills,
                  profileSkills: (msg.profile as { skills?: string[] } | undefined)?.skills || t.profileSkills,
                  profileAvailableSkills: (msg.profile as { availableSkills?: string[] } | undefined)?.availableSkills || t.profileAvailableSkills,
                }
              : t,
          ),
        }));
        break;

      case "session_error":
        setState((s) => ({ ...s, phase: "error", error: msg.error as string }));
        break;
    }
  }

  const run = useCallback(async (input: string, options?: { cwd?: string | null; sessionId?: string | null }) => {
    setState({ ...INITIAL, phase: "guardian" });
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, cwd: options?.cwd || undefined, sessionId: options?.sessionId || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setState((s) => ({ ...s, phase: "error", error: data?.error || `orchestrate failed: ${res.status}` }));
        return;
      }
      if (data?.status === "coaching") {
        setState((s) => ({ ...s, sessionId: data.sessionId ?? s.sessionId, phase: "running" }));
      }
      if (data?.status === "planned" && Array.isArray(data.tasks)) {
        setState((s) => ({
          ...s,
          sessionId: data.sessionId ?? s.sessionId,
          phase: "running",
          tasks: data.tasks.map((t: { id: string; name: string; model: string }) => ({
            id: t.id,
            name: t.name,
            model: t.model,
            status: "pending" as const,
            output: "",
            delta: "",
          })),
        }));
      }
      if (data?.status === "done" && data.output) {
        setState((s) => ({ ...s, sessionId: data.sessionId ?? s.sessionId, phase: "done", mainOutput: data.output, tasks: data.tasks ?? [] }));
      }
    } catch (err) {
      setState((s) => ({ ...s, phase: "error", error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const coach = useCallback(async (feedback: string, options: { taskId?: string; skills?: string[] } = {}) => {
    if (!state.sessionId) return;
    setState((s) => ({ ...s, phase: "running" }));
    await fetch(`/api/orchestrate/${encodeURIComponent(state.sessionId)}/coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback, ...options }),
    });
  }, [state.sessionId]);

  const startTrain = useCallback(async (options: { taskId?: string } = {}) => {
    if (!state.sessionId) return { ok: false, error: "sessionId required" };
    const res = await fetch(`/api/train/${encodeURIComponent(state.sessionId)}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    if (data?.training) setState((s) => ({ ...s, training: data.training as TrainingState }));
    return data;
  }, [state.sessionId]);

  const cancelTrain = useCallback(async () => {
    if (!state.sessionId) return { ok: false, error: "sessionId required" };
    const res = await fetch(`/api/train/${encodeURIComponent(state.sessionId)}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    if (data?.training) setState((s) => ({ ...s, training: data.training as TrainingState }));
    return data;
  }, [state.sessionId]);

  const saveTrain = useCallback(async (options: { name?: string; description?: string } = {}) => {
    if (!state.sessionId) return { ok: false, error: "sessionId required" };
    const res = await fetch(`/api/train/${encodeURIComponent(state.sessionId)}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    if (data?.training) setState((s) => ({ ...s, training: data.training as TrainingState }));
    return data;
  }, [state.sessionId]);

  const clearProjectSummaries = useCallback(async () => {
    if (!state.sessionId) return;
    await fetch(`/api/project-memory/${encodeURIComponent(state.sessionId)}/clear-summaries`, { method: "POST" });
    await refreshProjectMemory(state.sessionId);
  }, [state.sessionId, refreshProjectMemory]);

  const confirm = useCallback(async (decision = "confirm", note = "") => {
    if (!state.sessionId) return;
    await fetch(`/api/orchestrate/${encodeURIComponent(state.sessionId)}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
  }, [state.sessionId]);

  const reset = useCallback(() => setState(INITIAL), []);

  const switchModel = useCallback(async (taskId: string, model: string) => {
    await fetch(`/api/subagents/${taskId}/switch-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, sessionId: state.sessionId }),
    });
  }, [state.sessionId]);

  const abortTask = useCallback(async (taskId: string) => {
    await fetch(`/api/subagents/${taskId}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId, reason: "user aborted task" }),
    });
  }, [state.sessionId]);

  const rerunTask = useCallback(async (taskId: string, options: { model?: string; skills?: string[]; promptAppend?: string } = {}) => {
    await fetch(`/api/subagents/${taskId}/rerun`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId, ...options }),
    });
  }, [state.sessionId]);

  const promoteProfile = useCallback(async (taskId: string, options: { name?: string; description?: string } = {}) => {
    const res = await fetch(`/api/subagents/${taskId}/promote-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId, ...options }),
    });
    return res.json().catch(() => ({ ok: res.ok }));
  }, [state.sessionId]);

  const promoteTaskSkills = useCallback(async (taskId: string, skills?: string[]) => {
    const res = await fetch(`/api/subagents/${taskId}/promote-skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId, skills }),
    });
    return res.json().catch(() => ({ ok: res.ok }));
  }, [state.sessionId]);

  const pauseTask = useCallback(async (taskId: string) => {
    await fetch(`/api/subagents/${taskId}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId, reason: "user paused task" }),
    });
  }, [state.sessionId]);

  const resumeTask = useCallback(async (taskId: string) => {
    await fetch(`/api/subagents/${taskId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId }),
    });
  }, [state.sessionId]);

  return { state, run, reset, switchModel, abortTask, pauseTask, resumeTask, rerunTask, promoteProfile, promoteTaskSkills, confirm, coach, startTrain, cancelTrain, saveTrain, clearProjectSummaries, refreshProjectMemory };
}
