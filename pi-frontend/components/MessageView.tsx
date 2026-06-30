"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { MarkdownBody } from "./MarkdownBody";
import type {
  AgentMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  AssistantContentBlock,
  TextContent,
  ImageContent,
  ToolCallContent,
  ThinkingContent,
} from "@/lib/types";

interface Props {
  message: AgentMessage;
  isStreaming?: boolean;
  toolResults?: Map<string, ToolResultMessage>;
  modelNames?: Record<string, string>;
  entryId?: string;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  onNavigate?: (entryId: string) => void;
  prevAssistantEntryId?: string;
  onEditContent?: (content: string) => void;
  showTimestamp?: boolean;
  agentRunning?: boolean;
  finalOutputStarted?: boolean;
  runSteps?: Step[];
}

function formatTime(ts?: number): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  return `${date} ${time}`;
}

function stripThinkingTags(text: string): string {
  return String(text || "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  } catch {
    return Promise.reject();
  }
}

export function MessageView({ message, isStreaming, toolResults, entryId, onFork, forking, onNavigate, prevAssistantEntryId, onEditContent, showTimestamp, agentRunning, finalOutputStarted, runSteps }: Props) {
  if (message.role === "user") {
    return <UserMessageView message={message as UserMessage} entryId={entryId} onFork={onFork} forking={forking} onNavigate={onNavigate} prevAssistantEntryId={prevAssistantEntryId} onEditContent={onEditContent} />;
  }
  if (message.role === "assistant") {
    return <AssistantMessageView message={message as AssistantMessage} isStreaming={isStreaming} toolResults={toolResults} showTimestamp={showTimestamp} agentRunning={agentRunning} finalOutputStarted={finalOutputStarted} runSteps={runSteps} />;
  }
  if (message.role === "toolResult") {
    // Rendered inline under its toolCall — skip standalone rendering if paired
    return null;
  }
  if (message.role === "custom") {
    return <CustomMessageView message={message} showTimestamp={showTimestamp} />;
  }
  return null;
}

function UserMessageView({ message, entryId, onFork, forking, onNavigate, prevAssistantEntryId, onEditContent }: {
  message: UserMessage;
  entryId?: string;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  onNavigate?: (entryId: string) => void;
  prevAssistantEntryId?: string;
  onEditContent?: (content: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const content =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((b): b is TextContent => b.type === "text")
          .map((b) => b.text)
          .join("\n");

  const imageBlocks: ImageContent[] =
    typeof message.content === "string"
      ? []
      : message.content.filter((b): b is ImageContent => b.type === "image");

  const time = formatTime(message.timestamp);
  const canFork = !!entryId && !!onFork;
  const canNavigate = !!prevAssistantEntryId && !!onNavigate;

  const copyContent = () => {
    copyText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      style={{ marginBottom: 18, display: "flex", flexDirection: "column", alignItems: "flex-end" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, maxWidth: "min(860px, 92%)" }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--text)",
            wordBreak: "break-word",
          }}
        >
          {imageBlocks.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: content ? 8 : 0 }}>
              {imageBlocks.map((img, i) => {
                // lib/types.ts ImageContent uses {source:{type,data,media_type,url}}
                // pi-ai on-disk format uses flat {data, mimeType} — handle both
                const flat = img as unknown as { data?: string; mimeType?: string };
                const src = img.source
                  ? img.source.type === "base64"
                    ? `data:${img.source.media_type};base64,${img.source.data}`
                    : img.source.url ?? ""
                  : flat.data
                    ? `data:${flat.mimeType};base64,${flat.data}`
                    : "";
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt=""
                    style={{ maxWidth: 240, maxHeight: 240, borderRadius: 6, objectFit: "contain", display: "block", border: "1px solid rgba(59,130,246,0.15)" }}
                  />
                );
              })}
            </div>
          )}
          {content && <MarkdownBody className="markdown-user-message">{content}</MarkdownBody>}
        </div>

      </div>

      {/* Bottom row: action buttons + timestamp */}
      {(time || canFork || canNavigate || true) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          gap: 6, marginTop: 3,
        }}>
          <div style={{
            display: "flex", gap: 3,
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? "auto" : "none",
            transition: "opacity 0.12s",
          }}>
            <button
              onClick={copyContent}
              title="Copy message"
              className="message-meta-button"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 8px", height: 22,
                background: "transparent", border: "1px solid transparent",
                borderRadius: 5,
                color: copied ? "var(--accent)" : "var(--text-dim)",
                cursor: "pointer",
                fontSize: 11, fontWeight: 400,
                whiteSpace: "nowrap",
                transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-dim)"; }}
            >
              {copied ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {(canFork || canNavigate) && (
            <div style={{
              display: "flex", gap: 3,
              opacity: (hovered || forking) ? 1 : 0,
              pointerEvents: (hovered || forking) ? "auto" : "none",
              transition: "opacity 0.12s",
            }}>
              {canNavigate && (
                <button
                  onClick={() => { onNavigate!(prevAssistantEntryId!); onEditContent?.(content); }}
                  title="Edit from here — branches within this session"
                  className="message-meta-button"
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", height: 22,
                    background: "transparent", border: "1px solid transparent",
                    borderRadius: 5,
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    fontSize: 11, fontWeight: 400,
                    whiteSpace: "nowrap",
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 10 20 15 15 20" />
                    <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                  </svg>
                  Edit from here
                </button>
              )}
              {canFork && (
                <button
                  onClick={() => { onFork!(entryId!); }}
                  disabled={forking}
                  title={forking ? "Creating new session…" : "New session — creates an independent copy from here"}
                  className="message-meta-button"
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", height: 22,
                    background: "transparent", border: "1px solid transparent",
                    borderRadius: 5,
                    color: forking ? "var(--accent)" : "var(--text-dim)",
                    cursor: forking ? "not-allowed" : "pointer",
                    fontSize: 11, fontWeight: 400,
                    whiteSpace: "nowrap",
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={(e) => { if (!forking) e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { if (!forking) e.currentTarget.style.color = "var(--text-dim)"; }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  {forking ? "Creating…" : "New session"}
                </button>
              )}
            </div>
          )}
          {time && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{time}</span>}
        </div>
      )}
    </div>
  );
}

