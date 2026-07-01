"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AgentMessage, SessionInfo, SessionTreeNode } from "@/lib/types";
import { normalizeToolCalls } from "@/lib/normalize";
import { sendAgentCommand } from "@/lib/agent-client";
import type { ToolEntry } from "@/components/ToolPanel";

export interface SessionData {
  sessionId: string;
  filePath: string;
  tree: SessionTreeNode[];
  leafId: string | null;
  context: {
    messages: AgentMessage[];
    entryIds: string[];
    thinkingLevel: string;
    model: { provider: string; modelId: string } | null;
  };
}

interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

type OptimisticAgentMessage = AgentMessage & { _optimistic?: boolean };

interface CompactCommandResult {
  tokensBefore?: number;
  estimatedTokensAfter?: number;
}

type LoadSessionMode = "full" | "light" | "tree";

export type AgentPhase =
  | { kind: "waiting_model" }
  | { kind: "running_tools"; tools: { id: string; name: string }[] }
  | null;

export interface CompactResultInfo {
  reason: "manual" | "threshold" | "overflow" | "auto" | string;
  tokensBefore: number;
  estimatedTokensAfter: number;
}

export interface UseAgentSessionOptions {
  session: SessionInfo | null;
  newSessionCwd: string | null;
  onAgentEnd?: () => void;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionForked?: (newSessionId: string) => void;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => void;
  loadBranchTree?: boolean;
  onSystemPromptChange?: (prompt: string | null) => void;
  setToolPreset?: (preset: "none" | "default" | "full") => void;
}

export type ThinkingLevelOption = "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const PROGRAMMATIC_SCROLL_IGNORE_MS = 700;
const USER_SCROLL_INTENT_MS = 1200;
const HISTORY_LOAD_TOP_THRESHOLD_PX = 32;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Space", "Spacebar"]);

function readCompactResult(result: unknown, reason: string): CompactResultInfo | null {
  if (!result || typeof result !== "object") return null;
  const r = result as CompactCommandResult;
  if (typeof r.tokensBefore !== "number" || typeof r.estimatedTokensAfter !== "number") return null;
  return { reason, tokensBefore: r.tokensBefore, estimatedTokensAfter: r.estimatedTokensAfter };
}

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (content: string) => void;
  addImages: (files: File[]) => void;
}

export interface AttachedImage {
  data: string;
  mimeType: string;
  previewUrl: string;
}

type SelectedModel = { provider: string; modelId: string };
type ModelEntry = { id: string; name: string; provider: string };
type ModelsResponse = {
  models: Record<string, string>;
  modelList?: ModelEntry[];
  defaultModel?: SelectedModel | null;
  thinkingLevels?: Record<string, string[]>;
  thinkingLevelMaps?: Record<string, Record<string, string | null>>;
};

