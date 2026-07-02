"use client";

import React, { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef, KeyboardEvent } from "react";
import type { CompactResultInfo } from "@/hooks/useAgentSession";

export interface AttachedImage {
  data: string;   // base64, no prefix
  mimeType: string;
  previewUrl: string; // object URL for display
}

interface ModelOption {
  provider: string;
  modelId: string;
  name: string;
}

interface Props {
  onSend: (message: string, images?: AttachedImage[]) => void;
  onAbort: () => void;
  onSteer?: (message: string, images?: AttachedImage[]) => void;
  onFollowUp?: (message: string, images?: AttachedImage[]) => void;
  isStreaming: boolean;
  model?: { provider: string; modelId: string } | null;
  isAutoModelSelection?: boolean;
  modelNames?: Record<string, string>;
  modelList?: { id: string; name: string; provider: string }[];
  onModelChange?: (provider: string, modelId: string) => void;
  isCompacting?: boolean;
  compactResult?: CompactResultInfo | null;
  thinkingLevel?: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  onThinkingLevelChange?: (level: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh") => void;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
  retryInfo?: { attempt: number; maxAttempts: number; errorMessage?: string } | null;
  placeholder?: string;
  accessory?: React.ReactNode;
}

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (text: string) => void;
  addImages: (files: File[]) => void;
}

const COMPOSITION_END_ENTER_GRACE_MS = 100;
const MODEL_OPTION_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareModelOptions(a: ModelOption, b: ModelOption): number {
  return MODEL_OPTION_COLLATOR.compare(a.name || a.modelId, b.name || b.modelId)
    || MODEL_OPTION_COLLATOR.compare(a.provider, b.provider)
    || MODEL_OPTION_COLLATOR.compare(a.modelId, b.modelId);
}

function modelOptionFromNameEntry(entryKey: string, name: string, fallbackProvider = "unknown"): ModelOption {
  const separator = entryKey.indexOf(":");
  if (separator > 0) {
    return {
      provider: entryKey.slice(0, separator),
      modelId: entryKey.slice(separator + 1),
      name,
    };
  }
  return { provider: fallbackProvider, modelId: entryKey, name };
}

