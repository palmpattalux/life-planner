"use client";

import { useEffect, useRef, useState } from "react";

type Circle = { id: number; x: number; y: number };
type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type Line = { id: number; from: Point; to: Point };

const SIZE = 64;
// Moving less than this many pixels between press and release counts as a click.
const CLICK_SLOP = 4;

// The board itself, in board units. Circles live inside it.
const BOARD_W = 10000;
const BOARD_H = 10000;
const DOT_SPACING = 24;
const MIN_SCALE = 0.06;
const MAX_SCALE = 4;

// Browsers don't say whether a wheel event came from a mouse or a trackpad.
// Trackpads send pixel deltas that are small, fractional or sideways; mouse
// wheels send big whole-number steps straight up or down.
function isTrackpadSwipe(e: WheelEvent) {
  if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
  if (e.deltaX !== 0) return true;
  return !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50;
}

// A huge white board with faint grey dots and a light grey edge.
// Two-finger swipe moves around; pinch or mouse wheel zooms. Press "b" to add a circle at the cursor.
// Hold "n" to draw a line from the cursor; let go to confirm it.
// Drag a circle or line to move it. Click a circle to open its menu; click a
// line to show dots on its ends, which can be dragged to move each end.
export function Board() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  // The line being drawn while N is held: starts where N was pressed,
  // ends at the cursor.
  const [draft, setDraft] = useState<{ from: Point; to: Point } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const rootRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  // What is being dragged: a circle, a whole line, or one end of a line.
  const drag = useRef<{
    kind: "circle" | "line" | "from" | "to";
    id: number;
    start: Point; // board position where the drag began
    orig: Circle | Line; // the item as it was when the drag began
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const nextId = useRef(1);

  // Screen position -> board position.
  function toBoard(sx: number, sy: number) {
    const v = viewRef.current;
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
  }

  // Start with the middle of the board in the middle of the screen.
  useEffect(() => {
    setView({
      x: window.innerWidth / 2 - BOARD_W / 2,
      y: window.innerHeight / 2 - BOARD_H / 2,
      scale: 1,
    });
  }, []);

  // Trackpad: two-finger swipe moves around, pinch zooms (pinch arrives as a
  // wheel event with ctrlKey). Mouse scroll wheel zooms.
  useEffect(() => {
    const el = rootRef.current!;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (!e.ctrlKey && isTrackpadSwipe(e)) {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
        return;
      }
      const speed = e.ctrlKey ? 0.01 : 0.0015;
      setView((v) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * Math.exp(-e.deltaY * speed)));
        const k = scale / v.scale;
        return {
          scale,
          x: e.clientX - (e.clientX - v.x) * k,
          y: e.clientY - (e.clientY - v.y) * k,
        };
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    function cursorOnBoard() {
      const screen = pointer.current ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      return toBoard(screen.x, screen.y);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "b") {
        const at = cursorOnBoard();
        setCircles((cs) => [...cs, { id: nextId.current++, x: at.x, y: at.y }]);
      } else if (key === "n" && !draftRef.current) {
        const at = cursorOnBoard();
        setDraft({ from: at, to: at });
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n") return;
      const d = draftRef.current;
      if (!d) return;
      setDraft(null);
      // Pressing and releasing N without moving doesn't leave a dot behind.
      if (Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) * viewRef.current.scale < CLICK_SLOP) return;
      setLines((ls) => [...ls, { id: nextId.current++, from: d.from, to: d.to }]);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  function onPointerMove(e: React.PointerEvent) {
    pointer.current = { x: e.clientX, y: e.clientY };
    if (draftRef.current) {
      const to = toBoard(e.clientX, e.clientY);
      setDraft((dr) => (dr ? { ...dr, to } : dr));
    }
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < CLICK_SLOP) return;
    d.moved = true;
    const at = toBoard(e.clientX, e.clientY);
    const dx = at.x - d.start.x;
    const dy = at.y - d.start.y;
    if (d.kind === "circle") {
      const o = d.orig as Circle;
      setCircles((cs) => cs.map((c) => (c.id === d.id ? { ...c, x: o.x + dx, y: o.y + dy } : c)));
      return;
    }
    const o = d.orig as Line;
    const move = (pt: Point) => ({ x: pt.x + dx, y: pt.y + dy });
    const next: Line =
      d.kind === "line"
        ? { ...o, from: move(o.from), to: move(o.to) }
        : d.kind === "from"
          ? { ...o, from: move(o.from) }
          : { ...o, to: move(o.to) };
    setLines((ls) => ls.map((l) => (l.id === d.id ? next : l)));
  }

  function startDrag(e: React.PointerEvent, kind: "circle" | "line" | "from" | "to", item: Circle | Line) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      kind,
      id: item.id,
      start: toBoard(e.clientX, e.clientY),
      orig: item,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    if (kind !== "circle") setMenuFor(null);
    if (kind === "circle") setSelectedLine(null);
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // A click without moving: circles toggle their menu, lines show their end dots.
    if (d.kind === "circle") setMenuFor((open) => (open === d.id ? null : d.id));
    if (d.kind === "line") setSelectedLine(d.id);
  }

  const menuCircle = circles.find((c) => c.id === menuFor);
  // Fade the dots out when zoomed far out so they don't turn into a grey haze.
  const dotAlpha = 0.12 * Math.min(1, Math.max(0, (view.scale - 0.2) / 0.3));

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 touch-none select-none overflow-hidden bg-white"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      // Clicking empty board closes the menu and hides a line's end dots.
      onPointerDown={() => {
        setMenuFor(null);
        setSelectedLine(null);
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <div
          data-board
          className="absolute left-0 top-0"
          style={{
            width: BOARD_W,
            height: BOARD_H,
            // Keep the edge line about 1 screen pixel at any zoom.
            boxShadow: `0 0 0 ${1 / view.scale}px rgb(0 0 0 / 0.12)`,
            backgroundImage: `radial-gradient(circle, rgb(0 0 0 / ${dotAlpha}) 1px, transparent 1.2px)`,
            backgroundSize: `${DOT_SPACING}px ${DOT_SPACING}px`,
          }}
        />

        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={BOARD_W}
          height={BOARD_H}
        >
          {lines.map((l) => (
            <g key={l.id}>
              <line
                data-line="line"
                x1={l.from.x}
                y1={l.from.y}
                x2={l.to.x}
                y2={l.to.y}
                stroke="#1c1917"
                strokeWidth={2}
                strokeLinecap="round"
              />
              {/* Wider invisible stroke so the line is easy to grab. */}
              <line
                data-line-hit={l.id}
                x1={l.from.x}
                y1={l.from.y}
                x2={l.to.x}
                y2={l.to.y}
                stroke="transparent"
                strokeWidth={14 / view.scale}
                className="cursor-grab active:cursor-grabbing"
                style={{ pointerEvents: "stroke" }}
                onPointerDown={(e) => startDrag(e, "line", l)}
              />
              {selectedLine === l.id &&
                (["from", "to"] as const).map((end) => (
                  <circle
                    key={end}
                    data-line-end={end}
                    cx={l[end].x}
                    cy={l[end].y}
                    r={6 / view.scale}
                    fill="white"
                    stroke="#1c1917"
                    strokeWidth={1.5 / view.scale}
                    className="pointer-events-auto cursor-move"
                    onPointerDown={(e) => startDrag(e, end, l)}
                  />
                ))}
            </g>
          ))}
          {draft && (
            <line
              data-line="draft"
              x1={draft.from.x}
              y1={draft.from.y}
              x2={draft.to.x}
              y2={draft.to.y}
              stroke="#1c1917"
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}
        </svg>

        {circles.map((c) => (
          <div
            key={c.id}
            onPointerDown={(e) => startDrag(e, "circle", c)}
            className="absolute cursor-grab rounded-full border-2 border-stone-900 bg-white active:cursor-grabbing"
            style={{ width: SIZE, height: SIZE, left: c.x - SIZE / 2, top: c.y - SIZE / 2 }}
          />
        ))}

        {menuCircle && (
          <div
            data-menu
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute min-h-24 w-40 rounded-lg border border-stone-200 bg-white shadow-lg"
            style={{ left: menuCircle.x + SIZE / 2 + 8, top: menuCircle.y - SIZE / 2 }}
          />
        )}
      </div>
    </div>
  );
}