export function useAgentSession(opts: UseAgentSessionOptions) {
  const {
    session, newSessionCwd, onAgentEnd, onSessionCreated, onSessionForked,
    modelsRefreshKey, onBranchDataChange, loadBranchTree, onSystemPromptChange,
  } = opts;

  const isNew = session === null && newSessionCwd !== null;
  const activeSessionId = session?.id ?? null;

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamingMessageId, setCurrentStreamingMessageId] = useState<string | null>(null);
  const streamingIdCounter = useRef(0);
  const [agentRunning, setAgentRunning] = useState(false);
  const [modelNames, setModelNames] = useState<Record<string, string>>({});
  const [modelList, setModelList] = useState<ModelEntry[]>([]);
  const [modelThinkingLevels, setModelThinkingLevels] = useState<Record<string, string[]>>({});
  const [modelThinkingLevelMaps, setModelThinkingLevelMaps] = useState<Record<string, Record<string, string | null>>>({});
  const [newSessionModel, setNewSessionModel] = useState<SelectedModel | null>(null);
  const [newSessionDefaultModel, setNewSessionDefaultModel] = useState<SelectedModel | null>(null);
  const [toolPreset, setToolPreset] = useState<"none" | "default" | "full">("none");
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>("auto");
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; maxAttempts: number; errorMessage?: string } | null>(null);
  const [contextUsage, setContextUsage] = useState<{ percent: number | null; contextWindow: number; tokens: number | null } | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [forkingEntryId, setForkingEntryId] = useState<string | null>(null);
  const [currentModelOverride, setCurrentModelOverride] = useState<{ provider: string; modelId: string } | null>(null);
  const [pendingModel, setPendingModel] = useState<{ provider: string; modelId: string } | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [compactError, setCompactError] = useState<string | null>(null);
  const [compactResult, setCompactResult] = useState<CompactResultInfo | null>(null);
  const [agentPhase, setAgentPhase] = useState<AgentPhase>(null);
  const [finalOutputStarted, setFinalOutputStarted] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingFullHistory, setLoadingFullHistory] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(session?.id ?? null);
  const sessionLoadTokenRef = useRef(0);
  const fullSessionLoadTokenRef = useRef(-1);
  const branchTreeLoadedForRef = useRef<string | null>(null);
  const pendingStreamingMessageRef = useRef<AgentMessage | null>(null);
  const streamingMessageFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentRunningRef = useRef(false);
  const handleAgentEventRef = useRef<((event: AgentEvent) => void) | null>(null);
  const initialScrollDoneRef = useRef(false);
  const lastUserMsgRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollToUserRef = useRef(false);
  const completionScrollAllowedRef = useRef(true);
  const userScrollIntentUntilRef = useRef(0);
  const ignoreProgrammaticScrollUntilRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const setToolPresetState = opts.setToolPreset ?? setToolPreset;

  const currentModel = currentModelOverride ?? data?.context.model ?? pendingModel ?? null;
  const displayModel = isNew ? (newSessionModel ?? newSessionDefaultModel) : currentModel;

  const sessionStats = (() => {
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let cost = 0;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const u = (msg as import("@/lib/types").AssistantMessage).usage;
      if (!u) continue;
      tokens.input += u.input ?? 0;
      tokens.output += u.output ?? 0;
      tokens.cacheRead += u.cacheRead ?? 0;
      tokens.cacheWrite += u.cacheWrite ?? 0;
      cost += u.cost?.total ?? 0;
    }
    const total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
    return total > 0 ? { tokens, cost } : null;
  })();

  const loadSession = useCallback(async (sid: string, showLoading = false, includeState = false, mode: LoadSessionMode = "full", token = sessionLoadTokenRef.current) => {
    try {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams();
      if (includeState) params.set("includeState", "1");
      if (mode === "light") params.set("light", "1");
      if (mode === "tree") params.set("treeOnly", "1");
      const query = params.toString();
      const url = `/api/sessions/${encodeURIComponent(sid)}${query ? `?${query}` : ""}`;
      const res = await fetch(url);
      if (res.status === 404) {
        if (showLoading) {
          setData(null);
          setActiveLeafId(null);
          setMessages([]);
          setError(null);
        }
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as Partial<SessionData> & { sessionId: string; filePath: string; tree: SessionTreeNode[]; leafId: string | null; partial?: boolean; context?: SessionData["context"]; agentState?: { running: boolean; state?: { isStreaming?: boolean; isCompacting?: boolean; contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null; systemPrompt?: string; thinkingLevel?: string } } };
      if (sessionIdRef.current !== sid || sessionLoadTokenRef.current !== token) return null;
      if (mode === "light" && fullSessionLoadTokenRef.current === token) return d.agentState ?? null;
      if (mode === "tree") {
        setData((prev) => prev ? { ...prev, tree: d.tree ?? [], leafId: d.leafId ?? null } : {
          sessionId: d.sessionId,
          filePath: d.filePath,
          tree: d.tree ?? [],
          leafId: d.leafId ?? null,
          context: { messages: [], entryIds: [], thinkingLevel: "off", model: null },
        });
        setActiveLeafId(d.leafId ?? null);
        return d.agentState ?? null;
      }
      if (!d.context) return d.agentState ?? null;
      const context = d.context;
      if (mode === "full") {
        fullSessionLoadTokenRef.current = token;
        setHasMoreHistory(false);
      } else if (mode === "light") {
        setHasMoreHistory(Boolean(d.partial));
      }
      setData((prev) => ({
        ...(d as SessionData),
        tree: mode === "light" ? (prev?.tree ?? d.tree ?? []) : (d.tree ?? []),
        context,
      }));
      setActiveLeafId(d.leafId ?? null);
      setMessages((prev) => mergeOptimisticMessages(prev, context.messages));
      setEntryIds(context.entryIds ?? []);
      setCurrentModelOverride(null);
      setError(null);
      // If no live agent state, fall back to thinking level from session file
      if (!d.agentState?.state?.thinkingLevel && context.thinkingLevel && context.thinkingLevel !== "off") {
        setThinkingLevel(context.thinkingLevel as ThinkingLevelOption);
      }
      return d.agentState ?? null;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      if (showLoading && sessionIdRef.current === sid && sessionLoadTokenRef.current === token) setLoading(false);
    }
  }, []);

  const loadContext = useCallback(async (sid: string, leafId: string | null) => {
    try {
      const url = leafId
        ? `/api/sessions/${encodeURIComponent(sid)}/context?leafId=${encodeURIComponent(leafId)}`
        : `/api/sessions/${encodeURIComponent(sid)}/context`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { context: { messages: AgentMessage[]; entryIds: string[] } };
      setMessages(d.context.messages);
      setEntryIds(d.context.entryIds ?? []);
    } catch (e) {
      console.error("Failed to load context:", e);
    }
  }, []);

  const loadTools = useCallback(async (sid: string) => {
    try {
      const tools = await sendAgentCommand<ToolEntry[]>(sid, { type: "get_tools" });
      if (tools) {
        const { getPresetFromTools } = await import("@/components/ToolPanel");
        setToolPresetState(getPresetFromTools(tools));
      }
    } catch (e) {
      console.error("Failed to load tools:", e);
    }
  }, [setToolPresetState]);

  const connectEvents = useCallback((sid: string): Promise<void> => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    const es = new EventSource(`/api/agent/${encodeURIComponent(sid)}/events`);
    eventSourceRef.current = es;
    return new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fallback = setTimeout(settle, 1200);

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as AgentEvent;
          if (event.type === "connected") {
            clearTimeout(fallback);
            settle();
          }
          handleAgentEventRef.current?.(event);
        } catch {
          // ignore
        }
      };
      es.onerror = () => {
        clearTimeout(fallback);
        settle();
        if (eventSourceRef.current === es && agentRunningRef.current) {
          es.close();
          eventSourceRef.current = null;
          setTimeout(() => {
            if (agentRunningRef.current) void connectEvents(sid);
          }, 1000);
        }
      };
    });
  }, []);

  useEffect(() => {
    agentRunningRef.current = agentRunning;
  }, [agentRunning]);

  const flushStreamingMessageUpdate = useCallback(() => {
    if (streamingMessageFlushTimerRef.current) {
      clearTimeout(streamingMessageFlushTimerRef.current);
      streamingMessageFlushTimerRef.current = null;
    }

    const normalized = pendingStreamingMessageRef.current;
    pendingStreamingMessageRef.current = null;
    if (!normalized) return;

    setMessages((prev) => {
      if (prev.length === 0) {
        return [{ ...normalized, role: "assistant", _streamId: String(++streamingIdCounter.current) } as unknown as AgentMessage];
      }
      const last = { ...prev[prev.length - 1] };
      return [...prev.slice(0, -1), { ...last, ...normalized, content: normalized.content?.length ? normalized.content : last.content } as AgentMessage];
    });
    setAgentPhase(null);
  }, []);

  const queueStreamingMessageUpdate = useCallback((message: AgentMessage) => {
    pendingStreamingMessageRef.current = normalizeToolCalls(message);
    if (streamingMessageFlushTimerRef.current) return;
    streamingMessageFlushTimerRef.current = setTimeout(flushStreamingMessageUpdate, 80);
  }, [flushStreamingMessageUpdate]);

  const handleAgentEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "agent_start":
        agentRunningRef.current = true;
        setAgentRunning(true);
        setAgentPhase({ kind: "waiting_model" });
        setIsStreaming(true);
        setFinalOutputStarted(false);
        break;
      case "final_output_started":
        setFinalOutputStarted(true);
        break;
      case "agent_end":
        flushStreamingMessageUpdate();
        agentRunningRef.current = false;
        setAgentRunning(false);
        setAgentPhase(null);
        setRetryInfo(null);
        setCurrentStreamingMessageId(null);
        setIsStreaming(false);
        setFinalOutputStarted(true);
        if (sessionIdRef.current) {
          loadSession(sessionIdRef.current, false, false, "light");
          fetch(`/api/agent/${encodeURIComponent(sessionIdRef.current)}`)
            .then((r) => r.json())
            .then((d: { state?: { contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null; systemPrompt?: string } }) => {
              if (d.state?.contextUsage !== undefined) setContextUsage(d.state.contextUsage ?? null);
              if (d.state?.systemPrompt !== undefined) setSystemPrompt(d.state.systemPrompt ?? null);
            })
            .catch(() => {});
        }
        onAgentEnd?.();
        break;
      case "message_start": {
        const startMsg = event.message as Partial<AgentMessage> | undefined;
        if (startMsg?.role === "user") break;
        if (startMsg) {
          const id = String(++streamingIdCounter.current);
          setCurrentStreamingMessageId(id);
          setMessages((prev) => [...prev, { ...normalizeToolCalls(startMsg as AgentMessage), role: "assistant", _streamId: id } as unknown as AgentMessage]);
        }
        setAgentPhase(null);
        break;
      }
      case "message_update": {
        const updMsg = event.message as Partial<AgentMessage> | undefined;
        if (updMsg?.role === "user" || !updMsg) break;
        queueStreamingMessageUpdate(updMsg as AgentMessage);
        break;
      }
      case "message_end": {
        flushStreamingMessageUpdate();
        setCurrentStreamingMessageId(null);
        setAgentPhase({ kind: "waiting_model" });
        break;
      }
      case "tool_execution_start": {
        const id = event.toolCallId as string;
        const name = event.toolName as string;
        setAgentPhase((prev) => {
          const tools = prev?.kind === "running_tools" ? [...prev.tools] : [];
          if (!tools.some((t) => t.id === id)) tools.push({ id, name });
          return { kind: "running_tools", tools };
        });
        break;
      }
      case "tool_execution_end": {
        const id = event.toolCallId as string;
        setAgentPhase((prev) => {
          if (prev?.kind !== "running_tools") return prev;
          const tools = prev.tools.filter((t) => t.id !== id);
          if (tools.length === 0) return { kind: "waiting_model" };
          return { kind: "running_tools", tools };
        });
        break;
      }
      case "auto_retry_start":
        setRetryInfo({ attempt: event.attempt as number, maxAttempts: event.maxAttempts as number, errorMessage: event.errorMessage as string | undefined });
        break;
      case "auto_retry_end":
        setRetryInfo(null);
        break;
      case "auto_compaction_start":
      case "compaction_start":
        setIsCompacting(true);
        setCompactError(null);
        setCompactResult(null);
        break;
      case "auto_compaction_end":
      case "compaction_end":
        setIsCompacting(false);
        if (event.errorMessage) {
          setCompactError(event.errorMessage as string);
          setCompactResult(null);
        } else if (!event.aborted) {
          setCompactResult(readCompactResult(event.result, (event.reason as string | undefined) ?? "auto"));
          if (sessionIdRef.current) loadSession(sessionIdRef.current, false, false, "light");
        }
        break;
    }
  }, [flushStreamingMessageUpdate, loadSession, onAgentEnd, queueStreamingMessageUpdate]);
  handleAgentEventRef.current = handleAgentEvent;

  const handleSend = useCallback(async (message: string, images?: AttachedImage[]) => {
    if (!message.trim() && !images?.length) return;
    if (agentRunning) return;

    const imageBlocks = images?.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mimeType, data: img.data } }));
    const userMsg: OptimisticAgentMessage = {
      role: "user",
      content: imageBlocks?.length
        ? [...(message.trim() ? [{ type: "text" as const, text: message }] : []), ...imageBlocks]
        : message,
      timestamp: Date.now(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, userMsg]);
    agentRunningRef.current = true;
    setAgentRunning(true);
    setAgentPhase({ kind: "waiting_model" });
    pendingScrollToUserRef.current = true;
    completionScrollAllowedRef.current = true;

    const piImages = images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));

    try {
      if (isNew && newSessionCwd) {
        const selectedModel = newSessionModel;
        if (selectedModel) setPendingModel(selectedModel);
        const { PRESET_NONE, PRESET_DEFAULT, PRESET_FULL } = await import("@/components/ToolPanel");
        const toolNames = toolPreset === "none" ? PRESET_NONE : toolPreset === "default" ? PRESET_DEFAULT : PRESET_FULL;
        const createRes = await fetch("/api/sessions/create-empty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cwd: newSessionCwd,
            name: message.trim().slice(0, 80) || "New Session",
          }),
        });
        if (!createRes.ok) throw new Error(`HTTP ${createRes.status}`);
        const created = await createRes.json() as { sessionId?: string; error?: string };
        if (!created.sessionId) throw new Error(created.error || "Failed to create session");
        const realId = created.sessionId;
        sessionIdRef.current = realId;
        await connectEvents(realId);

        if (selectedModel) {
          await sendAgentCommand(realId, { type: "set_model", provider: selectedModel.provider, modelId: selectedModel.modelId });
        }
        if (thinkingLevel !== "auto") {
          await sendAgentCommand(realId, { type: "set_thinking_level", level: thinkingLevel });
        }
        await sendAgentCommand(realId, { type: "set_tools", toolNames });
        await sendAgentCommand(realId, {
          type: "prompt",
          message,
          ...(piImages?.length ? { images: piImages } : {}),
        });
        onSessionCreated?.({
          id: realId,
          path: "",
          cwd: newSessionCwd,
          name: undefined,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          messageCount: 1,
          firstMessage: message,
        });
      } else if (session) {
        connectEvents(session.id);
        await sendAgentCommand(session.id, {
          type: "prompt",
          message,
          ...(piImages?.length ? { images: piImages } : {}),
        });
      }
    } catch (e) {
      console.error("Failed to send message:", e);
      agentRunningRef.current = false;
      setAgentRunning(false);
      setAgentPhase(null);
    }
  }, [isNew, newSessionCwd, newSessionModel, toolPreset, thinkingLevel, session, agentRunning, connectEvents, onSessionCreated]);

  const handleAbort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "abort" });
    } catch (e) {
      console.error("Failed to abort:", e);
    }
  }, []);

  const handleFork = useCallback(async (entryId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setForkingEntryId(entryId);
    try {
      const result = await sendAgentCommand<{ cancelled?: boolean; newSessionId?: string }>(sid, {
        type: "fork",
        entryId,
      });
      const { cancelled, newSessionId } = result ?? {};
      if (!cancelled && newSessionId) {
        onSessionForked?.(newSessionId);
      }
    } catch (e) {
      console.error("Fork failed:", e);
    } finally {
      setForkingEntryId(null);
    }
  }, [onSessionForked]);

  const handleNavigate = useCallback(async (entryId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    sendAgentCommand(sid, { type: "navigate_tree", targetId: entryId }).catch(() => {});
    setActiveLeafId(entryId);
    await loadContext(sid, entryId);
  }, [loadContext]);

  const handleLeafChange = useCallback(async (leafId: string | null) => {
    setActiveLeafId(leafId);
    const sid = sessionIdRef.current;
    if (!sid) return;
    await loadContext(sid, leafId);
    if (leafId) {
      sendAgentCommand(sid, { type: "navigate_tree", targetId: leafId }).catch(() => {});
    }
  }, [loadContext]);

  const handleModelChange = useCallback(async (provider: string, modelId: string) => {
    if (isNew) {
      setNewSessionModel({ provider, modelId });
      return;
    }
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_model", provider, modelId });
      setCurrentModelOverride({ provider, modelId });
    } catch (e) {
      console.error("Failed to set model:", e);
    }
  }, [isNew, setNewSessionModel]);

  const handleCompact = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || isCompacting) return;
    setIsCompacting(true);
    setCompactError(null);
    setCompactResult(null);
    try {
      const result = await sendAgentCommand<CompactCommandResult>(sid, { type: "compact" });
      setCompactResult(readCompactResult(result, "manual"));
      await loadSession(sid, true);
    } catch (e) {
      setCompactError(e instanceof Error ? e.message : String(e));
      setCompactResult(null);
    } finally {
      setIsCompacting(false);
    }
  }, [isCompacting, loadSession]);

  const handleSteer = useCallback(async (message: string, images?: AttachedImage[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setMessages((prev) => [...prev, { role: "user", content: `[steer] ${message}`, timestamp: Date.now() } as AgentMessage]);
    const piImages = images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));
    try {
      await sendAgentCommand(sid, {
        type: "steer",
        message,
        ...(piImages?.length ? { images: piImages } : {}),
      });
    } catch (e) {
      console.error("Failed to steer:", e);
    }
  }, []);

  const handleFollowUp = useCallback(async (message: string, images?: AttachedImage[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setMessages((prev) => [...prev, { role: "user", content: message, timestamp: Date.now() } as AgentMessage]);
    const piImages = images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));
    try {
      await sendAgentCommand(sid, {
        type: "follow_up",
        message,
        ...(piImages?.length ? { images: piImages } : {}),
      });
    } catch (e) {
      console.error("Failed to follow up:", e);
    }
  }, []);

  const handleAbortCompaction = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "abort_compaction" });
    } catch (e) {
      console.error("Failed to abort compaction:", e);
    }
  }, []);

  const handleThinkingLevelChange = useCallback(async (level: ThinkingLevelOption) => {
    setThinkingLevel(level);
    if (level === "auto") return; // "auto" leaves pi's current setting untouched
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_thinking_level", level });
    } catch (e) {
      console.error("Failed to set thinking level:", e);
    }
  }, []);

  const handleToolPresetChange = useCallback(async (preset: "none" | "default" | "full") => {
    const { PRESET_NONE, PRESET_DEFAULT, PRESET_FULL } = await import("@/components/ToolPanel");
    const toolNames = preset === "none" ? PRESET_NONE : preset === "default" ? PRESET_DEFAULT : PRESET_FULL;
    setToolPresetState(preset);
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_tools", toolNames });
    } catch (e) {
      console.error("Failed to set tools:", e);
    }
  }, [setToolPresetState]);

  // ponytail: instant for programmatic auto-scroll (no animation on high-freq streaming updates)
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "instant") => {
    ignoreProgrammaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_IGNORE_MS;
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const scrollUserMsgToTop = useCallback(() => {
    const container = scrollContainerRef.current;
    const el = lastUserMsgRef.current;
    if (!container || !el) return;
    const elAbsTop = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    ignoreProgrammaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_IGNORE_MS;
    container.scrollTo({ top: Math.max(0, elAbsTop), behavior: "smooth" });
  }, []);

  const loadFullHistoryIfAtTop = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasMoreHistory || loadingFullHistory) return;
    if (container.scrollTop > HISTORY_LOAD_TOP_THRESHOLD_PX) return;
    const sid = sessionIdRef.current;
    if (!sid) return;
    setLoadingFullHistory(true);
    completionScrollAllowedRef.current = false;
    void loadSession(sid, false, false, "full", sessionLoadTokenRef.current).finally(() => {
      if (sessionIdRef.current === sid) setLoadingFullHistory(false);
    });
  }, [hasMoreHistory, loadSession, loadingFullHistory]);

  const markUserScrollIntent = useCallback((event: Event) => {
    if (event instanceof KeyboardEvent) {
      if (!SCROLL_KEYS.has(event.key)) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable='true']")) return;
    }
    userScrollIntentUntilRef.current = Date.now() + USER_SCROLL_INTENT_MS;
    const isUpwardWheel = event instanceof WheelEvent && event.deltaY < 0;
    const isUpwardKey = event instanceof KeyboardEvent && ["ArrowUp", "PageUp", "Home"].includes(event.key);
    if (isUpwardWheel || isUpwardKey) loadFullHistoryIfAtTop();
  }, [loadFullHistoryIfAtTop]);

  const handleScrollPositionChange = useCallback(() => {
    loadFullHistoryIfAtTop();
    if (!agentRunningRef.current) return;
    if (Date.now() < ignoreProgrammaticScrollUntilRef.current) return;
    if (Date.now() > userScrollIntentUntilRef.current) return;
    completionScrollAllowedRef.current = false;
  }, [loadFullHistoryIfAtTop]);

  // Load session when the active conversation changes.
  useEffect(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setAgentRunning(false);
    setAgentPhase(null);
    setRetryInfo(null);
    setForkingEntryId(null);
    setCurrentModelOverride(null);
    setPendingModel(null);
    setContextUsage(null);
    setSystemPrompt(null);
    setCompactError(null);
    setCompactResult(null);
    setIsCompacting(false);
    initialScrollDoneRef.current = false;
    setHasMoreHistory(false);
    setLoadingFullHistory(false);
    pendingScrollToUserRef.current = false;
    completionScrollAllowedRef.current = true;

    if (activeSessionId) {
      pendingStreamingMessageRef.current = null;
      if (streamingMessageFlushTimerRef.current) {
        clearTimeout(streamingMessageFlushTimerRef.current);
        streamingMessageFlushTimerRef.current = null;
      }
      const loadToken = sessionLoadTokenRef.current + 1;
      sessionLoadTokenRef.current = loadToken;
      fullSessionLoadTokenRef.current = -1;
      branchTreeLoadedForRef.current = null;
      sessionIdRef.current = activeSessionId;
      setData(null);
      setActiveLeafId(null);
      setMessages((prev) => prev.filter((msg) => (msg as OptimisticAgentMessage)._optimistic));
      setEntryIds([]);
      setLoading(false);
      setError(null);
      void loadSession(activeSessionId, false, false, "light", loadToken);

      // Load live agent state in the background so the chat UI doesn't block on get_state.
      void fetch(`/api/agent/${encodeURIComponent(activeSessionId)}`)
        .then((r) => r.json())
        .then((agentState: { running?: boolean; state?: { isStreaming?: boolean; isCompacting?: boolean; contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null; systemPrompt?: string; thinkingLevel?: string } }) => {
          if (sessionIdRef.current !== activeSessionId) return;
          if (agentState?.running) {
            void loadTools(activeSessionId);
            if (agentState.state?.isStreaming) {
              setAgentRunning(true);
              setAgentPhase({ kind: "waiting_model" });
              connectEvents(activeSessionId);
            }
          }
          if (agentState?.state) {
            if (agentState.state.isCompacting !== undefined) setIsCompacting(agentState.state.isCompacting);
            if (agentState.state.contextUsage !== undefined) setContextUsage(agentState.state.contextUsage ?? null);
            if (agentState.state.systemPrompt !== undefined) setSystemPrompt(agentState.state.systemPrompt ?? null);
            if (agentState.state.thinkingLevel !== undefined) setThinkingLevel((agentState.state.thinkingLevel as ThinkingLevelOption) ?? "auto");
          }
        })
        .catch(() => {});
    } else {
      pendingStreamingMessageRef.current = null;
      if (streamingMessageFlushTimerRef.current) {
        clearTimeout(streamingMessageFlushTimerRef.current);
        streamingMessageFlushTimerRef.current = null;
      }
      sessionLoadTokenRef.current += 1;
      fullSessionLoadTokenRef.current = -1;
      branchTreeLoadedForRef.current = null;
      sessionIdRef.current = null;
      setData(null);
      setActiveLeafId(null);
      setMessages([]);
      setEntryIds([]);
      setLoading(false);
      setError(null);
      setHasMoreHistory(false);
      setLoadingFullHistory(false);
    }
    return () => {
      pendingStreamingMessageRef.current = null;
      if (streamingMessageFlushTimerRef.current) {
        clearTimeout(streamingMessageFlushTimerRef.current);
        streamingMessageFlushTimerRef.current = null;
      }
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [activeSessionId, newSessionCwd, loadSession, loadTools, connectEvents]);

  const handleLoadFullHistory = useCallback(async () => {
    loadFullHistoryIfAtTop();
  }, [loadFullHistoryIfAtTop]);

  useEffect(() => {
    if (!loadBranchTree || !session?.id) return;
    if (branchTreeLoadedForRef.current === session.id) return;
    const token = sessionLoadTokenRef.current;
    branchTreeLoadedForRef.current = session.id;
    void loadSession(session.id, false, false, "tree", token);
  }, [loadBranchTree, loadSession, session?.id]);

  useEffect(() => {
    onSystemPromptChange?.(systemPrompt);
  }, [systemPrompt, onSystemPromptChange]);

  useEffect(() => {
    if (!onBranchDataChange) return;
    onBranchDataChange(data?.tree ?? [], activeLeafId, handleLeafChange);
  }, [data?.tree, activeLeafId, handleLeafChange, onBranchDataChange]);

  useEffect(() => {
    window.addEventListener("keydown", markUserScrollIntent);
    window.addEventListener("pointerdown", markUserScrollIntent, { passive: true });
    return () => {
      window.removeEventListener("keydown", markUserScrollIntent);
      window.removeEventListener("pointerdown", markUserScrollIntent);
    };
  }, [markUserScrollIntent]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("wheel", markUserScrollIntent, { passive: true });
    container.addEventListener("touchstart", markUserScrollIntent, { passive: true });
    container.addEventListener("scroll", handleScrollPositionChange, { passive: true });
    return () => {
      container.removeEventListener("wheel", markUserScrollIntent);
      container.removeEventListener("touchstart", markUserScrollIntent);
      container.removeEventListener("scroll", handleScrollPositionChange);
    };
  }, [messages.length, loading, handleScrollPositionChange, markUserScrollIntent]);

  useEffect(() => {
    if (messages.length > 0) {
      if (pendingScrollToUserRef.current) {
        pendingScrollToUserRef.current = false;
        initialScrollDoneRef.current = true;
        scrollUserMsgToTop();
      } else if (!initialScrollDoneRef.current) {
        initialScrollDoneRef.current = true;
        scrollToBottom("instant");
      } else if (!agentRunningRef.current && completionScrollAllowedRef.current) {
        scrollToBottom("instant");
      }
    }
  }, [messages.length, agentRunning, scrollToBottom, scrollUserMsgToTop]);

  // Load model list
  useEffect(() => {
    const modelCwd = newSessionCwd ?? session?.cwd ?? "";
    const modelsUrl = modelCwd ? `/api/models?cwd=${encodeURIComponent(modelCwd)}` : "/api/models";
    const controller = new AbortController();
    fetch(modelsUrl, { signal: controller.signal }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then((d: ModelsResponse) => {
      setModelNames(d.models);
      setModelThinkingLevels(d.thinkingLevels ?? {});
      setModelThinkingLevelMaps(d.thinkingLevelMaps ?? {});
      const nextModelList = d.modelList ?? [];
      setModelList(nextModelList);
      const applyDefaultModel = (usableModels: ModelEntry[]) => {
        if (!isNew) return;
        const match = d.defaultModel
          ? usableModels.find((m) => m.id === d.defaultModel?.modelId && m.provider === d.defaultModel?.provider)
          : undefined;
        const displayModel = match ?? usableModels[0];
        setNewSessionDefaultModel(displayModel ? { provider: displayModel.provider, modelId: displayModel.id } : null);
      };
      applyDefaultModel(nextModelList);
    }).catch((e) => {
      if (e instanceof DOMException && e.name === "AbortError") return;
    });
    return () => controller.abort();
  }, [isNew, modelsRefreshKey, newSessionCwd, session?.cwd]);

  // Compact error auto-dismiss
  useEffect(() => {
    if (!compactError) return;
    const t = setTimeout(() => setCompactError(null), 3000);
    return () => clearTimeout(t);
  }, [compactError]);

  useEffect(() => {
    if (!compactResult) return;
    const t = setTimeout(() => setCompactResult(null), 6000);
    return () => clearTimeout(t);
  }, [compactResult]);

  return {
    // State
    data, loading, error, activeLeafId, messages, entryIds, isStreaming, currentStreamingMessageId,
    agentRunning, modelNames, modelList, modelThinkingLevels, modelThinkingLevelMaps, newSessionModel, toolPreset, thinkingLevel,
    retryInfo, contextUsage, systemPrompt, forkingEntryId,
    isCompacting, compactError, compactResult, currentModel, displayModel, sessionStats,
    hasMoreHistory, loadingFullHistory,
    isAutoModelSelection: isNew && newSessionModel === null,
    agentPhase,
    finalOutputStarted,
    isNew,
    // Refs
    sessionIdRef, eventSourceRef, messagesEndRef, scrollContainerRef,
    lastUserMsgRef, pendingScrollToUserRef, initialScrollDoneRef,
    // Actions
    handleSend, handleAbort, handleFork, handleNavigate, handleModelChange,
    handleCompact, handleSteer, handleFollowUp, handleAbortCompaction, handleLoadFullHistory,
    handleToolPresetChange, handleThinkingLevelChange, loadTools, setActiveLeafId, setData, setMessages,
    setAgentRunning, setForkingEntryId,
    // Subscriptions
    handleAgentEventRef,
  };
}