const THINKING_LEVELS = ["auto", "off", "minimal", "low", "medium", "high", "xhigh"] as const;
const THINKING_LEVEL_DESC: Record<typeof THINKING_LEVELS[number], string> = {
  auto: "Auto (pi default)",
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Maximum",
};
const THINKING_LEVEL_LABEL: Record<typeof THINKING_LEVELS[number], string> = {
  auto: "自动",
  off: "关",
  minimal: "极简",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "超高",
};

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return tokens.toLocaleString();
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({
  onSend, onAbort, onSteer, onFollowUp, isStreaming, model, isAutoModelSelection, modelNames, modelList, onModelChange,
  isCompacting, compactResult,
  thinkingLevel, onThinkingLevelChange, availableThinkingLevels, thinkingLevelMap,
  retryInfo,
  placeholder,
  accessory,
}: Props, ref) {
  const [value, setValue] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSubmenuOpen, setModelSubmenuOpen] = useState(false);
  const [modeButtonHovered, setModeButtonHovered] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastCompositionEndAtRef = useRef(0);

  useImperativeHandle(ref, () => ({
    insertIfEmpty(text: string) {
      const ta = textareaRef.current;
      const current = ta ? ta.value : value;
      if (current.trim()) return;
      setValue(text);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    insertText(text: string) {
      const ta = textareaRef.current;
      if (!ta) {
        setValue((v) => v + (v ? " " : "") + text);
        return;
      }
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      const sep = before.length > 0 && !before.endsWith(" ") ? " " : "";
      const newVal = before + sep + text + after;
      setValue(newVal);
      requestAnimationFrame(() => {
        if (!ta) return;
        const pos = start + sep.length + text.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    addImages(files: File[]) {
      processImageFiles(files);
    },
  }));

  const processImageFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;
    const newImages = await Promise.all(
      imageFiles.map(
        (file) =>
          new Promise<AttachedImage>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              // result is "data:<mime>;base64,<data>"
              const base64 = result.split(",")[1];
              resolve({ data: base64, mimeType: file.type, previewUrl: URL.createObjectURL(file) });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
    setAttachedImages((prev) => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  }, []);

  const clearImages = useCallback(() => {
    setAttachedImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
  }, []);

  const handleSend = useCallback(() => {
    const msg = value.trim();
    if (!msg && !attachedImages.length) return;
    if (isStreaming) return;
    onSend(msg, attachedImages.length ? attachedImages : undefined);
    setValue("");
    clearImages();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachedImages, isStreaming, onSend, clearImages]);

  const sendQueued = useCallback((mode: "steer" | "followup") => {
    const msg = value.trim();
    if (!msg && !attachedImages.length) return;
    if (mode === "steer" && onSteer) {
      onSteer(msg, attachedImages.length ? attachedImages : undefined);
    } else if (mode === "followup" && onFollowUp) {
      onFollowUp(msg, attachedImages.length ? attachedImages : undefined);
    }
    setValue("");
    clearImages();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [value, attachedImages, onSteer, onFollowUp, clearImages]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const nativeEvent = e.nativeEvent;
      const recentlyComposed = Date.now() - lastCompositionEndAtRef.current < COMPOSITION_END_ENTER_GRACE_MS;
      const isComposing =
        isComposingRef.current ||
        nativeEvent.isComposing ||
        nativeEvent.keyCode === 229;

      if (e.key === "Enter" && !e.shiftKey && (isComposing || recentlyComposed)) {
        if (recentlyComposed) e.preventDefault();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming && (onSteer || onFollowUp)) {
          // Default Enter sends as steer if available, else followup
          sendQueued(onSteer ? "steer" : "followup");
        } else {
          handleSend();
        }
      }
    },
    [isStreaming, onSteer, onFollowUp, sendQueued, handleSend]
  );

  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  const insertDroppedText = useCallback((text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    setValue((v) => {
      const sep = v && !v.endsWith(" ") && !v.endsWith("\n") ? " " : "";
      return `${v}${sep}${cleaned}`;
    });
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    });
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null);
    processImageFiles(files);
  }, [processImageFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length) processImageFiles(imageFiles);
      const pathTexts = files
        .map((f) => (f as File & { path?: string }).path || (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
        .filter(Boolean)
        .map((p) => `\`${p}\``);
      if (pathTexts.length) insertDroppedText(pathTexts.join(" "));
      return;
    }

    const uriList = e.dataTransfer.getData("text/uri-list");
    const plain = e.dataTransfer.getData("text/plain");
    insertDroppedText(uriList || plain);
  }, [insertDroppedText, processImageFiles]);



  // Build model options: `modelList` is treated as already connected / validated; `modelNames` extras are hidden by default.
  const availableModelOptions: ModelOption[] = (() => {
    if (modelList && modelList.length > 0) {
      return modelList.map((m) => ({ provider: m.provider, modelId: m.id, name: m.name })).sort(compareModelOptions);
    }
    return Object.entries(modelNames ?? {})
      .map(([modelKey, name]) => modelOptionFromNameEntry(modelKey, name, model?.provider ?? "unknown"))
      .sort(compareModelOptions);
  })() ?? [];

  const hiddenModelOptions: ModelOption[] = (() => {
    if (!modelList || modelList.length === 0) return [];
    const known = new Set(modelList.map((m) => `${m.provider}:${m.id}`));
    return Object.entries(modelNames ?? {})
      .map(([modelKey, name]) => modelOptionFromNameEntry(modelKey, name, model?.provider ?? "unknown"))
      .filter((opt) => !known.has(`${opt.provider}:${opt.modelId}`))
      .sort(compareModelOptions);
  })();

  const visibleModelOptions = [...availableModelOptions, ...hiddenModelOptions];

  const visibleModelsByProvider: { provider: string; options: ModelOption[] }[] = [];
  for (const opt of visibleModelOptions) {
    const group = visibleModelsByProvider.find((g) => g.provider === opt.provider);
    if (group) group.options.push(opt);
    else visibleModelsByProvider.push({ provider: opt.provider, options: [opt] });
  }

  const allModelOptions = [...availableModelOptions, ...hiddenModelOptions];
  const displayModelName = model
    ? (allModelOptions.find((o) => o.modelId === model.modelId && o.provider === model.provider)?.name ?? model.modelId)
    : null;
  const currentName = displayModelName;
  const currentThinkingLevel = thinkingLevel ?? "auto";
  const currentThinkingLabel = (() => {
    if (currentThinkingLevel !== "auto" && thinkingLevelMap) {
      const mapped = thinkingLevelMap[currentThinkingLevel];
      if (mapped) return mapped;
    }
    return THINKING_LEVEL_LABEL[currentThinkingLevel];
  })();
  const hasModelMenu = availableModelOptions.length > 0 && currentName && onModelChange;
  const hasModeControls = !isStreaming && (hasModelMenu || onThinkingLevelChange);
  const canSend = value.trim().length > 0 || attachedImages.length > 0;

  const compactSavedTokens = compactResult
    ? Math.max(0, compactResult.tokensBefore - compactResult.estimatedTokensAfter)
    : 0;
  const compactVerb = compactResult?.reason && compactResult.reason !== "manual"
    ? `${compactResult.reason[0].toUpperCase()}${compactResult.reason.slice(1)} compacted`
    : "Compacted";
  const compactResultText = compactResult
    ? `${compactVerb} ${formatTokenCount(compactResult.tokensBefore)} -> ${formatTokenCount(compactResult.estimatedTokensAfter)} tokens (${formatTokenCount(compactSavedTokens)} saved)`
    : null;

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
        setModelSubmenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);



  return (
    <div
      style={{
        flexShrink: 0,
        background: "transparent",
        padding: "4px 4px 3px",
        paddingRight: 52, // 16px base + 36px for ChatMinimap alignment
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        {accessory && (
          <div style={{
            marginBottom: 0,
            padding: "11px 16px 9px",
            background: "linear-gradient(180deg, color-mix(in srgb, var(--bg) 94%, rgba(10,132,255,0.08)) 0%, color-mix(in srgb, var(--bg) 96%, var(--bg-panel)) 100%)",
            border: "1px solid color-mix(in srgb, var(--shell-edge) 80%, rgba(10,132,255,0.28))",
            borderBottom: "none",
            borderRadius: "26px 26px 0 0",
            boxShadow: "var(--shell-shadow-sm)",
          }}>
            {accessory}
          </div>
        )}
        {/* Retry banner */}
        {retryInfo && (
          <div style={{
            marginBottom: 8, padding: "5px 10px",
            background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)",
            borderRadius: 6, fontSize: 12, color: "rgba(180,130,0,0.9)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Retrying ({retryInfo.attempt}/{retryInfo.maxAttempts})…{retryInfo.errorMessage && <span style={{ opacity: 0.7, marginLeft: 4 }}>— {retryInfo.errorMessage}</span>}
          </div>
        )}
        {compactResultText && (
          <div style={{
            marginBottom: 8, padding: "5px 10px",
            background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.24)",
            borderRadius: 6, fontSize: 12, color: "rgba(5,150,105,0.95)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {compactResultText}
          </div>
        )}
        {/* Image previews */}
        {attachedImages.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {attachedImages.map((img, i) => (
              <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt=""
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", display: "block" }}
                />
                <button
                  onClick={() => removeImage(i)}
                  style={{
                    position: "absolute", top: -4, right: -4,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "var(--bg-panel)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", padding: 0, color: "var(--text-muted)",
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main input */}
        <div
          onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setIsDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false); }}
          onDrop={handleDrop}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            background: "linear-gradient(180deg, color-mix(in srgb, var(--bg) 96%, transparent) 0%, color-mix(in srgb, var(--bg-panel) 92%, transparent) 100%)",
            border: `1px solid ${isDragOver
              ? "rgba(59,130,246,0.75)"
              : isStreaming && (onSteer || onFollowUp)
                ? "rgba(234,179,8,0.4)"
                : "color-mix(in srgb, var(--shell-edge) 80%, transparent)"}`,
            borderRadius: accessory ? "0 0 26px 26px" : 24,
            padding: "9px 10px 9px 15px",
            boxShadow: isDragOver
              ? "0 0 0 3px rgba(59,130,246,0.12), var(--shell-shadow-md)"
              : "var(--shell-shadow-md)",
            marginTop: accessory ? -1 : 0,
            position: "relative",
            transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
          } as React.CSSProperties}
        >
          {isDragOver && (
            <div style={{ position: "absolute", inset: 4, borderRadius: 10, background: "rgba(59,130,246,0.08)", color: "#3b82f6", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 2 }}>
              Drop to insert file path; images attach as well
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
              lastCompositionEndAtRef.current = Date.now();
            }}
            onInput={handleInput}
            onPaste={handlePaste}
            placeholder={
              isStreaming && (onSteer || onFollowUp)
                ? "Steer (inject now) / Follow-up (queue)"
                : isStreaming ? "Agent is running…"
                : placeholder || "Message…"
            }
            rows={1}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              resize: "none",
              color: "var(--text)",
              fontSize: 14,
              lineHeight: 1.6,
              fontFamily: "inherit",
              minHeight: 24,
              maxHeight: 200,
              overflow: "auto",
            }}
          />

          {isStreaming ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, alignSelf: "flex-end" }}>
              {onSteer && (
                <button
                  onClick={() => sendQueued("steer")}
                  disabled={!value.trim() && !attachedImages.length}
                  title="Interrupt agent and inject message now"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "7px 12px",
                    background: (value.trim() || attachedImages.length) ? "rgba(234,179,8,0.12)" : "none",
                    border: "1px solid rgba(234,179,8,0.35)",
                    borderRadius: 8,
                    color: (value.trim() || attachedImages.length) ? "rgba(180,130,0,1)" : "var(--text-dim)",
                    cursor: (value.trim() || attachedImages.length) ? "pointer" : "not-allowed",
                    fontSize: 13, fontWeight: 600, letterSpacing: 0,
                    transition: "background 0.12s",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 1 L9 5 L5 9" /><line x1="1" y1="5" x2="9" y2="5" />
                  </svg>
                  Steer
                </button>
              )}
              {onFollowUp && (
                <button
                  onClick={() => sendQueued("followup")}
                  disabled={!value.trim() && !attachedImages.length}
                  title="Queue to send after agent finishes"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "7px 12px",
                    background: (value.trim() || attachedImages.length) ? "rgba(129,140,248,0.12)" : "none",
                    border: "1px solid rgba(129,140,248,0.35)",
                    borderRadius: 8,
                    color: (value.trim() || attachedImages.length) ? "rgba(99,102,241,1)" : "var(--text-dim)",
                    cursor: (value.trim() || attachedImages.length) ? "pointer" : "not-allowed",
                    fontSize: 13, fontWeight: 600, letterSpacing: 0,
                    transition: "background 0.12s",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="1" x2="5" y2="6" /><polyline points="2.5 3.5 5 1 7.5 3.5" />
                    <line x1="2" y1="9" x2="8" y2="9" />
                  </svg>
                  Follow-up
                </button>
              )}
              <button
                onClick={onAbort}
                title="Stop agent"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 12px",
                  minHeight: 36,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 9,
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: 12, fontWeight: 650,
                  whiteSpace: "nowrap", letterSpacing: 0,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.16)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="currentColor" />
                </svg>
                Stop
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, alignSelf: "flex-end" }}>
              {hasModeControls && (
                <div ref={dropdownRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => {
                      setModelDropdownOpen((v) => !v);
                      setModelSubmenuOpen(false);
                    }}
                    disabled={isCompacting}
                    title={currentName ? `${currentName} / ${currentThinkingLabel}` : "Model and reasoning"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      minHeight: 36,
                      maxWidth: 240,
                      padding: "7px 9px",
                      background: modelDropdownOpen ? "var(--bg-hover)" : "transparent",
                      border: "none",
                      borderRadius: 9,
                      color: "var(--text-muted)",
                      cursor: isCompacting ? "not-allowed" : "pointer",
                      opacity: isCompacting ? 0.55 : 1,
                      fontSize: 13,
                      fontWeight: 520,
                      letterSpacing: 0,
                      transition: "background 0.12s, color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (isCompacting) return;
                      setModeButtonHovered(true);
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      setModeButtonHovered(false);
                      e.currentTarget.style.background = modelDropdownOpen ? "var(--bg-hover)" : "transparent";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    <span style={{ color: "var(--text)", fontWeight: 650, whiteSpace: "nowrap" }}>{currentThinkingLabel}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="3 4.5 6 7.5 9 4.5" />
                    </svg>
                    {modeButtonHovered && currentName && !modelDropdownOpen && (
                      <span style={{
                        position: "absolute",
                        right: 0,
                        bottom: "calc(100% + 8px)",
                        zIndex: 90,
                        maxWidth: 320,
                        padding: "7px 10px",
                        borderRadius: 10,
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        boxShadow: "0 -8px 24px rgba(0,0,0,0.12)",
                        color: "var(--text)",
                        fontSize: 12,
                        fontWeight: 560,
                        lineHeight: 1.35,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        pointerEvents: "none",
                      }}>
                        {currentName}
                      </span>
                    )}
                  </button>
                  {modelDropdownOpen && (
                    <div style={{
                      position: "absolute",
                      bottom: "calc(100% + 8px)",
                      right: 0,
                      zIndex: 120,
                      width: 330,
                      maxWidth: "min(330px, calc(100vw - 32px))",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 18,
                      boxShadow: "0 -12px 36px rgba(0,0,0,0.14)",
                      padding: 8,
                    }}>
                      {onThinkingLevelChange && (
                        <>
                          <div style={{ padding: "7px 12px 6px", fontSize: 13, color: "var(--text-dim)", fontWeight: 700 }}>推理</div>
                          {THINKING_LEVELS.filter((lvl) => {
                            if (!availableThinkingLevels) return true;
                            if (lvl === "auto") return true;
                            return availableThinkingLevels.includes(lvl);
                          }).map((lvl) => {
                            const isActive = currentThinkingLevel === lvl;
                            const mappedVal = (lvl !== "auto" && thinkingLevelMap) ? thinkingLevelMap[lvl] : undefined;
                            const displayLabel = mappedVal || THINKING_LEVEL_LABEL[lvl];
                            return (
                              <button
                                key={lvl}
                                onClick={() => {
                                  setModelDropdownOpen(false);
                                  setModelSubmenuOpen(false);
                                  if (!isActive) onThinkingLevelChange(lvl);
                                }}
                                title={THINKING_LEVEL_DESC[lvl]}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  width: "100%",
                                  minHeight: 40,
                                  padding: "8px 12px",
                                  background: isActive ? "var(--bg-selected)" : "transparent",
                                  border: "none",
                                  borderRadius: 10,
                                  color: isActive ? "var(--text)" : "var(--text-muted)",
                                  cursor: "pointer",
                                  fontSize: 14,
                                  textAlign: "left",
                                  fontWeight: isActive ? 680 : 520,
                                  letterSpacing: 0,
                                }}
                                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                              >
                                <span style={{ flex: 1, whiteSpace: "nowrap" }}>{displayLabel}</span>
                                {isActive && <span style={{ fontSize: 18, lineHeight: 1, color: "var(--text)" }}>✓</span>}
                              </button>
                            );
                          })}
                        </>
                      )}
                      {hasModelMenu && (
                        <div style={{ position: "relative", marginTop: onThinkingLevelChange ? 8 : 0, paddingTop: onThinkingLevelChange ? 8 : 0, borderTop: onThinkingLevelChange ? "1px solid var(--border)" : "none" }}>
                          <button
                            onClick={() => setModelSubmenuOpen((v) => !v)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              width: "100%",
                              minHeight: 42,
                              padding: "8px 12px",
                              background: modelSubmenuOpen ? "var(--bg-hover)" : "transparent",
                              border: "none",
                              borderRadius: 10,
                              color: "var(--text)",
                              cursor: "pointer",
                              fontSize: 14,
                              textAlign: "left",
                              letterSpacing: 0,
                            }}
                          >
                            <span style={{ flex: 1, color: "var(--text-muted)", fontWeight: 620 }}>模型</span>
                            <span style={{ maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 520 }}>{currentName}</span>
                            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: modelSubmenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.12s" }}>
                              <polyline points="4.5 3 7.5 6 4.5 9" />
                            </svg>
                          </button>
                          {modelSubmenuOpen && (
                            <div style={{
                              position: "absolute",
                              bottom: -8,
                              right: "calc(100% + 8px)",
                              width: 320,
                              maxWidth: "min(320px, calc(100vw - 32px))",
                              maxHeight: 360,
                              overflowY: "auto",
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 18,
                              boxShadow: "0 -12px 36px rgba(0,0,0,0.14)",
                              padding: 8,
                            }}>
                              <div style={{ padding: "7px 12px 6px", fontSize: 13, color: "var(--text-dim)", fontWeight: 700 }}>模型</div>
                              {visibleModelsByProvider.length > 0 ? visibleModelsByProvider.map((group, gi) => (
                                <div key={group.provider}>
                                  {visibleModelsByProvider.length > 1 && (
                                    <div style={{ padding: gi > 0 ? "9px 12px 4px" : "3px 12px 4px", fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase" }}>{group.provider}</div>
                                  )}
                                  {group.options.map((opt) => {
                                    const isActive = opt.modelId === model?.modelId && opt.provider === model?.provider;
                                    return (
                                      <button
                                        key={`${opt.provider}:${opt.modelId}`}
                                        onClick={() => {
                                          setModelDropdownOpen(false);
                                          setModelSubmenuOpen(false);
                                          if (!isActive || isAutoModelSelection) onModelChange(opt.provider, opt.modelId);
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 10,
                                          width: "100%",
                                          minHeight: 40,
                                          padding: "8px 12px",
                                          background: isActive ? "var(--bg-selected)" : "transparent",
                                          border: "none",
                                          borderRadius: 10,
                                          color: isActive ? "var(--text)" : "var(--text-muted)",
                                          cursor: "pointer",
                                          fontSize: 14,
                                          textAlign: "left",
                                          fontWeight: isActive ? 680 : 520,
                                          letterSpacing: 0,
                                        }}
                                        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                                      >
                                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.name}</span>
                                        {isActive && <span style={{ fontSize: 18, lineHeight: 1, color: "var(--text)" }}>✓</span>}
                                      </button>
                                    );
                                  })}
                                </div>
                              )) : (
                                <div style={{ padding: 12, color: "var(--text-muted)", fontSize: 13 }}>No models available</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={handleSend}
                disabled={isCompacting || !canSend}
                style={{
                  flexShrink: 0,
                  display: "flex", alignItems: "center", gap: 6,
                  minHeight: 36,
                  padding: "7px 10px",
                  background: !isCompacting && canSend ? "var(--text)" : "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: 9,
                  color: !isCompacting && canSend ? "var(--bg)" : "var(--text-dim)",
                  cursor: isCompacting ? "wait" : canSend ? "pointer" : "not-allowed",
                  fontSize: 12,
                  fontWeight: 750,
                  letterSpacing: 0,
                  transition: "background 0.15s, color 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {isCompacting ? (
                  "Compacting…"
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="2" y1="7" x2="11" y2="7" />
                      <polyline points="7.5 3 12 7 7.5 11" />
                    </svg>
                    Send
                  </>
                )}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
});
