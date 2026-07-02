"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export function useAudio() {
  const [enabled] = useState<boolean>(true);

  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const playDone = useCallback(() => {
    if (!enabledRef.current) return;
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      const freqs = [523.25, 659.25];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = now + i * 0.18;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.start(t);
        osc.stop(t + 0.45);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch {
      // AudioContext not available
    }
  }, []);

  return { soundEnabled: enabled, playDoneSound: playDone, soundEnabledRef: enabledRef };
}
