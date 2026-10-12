"use client";

import { useEffect } from "react";

// A soft, quiet click when the mouse moves onto something that pops on hover
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
      // A tiny, quiet click: a few milliseconds of filtered noise.
      const len = Math.floor(ctx.sampleRate * 0.012);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 3200;
      filter.Q.value = 1.2;
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(t);
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