function CustomMessageView({ message, showTimestamp }: { message: Extract<AgentMessage, { role: "custom" }>; showTimestamp?: boolean }) {
  if (message.display === false) return null;
  const text = typeof message.content === "string"
    ? stripThinkingTags(message.content)
    : message.content
        .filter((block): block is TextContent => block.type === "text")
        .map((block) => stripThinkingTags(block.text))
        .filter(Boolean)
        .join("\n");
  if (!text) return null;
  const time = showTimestamp ? formatTime(message.timestamp) : null;
  const isProgress = message.customType === "collaboration_progress";
  return (
    <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{ maxWidth: "100%", width: "fit-content", minWidth: 320, borderLeft: isProgress ? "2px solid #f59e0b" : "none", paddingLeft: isProgress ? 10 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: isProgress ? "#f59e0b" : "var(--text)" }}>{isProgress ? "协作进展" : "系统消息"}</span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--text)" }}>
          <MarkdownBody>{text}</MarkdownBody>
        </div>
      </div>
      {time ? <span style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>{time}</span> : null}
    </div>
  );
}

function AssistantMessageView({
  message,
  isStreaming,
  toolResults,
  showTimestamp,
  agentRunning,
  finalOutputStarted,
  runSteps,
}: {
  message: AssistantMessage;
  isStreaming?: boolean;
  toolResults?: Map<string, ToolResultMessage>;
  showTimestamp?: boolean;
  agentRunning?: boolean;
  finalOutputStarted?: boolean;
  runSteps?: Step[];
}) {
  const time = showTimestamp ? formatTime(message.timestamp) : null;
  const blocks = useMemo(() => message.content ?? [], [message.content]);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const resultBlocks = blocks.filter((b): b is TextContent => b.type === "text" && !!stripThinkingTags(b.text));
  const textContent = resultBlocks
    .map((b) => stripThinkingTags(b.text))
    .join("\n");

  // ponytail: ordered execution steps for the new single-node status line
  const orderedSteps = useMemo(() => deriveSteps(blocks, toolResults), [blocks, toolResults]);

  const copyContent = () => {
    copyText(textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // ponytail: removed 300ms setInterval that drove per-message streaming timing & tps.
  // Streaming duration display isn't worth the n×300ms re-render cost.

  return (
    <div
      style={{ marginBottom: 20 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Execution trace — single-node status line, collapsible history.
          Only the last assistant message in the run gets the status line;
          earlier messages skip it so history shows exactly one per agent run. */}
      {((orderedSteps.length > 0 || isStreaming) && runSteps !== undefined) && (
        <ThinkingStatusLine
          steps={orderedSteps}
          runSteps={runSteps}
          isStreaming={!!isStreaming}
          agentRunning={!!agentRunning}
          finalOutputStarted={!!finalOutputStarted}
        />
      )}

      {/* Text blocks — the final summary */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ maxWidth: "100%" }}>
          {resultBlocks.map((block, index) => (
            <TextBlock key={`result-${index}`} block={block} isStreaming={isStreaming} />
          ))}
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginTop: 4,
      }}>
        {textContent && !isStreaming && (
          <button
            onClick={copyContent}
            title="Copy message"
            className="message-meta-button"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 8px", height: 22,
              background: "transparent", border: "1px solid transparent",
              borderRadius: 5,
              color: copied ? "var(--accent)" : "var(--text-dim)",
              cursor: "pointer",
              fontSize: 11, fontWeight: 400,
              whiteSpace: "nowrap",
              opacity: hovered ? 1 : 0,
              pointerEvents: hovered ? "auto" : "none",
              transition: "opacity 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-dim)"; }}
          >
            {copied ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        {time && !isStreaming && (
          <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: "auto" }}>{time}</span>
        )}
      </div>
    </div>
  );
}