function mergeOptimisticMessages(
  previousMessages: AgentMessage[],
  persistedMessages: AgentMessage[],
): AgentMessage[] {
  const optimistic = previousMessages.filter((message) => (message as OptimisticAgentMessage)._optimistic);
  if (optimistic.length === 0) return preserveStableMessageReferences(previousMessages, persistedMessages);

  const persistedKeys = new Set(persistedMessages.map(getOptimisticMatchKey).filter(Boolean) as string[]);
  const unresolved = optimistic.filter((message) => {
    const key = getOptimisticMatchKey(message);
    return key ? !persistedKeys.has(key) : true;
  }).map((message) => {
    const next = { ...(message as OptimisticAgentMessage) };
    delete next._optimistic;
    return next as AgentMessage;
  });

  const merged = unresolved.length > 0 ? [...unresolved, ...persistedMessages] : persistedMessages;
  return preserveStableMessageReferences(previousMessages, merged);
}

function preserveStableMessageReferences(
  previousMessages: AgentMessage[],
  nextMessages: AgentMessage[],
): AgentMessage[] {
  if (previousMessages.length === 0 || nextMessages.length === 0) return nextMessages;

  let changed = previousMessages.length !== nextMessages.length;
  const reconciled = nextMessages.map((message, index) => {
    const previous = previousMessages[index];
    if (previous && getMessageStableSignature(previous) === getMessageStableSignature(message)) {
      return previous;
    }
    changed = true;
    return message;
  });

  return changed ? reconciled : previousMessages;
}

function getMessageStableSignature(message: AgentMessage): string {
  const raw = message as unknown as Record<string, unknown>;
  return JSON.stringify({
    role: message.role,
    content: message.content,
    customType: raw.customType,
    display: raw.display,
    timestamp: raw.timestamp,
    provider: raw.provider,
    model: raw.model,
    stopReason: raw.stopReason,
    usage: raw.usage,
    toolCallId: raw.toolCallId,
    isError: raw.isError,
  });
}

function getOptimisticMatchKey(message: AgentMessage): string | null {
  if (message.role !== "user") return null;
  if (typeof message.content === "string") return `user:text:${message.content.trim()}`;
  const text = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text.trim())
    .join("\n");
  const imageCount = message.content.filter((block) => block.type === "image").length;
  return `user:rich:${text}|images:${imageCount}`;
}
