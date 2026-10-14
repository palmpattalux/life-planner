"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { TOP_LAYER } from "./constants";
import type { Box, Point } from "./geometry";

type View = { x: number; y: number; scale: number };

// Room kept between a pop-up and the screen's edge, and the thing it's for.
const EDGE = 8;
const GAP = 10;

// A thing's pop-up menu. It stays the same size on screen at any zoom and
// sits beside the thing (`around`, in board units) on whichever side is
// closest to where the mouse or finger was when it opened (`mouse`, on the
// screen), without covering the thing, and always fully on the screen. If no
// side has room it sits by the mouse instead, still fully on the screen.
export function Popup({
  around,
  mouse,
  view,
  origin = { x: 0, y: 0 },
  children,
  ...rest
}: {
  around: Box;
  mouse: Point | null;
  view: View;
  // Where the box this is placed in starts on the board (when inside a
  // positioned element).
  origin?: Point;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Where the mouse was when it opened, on the board, so the pop-up stays put
  // relative to the board when moving around or zooming.
  const [pressed] = useState<Point | null>(() =>
    mouse ? { x: (mouse.x - view.x) / view.scale, y: (mouse.y - view.y) / view.scale } : null,
  );

  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = view.scale;
  const toScreen = (p: Point) => ({ x: view.x + p.x * s, y: view.y + p.y * s });
  const a = toScreen({ x: around.minX, y: around.minY });
  const b = toScreen({ x: around.maxX, y: around.maxY });
  const m = pressed ? toScreen(pressed) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let at = { x: b.x + GAP, y: a.y };
  if (size) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const { w, h } = size;
    const clampX = (x: number) => Math.min(Math.max(x, EDGE), W - w - EDGE);
    const clampY = (y: number) => Math.min(Math.max(y, EDGE), H - h - EDGE);
    const fits = (p: Point) => p.x >= EDGE && p.y >= EDGE && p.x + w <= W - EDGE && p.y + h <= H - EDGE;
    // Beside the thing, level with the mouse along that side.
    const sides = [
      { x: b.x + GAP, y: clampY(m.y - 16) },
      { x: a.x - GAP - w, y: clampY(m.y - 16) },
      { x: clampX(m.x - w / 2), y: b.y + GAP },
      { x: clampX(m.x - w / 2), y: a.y - GAP - h },
    ].filter(fits);
    // How far the mouse is from a pop-up placed at p.
    const far = (p: Point) => Math.hypot(Math.max(p.x - m.x, 0, m.x - p.x - w), Math.max(p.y - m.y, 0, m.y - p.y - h));
    at = sides.sort((p, q) => far(p) - far(q))[0] ?? { x: clampX(m.x + 16), y: clampY(m.y + 16) };
  }
  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      {...rest}
      className={`absolute origin-top-left ${rest.className ?? ""}`}
      style={{
        left: (at.x - view.x) / s - origin.x,
        top: (at.y - view.y) / s - origin.y,
        transform: `scale(${1 / s})`,
        zIndex: TOP_LAYER,
        visibility: size ? undefined : "hidden",
        ...rest.style,
      }}
    >
      {children}
    </div>
  );
}