function TextBlock({ block, isStreaming }: { block: TextContent; isStreaming?: boolean }) {
  const text = stripThinkingTags(block.text);
  if (!text) return null;
  return <MarkdownBody isStreaming={isStreaming}>{text}</MarkdownBody>;
}

function firstSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  const separators = [".", "!", "?", "。", "！", "？", "\n"];
  let end = -1;
  for (const sep of separators) {
    const idx = t.indexOf(sep);
    if (idx !== -1 && (end === -1 || idx < end)) end = idx;
  }
  const s = end === -1 ? t.slice(0, 100) : t.slice(0, end + 1).trim();
  // ponytail: ignore fragments: too short, only punctuation, or a single word
  if (!s || s.length < 4 || /^[\s\p{P}\p{S}]+$/u.test(s) || (s.length < 12 && !s.includes(" "))) return "";
  return s;
}

// ponytail: some providers stream tool arguments as thinking text before the
// toolCall block arrives; never show paths/json/"no output" in the status line.
function isToolLikeFragment(text: string): boolean {
  const t = text.trim();
  if (t.startsWith("/") || t.startsWith("\\")) return true;
  if (/^[\[{]/.test(t) && /[}\]]$/.test(t)) return true;
  const slashCount = (t.match(/\//g) || []).length;
  const sepCount = (t.match(/[\r\n]/g) || []).length;
  if (slashCount >= 2 && (slashCount > t.split(/\s+/).length || sepCount >= 2)) return true;
  if (/\bno output\b|\bundefined\b|\bnull\b/i.test(t)) return true;
  return false;
}

export interface Step {
  type: "thinking" | "tool_call";
  statusText: string; // shown in the single-node status line while streaming
  summary: string;    // shown in the collapsed history list
  full: string;       // shown when a history entry is expanded
}

export function deriveSteps(
  blocks: AssistantContentBlock[],
  toolResults?: Map<string, ToolResultMessage>
): Step[] {
  const steps: Step[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "thinking") {
      const text = (b as ThinkingContent).thinking.trim();
      if (!text) continue;
      // ponytail: type-based split — thinking blocks preview the first sentence
      const sent = firstSentence(text);
      if (!sent || isToolLikeFragment(text)) continue;
      steps.push({ type: "thinking", statusText: sent, summary: "思考：" + sent, full: text });
    } else if (b.type === "toolCall") {
      const tc = b as ToolCallContent;
      // ponytail: type-based split — tool calls show a fixed label, never input/output
      if (!tc.toolName) continue;
      const result = toolResults?.get(tc.toolCallId);
      const status = result ? (result.isError ? "错误" : "完成") : "执行中";
      steps.push({
        type: "tool_call",
        statusText: "调用工具：" + tc.toolName,
        summary: "工具调用：" + tc.toolName,
        full: `工具：${tc.toolName}\n状态：${status}`,
      });
    }
  }
  return steps;
}

export function ThinkingStatusLine({
  steps,
  runSteps,
  isStreaming,
  agentRunning,
  finalOutputStarted,
}: {
  steps: Step[];
  runSteps?: Step[];
  isStreaming: boolean;
  agentRunning: boolean;
  finalOutputStarted: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openEntries, setOpenEntries] = useState<Set<number>>(new Set());
  const [displayText, setDisplayText] = useState("");
  const [fading, setFading] = useState(false);
  const currentIdRef = useRef<string>("");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedAtRef = useRef<number | null>(null);

  const showStatusLine = isStreaming || (agentRunning && !finalOutputStarted);
  // ponytail: expanded history shows the whole agent-run trace, not just this message
  const historySteps = runSteps ?? steps;

  // ponytail: track duration with a tick counter (avoids setState inside interval causing infinite loops)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!showStatusLine) return;
    startedAtRef.current ??= Date.now();
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [showStatusLine]);
  // ponytail: duration derived from tick counter, stable across renders
  const duration = startedAtRef.current
    ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    : 0;

  // Collapse when the thinking phase ends.
  useEffect(() => {
    if (!showStatusLine) setExpanded(false);
  }, [showStatusLine]);

  // Single-node status text animation: placeholder -> content, same node, opacity transition.
  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    const schedule = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    const animateTo = (text: string, then?: () => void) => {
      setFading(true);
      schedule(() => {
        setDisplayText(text);
        setFading(false);
        then?.();
      }, 180);
    };

    if (!showStatusLine) {
      setDisplayText("");
      currentIdRef.current = "";
      return;
    }

    const currentStep = steps[steps.length - 1] ?? null;
    const currentId = currentStep ? `${steps.length - 1}-${currentStep.type}` : "";

    if (!currentStep) {
      animateTo("思考中…");
      currentIdRef.current = currentId;
      return;
    }

    const placeholder = currentStep.type === "thinking" ? "思考中…" : "调用工具…";
    // ponytail: while a thinking block is still streaming, keep the placeholder so
    // partial first-sentence extraction doesn't flash meaningless fragments.
    // When streaming ends, still use the placeholder to avoid long text overflowing the status line.
    const targetText = currentStep.type === "thinking"
      ? placeholder
      : currentStep.statusText || placeholder;

    if (currentId !== currentIdRef.current) {
      currentIdRef.current = currentId;
      animateTo(placeholder, () => {
        schedule(() => animateTo(targetText), 350);
      });
    } else {
      animateTo(targetText);
    }

    return () => timersRef.current.forEach(clearTimeout);
  }, [steps, showStatusLine]);

  if (!showStatusLine && steps.length === 0) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      {showStatusLine && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            color: "var(--text-muted)",
            lineHeight: 1.5,
            minHeight: 34,
            width: "fit-content",
            maxWidth: "100%",
            padding: "7px 11px",
            borderRadius: 999,
            border: "1px solid rgba(10,132,255,0.18)",
            background: "linear-gradient(90deg, rgba(10,132,255,0.09), color-mix(in srgb, var(--bg) 92%, rgba(10,132,255,0.03)))",
            boxShadow: "0 8px 24px -18px rgba(10,132,255,0.55)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#0a84ff",
              flex: "0 0 auto",
              animation: "thinking-dot-pulse 1.1s ease-in-out infinite",
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0a84ff", flex: "0 0 auto" }}>Running</span>
          <span
            style={{
              transition: "opacity .18s ease",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              opacity: fading ? 0 : 1,
              minWidth: 0,
              flex: "1 1 auto",
            }}
          >
            {displayText}
          </span>
        </div>
      )}

      {!showStatusLine && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="thinking-summary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              width: "100%",
              fontSize: 13,
              padding: "7px 10px",
              margin: "0 -8px",
              borderRadius: 10,
              cursor: "pointer",
              userSelect: "none",
              background: "none",
              border: "none",
              color: "inherit",
              textAlign: "left",
            }}
          >
            <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 800, flex: "0 0 auto" }}>✓</span>
            <span>
              <span style={{ color: "var(--text)", fontWeight: 650 }}>运行步骤</span>
              <span style={{ color: "var(--text-muted)" }}> · {duration}s · {historySteps.length} 步</span>
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                color: "var(--text-muted)",
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform .2s ease",
              }}
            >
              ▸
            </span>
          </button>

          {expanded && (
            <div
              className="thinking-scroll"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "10px 12px 8px 28px",
                fontSize: 12.5,
                color: "var(--text-muted)",
                borderLeft: "1px solid var(--border)",
                marginLeft: 9,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {historySteps.map((step, i) => {
                const isOpen = openEntries.has(i);
                const isTool = step.type === "tool_call";
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenEntries((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        });
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer" }}
                    >
                      <span
                        style={{
                          width: 14,
                          textAlign: "center",
                          fontSize: 11,
                          flex: "0 0 auto",
                          color: isTool ? "#636366" : "#86868b",
                        }}
                      >
                        {isTool ? "⚙" : "◆"}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontFamily: isTool ? "var(--font-mono)" : "inherit",
                          fontSize: isTool ? 12 : 12.5,
                        }}
                      >
                        {step.summary}
                      </span>

                    </div>
                    {isOpen && (
                      <div
                        className="thinking-scroll"
                        style={{
                          fontSize: isTool ? 12 : 12.5,
                          color: "var(--text)",
                          lineHeight: 1.6,
                          background: "var(--bg-subtle)",
                          borderRadius: 8,
                          padding: "8px 10px",
                          margin: "2px 0 6px",
                          whiteSpace: "pre-wrap",
                          maxHeight: 140,
                          overflowY: "auto",
                          fontFamily: isTool ? "var(--font-mono)" : "inherit",
                        }}
                      >
                        {step.full}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
