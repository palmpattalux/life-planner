"use client";

import { useEffect, useId, useRef, useState } from "react";

// A small random number generator that gives the same numbers for the same
// seed, so each board's scrap of paper keeps its own torn edge.
function random(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// The torn edge: along the bottom from the right, round the corner and up the
// left side. A slow wave plus fine fibres, like paper ripped by hand. Each
// point comes with the direction pointing into the paper.
function tornEdge(w: number, h: number, rand: () => number) {
  const pts: { x: number; y: number; nx: number; ny: number }[] = [];
  const r = Math.min(14, h / 2, w / 4);
  const waveA = rand() * 6;
  const waveB = rand() * 6;
  const wave = (s: number) => 2.2 * Math.sin(s / 23 + waveA) + 1.3 * Math.sin(s / 9 + waveB);
  let s = 0;
  // Bottom edge, right to left.
  for (let x = w; x > r; x -= 1.5 + rand() * 1.5, s += 2) {
    pts.push({ x, y: h - 4 + wave(s) + (rand() - 0.5) * 1.6, nx: 0, ny: -1 });
  }
  // The corner.
  for (let a = 0; a <= 1; a += 0.12, s += 2) {
    const t = (a * Math.PI) / 2;
    const nx = Math.sin(t);
    const ny = -Math.cos(t);
    pts.push({ x: r - nx * (r - 4) + wave(s) * 0.5, y: h - r - ny * (r - 4) + wave(s) * 0.5, nx, ny });
  }
  // Left edge, bottom to top.
  for (let y = h - r; y > 0; y -= 1.5 + rand() * 1.5, s += 2) {
    pts.push({ x: 4 + wave(s) + (rand() - 0.5) * 1.6, y, nx: 1, ny: 0 });
  }
  pts.push({ x: 4 + wave(s), y: 0, nx: 1, ny: 0 });
  return pts;
}

// A scrap of torn paper in the top right corner of a box, with `children`
// (the board's name) written on it. Its top and right edges are the box's
// own; the bottom and left are torn, with the paler fibres of the rip
// showing, a soft shadow underneath and a faint paper grain.
export function TornPaper({ seed, children }: { seed: string; children: React.ReactNode }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current!;
    const observer = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { w, h } = size;
  let rim = "";
  let face = "";
  if (w > 0 && h > 0) {
    const rand = random(seed);
    const edge = tornEdge(w, h, rand);
    const path = (pts: { x: number; y: number }[]) =>
      `M0,0 L${w},0 L${w},${h} ` + pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
    // The rim is the rough, paler torn fibres; the face sits a little inside it.
    rim = path(edge.map((p) => ({ x: p.x - p.nx * rand() * 1.2, y: p.y - p.ny * rand() * 1.2 })));
    face = path(edge.map((p) => ({ x: p.x + p.nx * (1.4 + rand() * 1.6), y: p.y + p.ny * (1.4 + rand() * 1.6) })));
  }

  return (
    <span ref={ref} data-project-title className="absolute right-0 top-0 block max-w-[75%] pb-5 pl-6 pr-3 pt-2">
      {w > 0 && (
        <svg className="absolute inset-0 overflow-visible" width={w} height={h} aria-hidden>
          <defs>
            <filter id={`shadow-${id}`} x="-20%" y="-20%" width="140%" height="160%">
              <feGaussianBlur stdDeviation="1.6" />
            </filter>
            <filter id={`grain-${id}`}>
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
              <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.28  0 0 0 0.09 0" />
              <feComposite in2="SourceGraphic" operator="in" />
            </filter>
          </defs>
          <path d={rim} fill="rgb(0 0 0 / 0.22)" transform="translate(0.8 1.6)" filter={`url(#shadow-${id})`} />
          <path d={rim} fill="#fbf8f1" />
          <path d={face} fill="#efe7d6" />
          <path d={face} fill="#efe7d6" filter={`url(#grain-${id})`} />
        </svg>
      )}
      <span className="relative block truncate text-sm font-medium text-stone-800">{children}</span>
    </span>
  );
}
