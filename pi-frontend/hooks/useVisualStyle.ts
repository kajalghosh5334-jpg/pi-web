"use client";

import { useCallback, useSyncExternalStore } from "react";

export type VisualStyle = "codex" | "paper" | "signal";

export const VISUAL_STYLE_OPTIONS: Array<{ id: VisualStyle; label: string }> = [
  { id: "codex", label: "Codex" },
  { id: "paper", label: "Paper" },
  { id: "signal", label: "Signal" },
];

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): VisualStyle {
  if (typeof document === "undefined") return "codex";
  const style = document.documentElement.dataset.uiStyle;
  if (style === "paper" || style === "signal" || style === "codex") return style;
  return "codex";
}

function getServerSnapshot(): VisualStyle {
  return "codex";
}

export function useVisualStyle() {
  const visualStyle = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setVisualStyle = useCallback((next: VisualStyle) => {
    document.documentElement.dataset.uiStyle = next;
    try {
      localStorage.setItem("pi-ui-style", next);
    } catch {
      // ignore storage errors
    }
    listeners.forEach((cb) => cb());
  }, []);

  return { visualStyle, setVisualStyle, visualStyleOptions: VISUAL_STYLE_OPTIONS };
}
