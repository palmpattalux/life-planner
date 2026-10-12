"use client";

import { useEffect } from "react";

// A soft tap sound when the mouse moves onto something that pops on hover
// (marked `data-pop`), made on the spot with the Web Audio API (no sound
// files). Browsers only allow sound once the page has been clicked or typed
// in, so it starts after the first click.
export function useHoverTap() {
  useEffect(() => {
    let ctx: AudioContext | null = null;
    let last: Element | null = null;
    let lastAt = 0;

    function unlock() {
      ctx ??= new AudioContext();
      void ctx.resume();
    }

    function tap() {
      if (!ctx || ctx.state !== "running") return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      // A short, soft knock: a quick high note that drops and fades away.
      osc.frequency.setValueAtTime(1500, t);
      osc.frequency.exponentialRampToValueAtTime(700, t + 0.04);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    }

    function onOver(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as Element).closest?.("[data-pop]") ?? null;
      if (el === last) return;
      last = el;
      // Not a rattle when sweeping quickly across several.
      if (!el || performance.now() - lastAt < 60) return;
      lastAt = performance.now();
      tap();
    }

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      void ctx?.close();
    };
  }, []);
}
