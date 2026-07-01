"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage, AssistantMessage, ToolResultMessage, CustomMessage, SessionInfo, SessionTreeNode } from "@/lib/types";
import { MessageView, ThinkingStatusLine, deriveSteps, deriveStepFromCustomMessage, type Step } from "./MessageView";

import { ChatInput, type ChatInputHandle, type AttachedImage } from "./ChatInput";
import { ChatMinimap, useMessageRefs } from "./ChatMinimap";
import { useAgentSession } from "@/hooks/useAgentSession";
import { useAudio } from "@/hooks/useAudio";
import { useDragDrop } from "@/hooks/useDragDrop";

interface Props {
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
  onSessionStatsChange?: (stats: { tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null) => void;
  onContextUsageChange?: (usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => void;
  onSendOverride?: (message: string, images: AttachedImage[] | undefined, defaultSend: (message: string, images?: AttachedImage[]) => void | Promise<void>) => void | Promise<void>;
  externalMessages?: AgentMessage[];
  inputPlaceholder?: string;
  inputAccessory?: React.ReactNode;
}

function isCollaborationProgressMessage(msg: AgentMessage): boolean {
  return msg.role === "custom" && msg.customType === "collaboration_progress";
}

function hasAssistantText(msg: AgentMessage): boolean {
  if (msg.role !== "assistant" || !Array.isArray(msg.content)) return false;
  return msg.content.some((block) => {
    if (block.type !== "text") return false;
    return String(block.text || "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
  });
}

const TYPEWRITER_PHRASES = [
  "ready when you are.",
  "ask me anything.",
  "let's build something cool.",
  "explore your codebase.",
  "draft an email.",
  "summarize that paper.",
  "plan your weekend.",
  "explain it like I'm five.",
  "pair-program with me.",
  "fix that pesky bug.",
  "translate to English.",
  "write a haiku.",
  "brainstorm ideas.",
  "review my pull request.",
  "what should we cook tonight?",
  "ship it.",
  "make it pretty.",
  "rubber-duck with me.",
];

function Typewriter({ phrases }: { phrases: string[] }) {
  const [phraseIdx, setPhraseIdx] = useState(() => Math.floor(Math.random() * phrases.length));
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [caretOn, setCaretOn] = useState(true);

  useEffect(() => {
    const blink = setInterval(() => setCaretOn((v) => !v), 530);
    return () => clearInterval(blink);
  }, []);

  useEffect(() => {
    const current = phrases[phraseIdx];
    let timeout: ReturnType<typeof setTimeout>;
    if (!deleting && text === current) {
      timeout = setTimeout(() => setDeleting(true), 1800);
    } else if (deleting && text === "") {
      setDeleting(false);
      setPhraseIdx((i) => (i + 1) % phrases.length);
    } else {
      const next = deleting ? current.slice(0, text.length - 1) : current.slice(0, text.length + 1);
      timeout = setTimeout(() => setText(next), deleting ? 28 : 55);
    }
    return () => clearTimeout(timeout);
  }, [text, deleting, phraseIdx, phrases]);

  return (
    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
      {text}
      <span style={{ opacity: caretOn ? 1 : 0, color: "var(--accent)", marginLeft: 1 }}>▍</span>
    </span>
  );
}

const ChatWindow = memo(function ChatWindow({ session, newSessionCwd, onAgentEnd, onSessionCreated, onSessionForked, modelsRefreshKey, chatInputRef, onBranchDataChange, loadBranchTree, onSystemPromptChange, onSessionStatsChange, onContextUsageChange, onSendOverride, externalMessages = [], inputPlaceholder, inputAccessory }: Props) {
  const {
    loading, error, messages, entryIds, isStreaming, currentStreamingMessageId,
    agentRunning, modelNames, modelList, modelThinkingLevels, modelThinkingLevelMaps, toolPreset, thinkingLevel,
    retryInfo, contextUsage, forkingEntryId,
    isCompacting, compactError, compactResult, displayModel: displayModelValue, sessionStats,
    loadingFullHistory, isAutoModelSelection,
    finalOutputStarted,
    isNew,
    messagesEndRef, scrollContainerRef,
    lastUserMsgRef,
    handleSend, handleAbort, handleFork, handleNavigate, handleModelChange,
    handleCompact, handleSteer, handleFollowUp, handleAbortCompaction,
    handleToolPresetChange, handleThinkingLevelChange, handleAgentEventRef,
  } = useAgentSession({
    session, newSessionCwd, onAgentEnd, onSessionCreated, onSessionForked,
    modelsRefreshKey, onBranchDataChange, loadBranchTree, onSystemPromptChange,
  });

  const { soundEnabled, onSoundToggle, playDoneSound } = useAudio();
  const playDoneSoundRef = useRef(playDoneSound);
  playDoneSoundRef.current = playDoneSound;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Wrap agent event handler to play sound on agent_end
  const origHandler = handleAgentEventRef.current;
  useEffect(() => {
    handleAgentEventRef.current = (event) => {
      if (event.type === "agent_end" && soundEnabledRef.current) {
        playDoneSoundRef.current();
      }
      origHandler?.(event);
    };
  }, [origHandler, handleAgentEventRef]);

  // Push session stats up to AppShell for the top bar.
  // Compare scalar fields to avoid loops from new object identity each render.
  const statsKey = sessionStats
    ? `${sessionStats.tokens.input}|${sessionStats.tokens.output}|${sessionStats.tokens.cacheRead}|${sessionStats.tokens.cacheWrite}|${sessionStats.cost ?? 0}`
    : null;
  const sessionStatsRef = useRef(sessionStats);
  sessionStatsRef.current = sessionStats;
  useEffect(() => {
    onSessionStatsChange?.(sessionStatsRef.current);
  }, [statsKey, onSessionStatsChange]);
  useEffect(() => () => { onSessionStatsChange?.(null); }, [onSessionStatsChange]);

  // Push context usage up to AppShell as well.
  const ctxKey = contextUsage
    ? `${contextUsage.percent ?? "null"}|${contextUsage.contextWindow}|${contextUsage.tokens ?? "null"}`
    : null;
  const contextUsageRef = useRef(contextUsage);
  contextUsageRef.current = contextUsage;
  useEffect(() => {
    onContextUsageChange?.(contextUsageRef.current);
  }, [ctxKey, onContextUsageChange]);
  useEffect(() => () => { onContextUsageChange?.(null); }, [onContextUsageChange]);



  const onDrop = useCallback((files: File[]) => {
    chatInputRef?.current?.addImages(files);
  }, [chatInputRef]);

  const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(onDrop);

  const renderMessages = useMemo(
    () => [...messages, ...externalMessages].filter((message) => !isCollaborationProgressMessage(message)),
    [messages, externalMessages],
  );

  const isStreamingMsg = useCallback((m: AgentMessage) => (m as AgentMessage & { _streamId?: string })._streamId === currentStreamingMessageId, [currentStreamingMessageId]);
  const toolResultsCacheRef = useRef<{ key: string; map: Map<string, ToolResultMessage> }>({
    key: "",
    map: new Map(),
  });

  const toolResultsMap = useMemo(() => {
    const toolResults: ToolResultMessage[] = [];
    for (const msg of renderMessages) {
      if (msg.role === "toolResult") toolResults.push(msg as ToolResultMessage);
    }
    const key = toolResults
      .map((msg) => `${msg.toolCallId}:${msg.isError ? "1" : "0"}:${String(msg.content ?? "").length}`)
      .join("|");
    if (toolResultsCacheRef.current.key === key) {
      return toolResultsCacheRef.current.map;
    }
    const map = new Map<string, ToolResultMessage>();
    for (const msg of toolResults) {
      map.set(msg.toolCallId, msg);
    }
    toolResultsCacheRef.current = { key, map };
    return map;
  }, [renderMessages]);

  const lastUserIdx = useMemo(() => {
    for (let i = renderMessages.length - 1; i >= 0; i--) {
      if (renderMessages[i].role === "user") return i;
    }
    return -1;
  }, [renderMessages]);

  const pendingRunSteps = useMemo(() => {
    const steps: Step[] = [];
    for (let i = Math.max(0, lastUserIdx + 1); i < renderMessages.length; i++) {
      const msg = renderMessages[i];
      if (msg.role === "assistant") {
        steps.push(...deriveSteps((msg as AssistantMessage).content ?? [], toolResultsMap));
      } else if (msg.role === "custom") {
        const customStep = deriveStepFromCustomMessage(msg as CustomMessage);
        if (customStep) steps.push(customStep);
      }
    }
    return steps;
  }, [lastUserIdx, renderMessages, toolResultsMap]);

  const displayItems = useMemo(() => {
    type DisplayItem = { msg: AgentMessage; idx: number; runSteps?: Step[] };
    const items: DisplayItem[] = [];
    let assistantCandidate: { msg: AssistantMessage; idx: number } | null = null;

    const flushAssistant = () => {
      if (!assistantCandidate) return;
      const isCurrentRunAssistant = assistantCandidate.idx > lastUserIdx;
      items.push({
        msg: assistantCandidate.msg,
        idx: assistantCandidate.idx,
        runSteps: isCurrentRunAssistant && (agentRunning || pendingRunSteps.length > 0) ? [...pendingRunSteps] : undefined,
      });
      assistantCandidate = null;
    };

    for (let i = 0; i < renderMessages.length; i++) {
      const msg = renderMessages[i];
      if (msg.role === "user") {
        flushAssistant();
        items.push({ msg, idx: i });
        continue;
      }
      if (msg.role === "custom") {
        if (msg.display !== false) items.push({ msg, idx: i });
        continue;
      }
      if (msg.role === "toolResult") continue;
      if (msg.role !== "assistant") continue;

      const assistant = msg as AssistantMessage;
      const steps = deriveSteps(assistant.content ?? [], toolResultsMap);
      if (hasAssistantText(msg) || isStreamingMsg(msg) || steps.length > 0) {
        assistantCandidate = { msg: assistant, idx: i };
      }
    }
    flushAssistant();
    return items;
  }, [agentRunning, isStreamingMsg, lastUserIdx, pendingRunSteps, renderMessages, toolResultsMap]);

  const hasAttachedRunStatusLine = useMemo(() => {
    return displayItems.some((item) => {
      if (item.msg.role !== "assistant" || item.runSteps === undefined) return false;
      if (item.runSteps.length > 0 || isStreamingMsg(item.msg)) return true;
      return deriveSteps((item.msg as AssistantMessage).content ?? [], toolResultsMap).length > 0;
    });
  }, [displayItems, isStreamingMsg, toolResultsMap]);

  const minimapMessages = useMemo(
    () => displayItems
      .filter((item) => item.msg.role === "user" || item.msg.role === "assistant")
      .map((item) => item.msg),
    [displayItems],
  );
  const messageRefs = useMessageRefs(minimapMessages.length);

  const isEmptyNew = isNew && renderMessages.length === 0 && !isStreaming && !agentRunning;

  const availableThinkingLevels = displayModelValue
    ? (modelThinkingLevels[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  const currentThinkingLevelMap = displayModelValue
    ? (modelThinkingLevelMaps[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  const handleChatSend = useCallback((message: string, images?: AttachedImage[]) => {
    return onSendOverride ? onSendOverride(message, images, handleSend) : handleSend(message, images);
  }, [handleSend, onSendOverride]);

  const chatInputElement = useMemo(() => (
    <ChatInput
      ref={chatInputRef}
      onSend={handleChatSend}
      onAbort={handleAbort}
      onSteer={agentRunning ? handleSteer : undefined}
      onFollowUp={agentRunning ? handleFollowUp : undefined}
      isStreaming={agentRunning}
      model={displayModelValue}
      isAutoModelSelection={isAutoModelSelection}
      modelNames={modelNames}
      modelList={modelList}
      onModelChange={handleModelChange}
      onCompact={session || isNew ? handleCompact : undefined}
      onAbortCompaction={handleAbortCompaction}
      isCompacting={isCompacting}
      compactError={compactError}
      compactResult={compactResult}
      toolPreset={toolPreset}
      onToolPresetChange={session || isNew ? handleToolPresetChange : undefined}
      thinkingLevel={thinkingLevel}
      onThinkingLevelChange={session || isNew ? handleThinkingLevelChange : undefined}
      availableThinkingLevels={availableThinkingLevels}
      thinkingLevelMap={currentThinkingLevelMap}
      retryInfo={retryInfo}
      soundEnabled={soundEnabled}
      onSoundToggle={onSoundToggle}
      placeholder={inputPlaceholder}
      accessory={inputAccessory}
    />
  ), [
    agentRunning, availableThinkingLevels, chatInputRef, compactError, compactResult, currentThinkingLevelMap,
    displayModelValue, handleAbort, handleAbortCompaction, handleChatSend, handleCompact, handleFollowUp,
    handleModelChange, handleSteer, handleThinkingLevelChange, handleToolPresetChange, inputAccessory,
    inputPlaceholder, isAutoModelSelection, isCompacting, isNew, modelList, modelNames, onSoundToggle,
    retryInfo, session, soundEnabled, thinkingLevel, toolPreset,
  ]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted codex-card" style={{ margin: 18, borderRadius: 24 }}>
        Loading session...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400 codex-card" style={{ margin: 18, borderRadius: 24 }}>
        {error}
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{ padding: "16px 16px 10px" }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex animate-[drop-zone-in_0.15s_ease_both] items-center justify-center bg-[rgba(37,99,235,0.06)] backdrop-blur-[1px]">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0, 0.8, 1.6].map((delay) => (
              <div
                key={delay}
                className="absolute h-[720px] w-[720px] rounded-full border-[1.5px] border-solid border-[rgba(37,99,235,0.5)] animate-[drop-ripple_2.4s_ease-out_infinite_backwards]"
                style={{ transformOrigin: "center", animationDelay: `${delay}s` }}
              />
            ))}
          </div>
          <svg
            width="280" height="280" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-[0_6px_18px_rgba(37,99,235,0.18)]"
          >
            <rect x="28" y="44" width="84" height="60" rx="8" fill="rgba(37,99,235,0.08)" stroke="rgba(37,99,235,0.50)" strokeWidth="1.8"/>
            <path d="M36 100 L54 72 L68 88 L80 74 L104 100Z" fill="rgba(37,99,235,0.16)" stroke="rgba(37,99,235,0.40)" strokeWidth="1.4" strokeLinejoin="round"/>
            <circle cx="96" cy="58" r="8" fill="rgba(37,99,235,0.22)" stroke="rgba(37,99,235,0.55)" strokeWidth="1.6"/>
            <g stroke="rgba(37,99,235,0.45)" strokeWidth="1.4" strokeLinecap="round">
              <line x1="96" y1="46" x2="96" y2="43"/>
              <line x1="96" y1="70" x2="96" y2="73"/>
              <line x1="84" y1="58" x2="81" y2="58"/>
              <line x1="108" y1="58" x2="111" y2="58"/>
              <line x1="87.5" y1="49.5" x2="85.4" y2="47.4"/>
              <line x1="104.5" y1="66.5" x2="106.6" y2="68.6"/>
              <line x1="104.5" y1="49.5" x2="106.6" y2="47.4"/>
              <line x1="87.5" y1="66.5" x2="85.4" y2="68.6"/>
            </g>
          </svg>
        </div>
      )}

      {isEmptyNew ? (
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
          <div className="w-full max-w-[820px]">
            <div
              className="mb-3"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginLeft: 4,
                marginRight: 4,
                fontFamily: "var(--font-mono)",
                padding: "18px 20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1, lineHeight: 1.4, overflow: "hidden" }}>
                <img src="/pi-web-app-icon.png" alt="Pi Web.app" style={{ width: 40, height: 40, borderRadius: 10, display: "block", flexShrink: 0 }} />
                <span style={{ fontSize: 14, flex: "1 1 0", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", display: "block" }}>
                  <Typewriter phrases={TYPEWRITER_PHRASES} />
                </span>
              </div>
            </div>
            {chatInputElement}
          </div>
        </div>
      ) : (
      <>
      <div className="relative flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto [scrollbar-width:none] codex-scroll-column">
          <div style={{ width: "100%", padding: "0 28px 0 24px" }}>
            {session && (
              <div className="chat-session-hover-info" style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 4px" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 750, color: "var(--text)", letterSpacing: "-0.01em" }}>
                    {session.name || session.firstMessage || "Current Session"}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>
                  <div>{session.messageCount} messages</div>
                  <div>{session.cwd}</div>
                </div>
              </div>
            )}
            {loadingFullHistory && (
              <div style={{ margin: "0 0 8px", textAlign: "center", fontSize: 11, color: "var(--text-dim)" }}>
                Loading earlier messages...
              </div>
            )}

            {(() => {
              let refIdx = 0;
              return displayItems.map((item) => {
                const msg = item.msg;
                const idx = item.idx;
                const prevAssistantEntryId =
                  (msg as import("@/lib/types").AgentMessage).role === "user" && idx > 0 && renderMessages[idx - 1].role === "assistant"
                    ? entryIds[idx - 1]
                    : undefined;
                const hasMinimapRef = msg.role === "user" || msg.role === "assistant";
                const currentRefIdx = hasMinimapRef ? refIdx++ : -1;
                let showTimestamp = msg.role === "custom";
                if (msg.role === "assistant") {
                  showTimestamp = true;
                  if (showTimestamp && isStreaming && idx === renderMessages.length - 1) {
                    showTimestamp = false;
                  }
                }
                const rawMsg = msg as import("@/lib/types").AgentMessage & { _streamId?: string; timestamp?: number; customType?: string };
                const messageKey = entryIds[idx]
                  ?? rawMsg._streamId
                  ?? `${msg.role}:${rawMsg.customType ?? ""}:${rawMsg.timestamp ?? ""}:${idx}`;
                const view = (
                  <MessageView
                    key={messageKey}
                    message={msg}
                    isStreaming={(msg as import("@/lib/types").AgentMessage & { _streamId?: string })._streamId === currentStreamingMessageId}
                    agentRunning={agentRunning}
                    finalOutputStarted={finalOutputStarted}
                    toolResults={toolResultsMap}
                    entryId={entryIds[idx]}
                    onFork={agentRunning || isNew || (idx === 0 && msg.role === "user") ? undefined : handleFork}
                    forking={forkingEntryId === entryIds[idx]}
                    onNavigate={agentRunning ? undefined : handleNavigate}
                    prevAssistantEntryId={agentRunning ? undefined : prevAssistantEntryId}
                    onEditContent={(content) => chatInputRef?.current?.insertIfEmpty(content)}
                    showTimestamp={showTimestamp}
                    runSteps={msg.role === "assistant" ? item.runSteps : undefined}
                  />
                );
                if (!hasMinimapRef) return view;
                return (
                  <div key={messageKey} ref={(el) => {
                    messageRefs.current[currentRefIdx] = el;
                    if (idx === lastUserIdx) { (lastUserMsgRef as { current: HTMLDivElement | null }).current = el; }
                  }}>
                    {view}
                  </div>
                );
              });
            })()}


            {/* Standalone status line before the first streaming message arrives */}
            {agentRunning && !currentStreamingMessageId && !hasAttachedRunStatusLine && (
              <ThinkingStatusLine
                steps={pendingRunSteps}
                runSteps={pendingRunSteps.length > 0 ? pendingRunSteps : undefined}
                isStreaming={false}
                agentRunning={true}
                finalOutputStarted={false}
              />
            )}
            {agentRunning && renderMessages.some((message) => message.role === "user") && !renderMessages.some((message) => message.role === "assistant") && (
              <div style={{ marginBottom: 12, display: "flex", alignItems: "center" }}>
                <div
                  style={{
                    maxWidth: 420,
                    color: "var(--text-muted)",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  正在整理上下文并准备回应…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} style={{ height: agentRunning ? "min(45vh, 380px)" : 0 }} />
          </div>
        </div>
        <ChatMinimap
          messages={minimapMessages}
          streamingMessage={null}
          scrollContainer={scrollContainerRef}
          messageRefs={messageRefs}
        />
      </div>

      <div className="relative">
        {chatInputElement}
      </div>
      </>
      )}
    </div>
  );
});

export { ChatWindow };
