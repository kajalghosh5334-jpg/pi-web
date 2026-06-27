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
  status: "pending" | "waiting_for_dependency" | "waiting_confirmation" | "running" | "completed" | "error" | "aborted" | "paused";
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
  leadDecision?: string;
  leadDecisionReason?: string;
  nextAction?: string;
  error?: string;
}

export interface ArtifactInfo {
  id: string;
  type: string;
  status: string;
  path: string;
  producerTaskId: string;
  producerTaskName?: string;
  consumers?: string[];
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
  flowState?: any;
  projectMemory?: ProjectMemorySnapshot | null;
  progressUpdates: CollaborationProgress[];
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
};

export function useOrchestrate() {
  const [state, setState] = useState<OrchestrateState>(INITIAL);
  const wsRef = useRef<WebSocket | null>(null);

  const refreshProjectMemory = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/project-memory/${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setState((s) => ({ ...s, projectMemory: data.snapshot || null }));
    } catch {}
  }, []);

  useEffect(() => {
    if (state.sessionId) void refreshProjectMemory(state.sessionId);
  }, [state.sessionId, refreshProjectMemory]);

  // Connect WebSocket once
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3000");
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      handleEvent(msg);
    };

    return () => ws.close();
  }, []);

  function handleEvent(msg: Record<string, unknown>) {
    switch (msg.type) {
      case "session_start":
        setState({ sessionId: msg.sessionId as string, phase: "guardian", tasks: [], artifacts: [], mainOutput: "", error: null, pendingConfirmation: null, progressUpdates: [] });
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
              profileId: (msg.profile as any)?.id || t.profileId,
              profileName: (msg.profile as any)?.name || t.profileName,
              profileSkills: (msg.profile as any)?.skills || t.profileSkills,
              profileAvailableSkills: (msg.profile as any)?.availableSkills || t.profileAvailableSkills,
              profileProjectConfig: (msg.profile as any)?.projectConfig || t.profileProjectConfig,
              profileSavedExperiences: (msg.profile as any)?.savedExperiences || t.profileSavedExperiences,
            } : t
          ),
        }));
        break;

      case "task_delta":
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === msg.taskId ? { ...t, delta: t.delta + (msg.delta as string) } : t
          ),
        }));
        break;

      case "task_done":
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === msg.taskId ? { ...t, status: "completed", output: msg.output as string, delta: "", artifactId: (msg.artifactId as string) || t.artifactId } : t
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

  return { state, run, reset, switchModel, abortTask, pauseTask, resumeTask, rerunTask, promoteProfile, promoteTaskSkills, confirm, coach, clearProjectSummaries, refreshProjectMemory };
}
