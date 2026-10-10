"use client";

import { useEffect, useRef, useState } from "react";
import { LineMenu } from "./LineMenu";
import { timelineTicks, type Timeline } from "./timeline";

type Point = { x: number; y: number };
type View = { x: number; y: number; scale: number };
type Circle = { id: number; x: number; y: number; size: number };
type Text = {
  id: number;
  x: number; // centre
  y: number;
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
};
// A line end is either a free point or attached to a circle or text
// (fromItem / toItem), in which case it sits at that item's centre and
// follows it.
// A line with `time` is drawn as a timeline: a ruler of evenly spaced dates.
type Line = {
  id: number;
  from: Point;
  to: Point;
  fromItem?: number;
  toItem?: number;
  time?: Timeline;
};
type End = "from" | "to";
type Selected = { kind: "circle" | "text"; id: number };
type DragKind = "circle" | "text" | "line" | End;

const CIRCLE_SIZE = 64;
const MIN_CIRCLE = 8;
const MAX_CIRCLE = 2000;
const TEXT_SIZE = 24;
const MIN_TEXT = 6;
const MAX_TEXT = 800;
const TEXT_COLORS = ["#1c1917", "#78716c", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#9333ea"];
// Moving less than this many pixels between press and release counts as a click.
const CLICK_SLOP = 4;

// The board itself, in board units. Everything lives inside it.
const BOARD_W = 10000;
const BOARD_H = 10000;
const DOT_SPACING = 24;
const MIN_SCALE = 0.06;
const MAX_SCALE = 4;
// Timeline ruler sizes, in board units.
const TICK = 6;
const MAJOR_TICK = 10;
const TICK_LABEL_SIZE = 11;
const TICK_LABEL_GAP = 56; // roughly the width of one label
// How close (in screen pixels, beyond the circle's edge) a dragged line end
// has to be to a circle to attach to it.
const ATTACH_DISTANCE = 16;

// Browsers don't say whether a wheel event came from a mouse or a trackpad.
// Trackpads send pixel deltas that are small, fractional or sideways; mouse
// wheels send big whole-number steps straight up or down.
function isTrackpadSwipe(e: WheelEvent) {
  if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
  if (e.deltaX !== 0) return true;
  return !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// A huge white board with faint grey dots and a light grey edge.
// - Two-finger swipe moves around; pinch or mouse wheel zooms.
// - "b" adds a circle at the cursor. Hold "n" to draw a line; let go to confirm.
// - Drag circles, texts and lines to move them.
// - Click a circle or text to select it and open its menu. While selected, the
//   scroll wheel / trackpad resizes it instead of moving the board.
// - The circle menu's "Text" turns the circle into text, ready to type. Enter or
//   clicking elsewhere confirms. Double-click text to edit it again.
// - Click a line to show dots on its ends; drag them to move each end. Drop an
//   end near a circle and it attaches, following it when it moves. The line's
//   menu has "Time", which turns it into a timeline (see LineMenu).
export function Board() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [texts, setTexts] = useState<Text[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  // Which text is showing its px size label while being resized.
  const [sizeShownFor, setSizeShownFor] = useState<number | null>(null);
  const sizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The line being drawn while N is held: starts where N was pressed,
  // ends at the cursor.
  const [draft, setDraft] = useState<{ from: Point; to: Point } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });

  // Event listeners set up once read the latest values through refs.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const viewRef = useRef(view);
  viewRef.current = view;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const rootRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<Point | null>(null);
  // What is being dragged and how it was when the drag began.
  const drag = useRef<{
    kind: DragKind;
    id: number;
    start: Point; // board position where the drag began
    orig: Point | Line; // item centre, or the line with ends resolved
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const nextId = useRef(1);

  // Screen position -> board position.
  function toBoard(sx: number, sy: number): Point {
    const v = viewRef.current;
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
  }

  function itemPos(id: number | undefined): Point | undefined {
    const item = circles.find((c) => c.id === id) ?? texts.find((t) => t.id === id);
    return item && { x: item.x, y: item.y };
  }

  // The line with attached ends moved to their items' centres.
  function resolve(l: Line): Line {
    return { ...l, from: itemPos(l.fromItem) ?? l.from, to: itemPos(l.toItem) ?? l.to };
  }

  // Start with the middle of the board in the middle of the screen.
  useEffect(() => {
    setView({
      x: window.innerWidth / 2 - BOARD_W / 2,
      y: window.innerHeight / 2 - BOARD_H / 2,
      scale: 1,
    });
  }, []);

  // Scroll wheel / trackpad. With a circle or text selected it resizes that
  // item. Otherwise: two-finger swipe moves around, pinch zooms (pinch arrives
  // as a wheel event with ctrlKey), mouse wheel zooms.
  useEffect(() => {
    const el = rootRef.current!;
    function onWheel(e: WheelEvent) {
      e.preventDefault();

      const sel = selectedRef.current;
      if (sel) {
        const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
        if (sel.kind === "circle") {
          setCircles((cs) =>
            cs.map((c) => (c.id === sel.id ? { ...c, size: clamp(c.size * k, MIN_CIRCLE, MAX_CIRCLE) } : c)),
          );
        } else {
          setTexts((ts) =>
            ts.map((t) => (t.id === sel.id ? { ...t, fontSize: clamp(t.fontSize * k, MIN_TEXT, MAX_TEXT) } : t)),
          );
          setSizeShownFor(sel.id);
          if (sizeTimer.current) clearTimeout(sizeTimer.current);
          sizeTimer.current = setTimeout(() => setSizeShownFor(null), 900);
        }
        return;
      }

      if (!e.ctrlKey && isTrackpadSwipe(e)) {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
        return;
      }
      const speed = e.ctrlKey ? 0.01 : 0.0015;
      setView((v) => {
        const scale = clamp(v.scale * Math.exp(-e.deltaY * speed), MIN_SCALE, MAX_SCALE);
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

    // Typing into a text or a menu field shouldn't add circles or lines.
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    };

    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const key = e.key.toLowerCase();
      if (key === "b") {
        const at = cursorOnBoard();
        setCircles((cs) => [...cs, { id: nextId.current++, x: at.x, y: at.y, size: CIRCLE_SIZE }]);
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

    if (d.kind === "circle" || d.kind === "text") {
      const o = d.orig as Point;
      const move = <T extends { id: number; x: number; y: number }>(items: T[]) =>
        items.map((it) => (it.id === d.id ? { ...it, x: o.x + dx, y: o.y + dy } : it));
      if (d.kind === "circle") setCircles(move);
      else setTexts(move);
      return;
    }

    const o = d.orig as Line; // ends already resolved to positions
    const move = (pt: Point) => ({ x: pt.x + dx, y: pt.y + dy });
    let next: Line;
    if (d.kind === "line") {
      // Moving the whole line takes it off anything it was attached to.
      next = { id: o.id, from: move(o.from), to: move(o.to), time: o.time };
    } else {
      const end = d.kind;
      const pos = move(o[end]);
      const scale = viewRef.current.scale;
      const near = circles
        .map((c) => ({ c, dist: Math.hypot(c.x - pos.x, c.y - pos.y) }))
        .filter(({ c, dist }) => dist <= c.size / 2 + ATTACH_DISTANCE / scale)
        .sort((a, b) => a.dist - b.dist)[0]?.c;
      next = { ...o, [end]: near ? { x: near.x, y: near.y } : pos, [`${end}Item`]: near?.id };
    }
    setLines((ls) => ls.map((l) => (l.id === d.id ? next : l)));
  }

  function startDrag(e: React.PointerEvent, kind: DragKind, id: number) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const line = lines.find((l) => l.id === id);
    const orig = kind === "circle" || kind === "text" ? itemPos(id)! : resolve(line!);
    drag.current = {
      kind,
      id,
      start: toBoard(e.clientX, e.clientY),
      orig,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    // Only one thing is selected at a time.
    if (kind === "circle" || kind === "text") setSelectedLine(null);
    else setSelected(null);
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // A click without moving selects: circles and texts open their menu,
    // lines show their end dots.
    if (d.kind === "circle" || d.kind === "text") {
      const kind = d.kind;
      setSelected((s) => (s?.kind === kind && s.id === d.id ? null : { kind, id: d.id }));
    }
    if (d.kind === "line") setSelectedLine(d.id);
  }

  // The circle menu's "Text": swap the circle for an empty text in the same
  // place (same id, so attached lines stay attached) and start typing.
  function circleToText(c: Circle) {
    setCircles((cs) => cs.filter((x) => x.id !== c.id));
    setTexts((ts) => [
      ...ts,
      { id: c.id, x: c.x, y: c.y, text: "", fontSize: TEXT_SIZE, color: TEXT_COLORS[0], bold: false },
    ]);
    setSelected(null);
    setEditing(c.id);
  }

  function confirmText(id: number, value: string) {
    setEditing(null);
    const text = value.replace(/\n/g, " ").trim();
    if (text) {
      setTexts((ts) => ts.map((t) => (t.id === id ? { ...t, text } : t)));
      return;
    }
    // An empty text would be invisible, so drop it. Lines attached to it stay
    // where they are.
    const pos = itemPos(id);
    setTexts((ts) => ts.filter((t) => t.id !== id));
    if (pos) {
      setLines((ls) =>
        ls.map((l) => ({
          ...l,
          ...(l.fromItem === id && { from: pos, fromItem: undefined }),
          ...(l.toItem === id && { to: pos, toItem: undefined }),
        })),
      );
    }
  }

  function updateText(id: number, patch: Partial<Text>) {
    setTexts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  // The ruler marks for a timeline line: one tick per day/week/month/year,
  // evenly spaced from the line's start to its end. Labels are thinned out
  // when they would overlap.
  function timelineMarks(l: Line) {
    const labels = l.time && timelineTicks(l.time);
    if (!labels) return null;
    const dx = l.to.x - l.from.x;
    const dy = l.to.y - l.from.y;
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular to the line, pointing down-ish so labels sit under it.
    let nx = -dy / len;
    let ny = dx / len;
    if (ny < 0 || (ny === 0 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }
    const n = labels.length;
    const spacing = n > 1 ? len / (n - 1) : len;
    const labelEvery = Math.max(1, Math.ceil(TICK_LABEL_GAP / spacing));
    const tickEvery = Math.max(1, Math.ceil(3 / spacing));
    return labels.map((text, i) => {
      const isEnd = i === 0 || i === n - 1;
      if (!isEnd && i % tickEvery !== 0) return null;
      const t = n > 1 ? i / (n - 1) : 0;
      const x = l.from.x + dx * t;
      const y = l.from.y + dy * t;
      const labelled = isEnd || (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2);
      const size = labelled ? MAJOR_TICK : TICK;
      return (
        <g key={i} data-tick={labelled ? text : undefined}>
          <line
            x1={x - nx * size}
            y1={y - ny * size}
            x2={x + nx * size}
            y2={y + ny * size}
            stroke="#1c1917"
            strokeWidth={labelled ? 1.5 : 1}
          />
          {labelled && (
            <text
              x={x + nx * (MAJOR_TICK + TICK_LABEL_SIZE)}
              y={y + ny * (MAJOR_TICK + TICK_LABEL_SIZE)}
              fontSize={TICK_LABEL_SIZE}
              fill="#57534e"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {text}
            </text>
          )}
        </g>
      );
    });
  }

  // Fade the dots out when zoomed far out so they don't turn into a grey haze.
  const dotAlpha = 0.12 * clamp((view.scale - 0.2) / 0.3, 0, 1);
  const menuCircle = selected?.kind === "circle" ? circles.find((c) => c.id === selected.id) : undefined;
  const lineEnd = (l: Line, end: End) => (
    <circle
      key={end}
      data-line-end={end}
      data-attached={l[`${end}Item`] !== undefined ? "yes" : "no"}
      cx={l[end].x}
      cy={l[end].y}
      r={6 / view.scale}
      fill="white"
      stroke="#1c1917"
      strokeWidth={1.5 / view.scale}
      className="pointer-events-auto cursor-move"
      onPointerDown={(e) => startDrag(e, end, l.id)}
    />
  );

  return (
    <div
      ref={rootRef}
      // overflow-clip (not hidden): focusing a field in a menu must not scroll the board.
      className="fixed inset-0 touch-none select-none overflow-clip bg-white"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      // Clicking empty board deselects everything.
      onPointerDown={() => {
        setSelected(null);
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
          {lines.map(resolve).map((l) => (
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
              {timelineMarks(l)}
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
                onPointerDown={(e) => startDrag(e, "line", l.id)}
              />
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
            data-circle={c.id}
            onPointerDown={(e) => startDrag(e, "circle", c.id)}
            className="absolute cursor-grab rounded-full border-2 border-stone-900 bg-white active:cursor-grabbing"
            style={{ width: c.size, height: c.size, left: c.x - c.size / 2, top: c.y - c.size / 2 }}
          />
        ))}

        {texts.map((t) => {
          const isEditing = editing === t.id;
          const isSelected = selected?.kind === "text" && selected.id === t.id;
          const style = {
            fontSize: t.fontSize,
            color: t.color,
            fontWeight: t.bold ? 700 : 400,
            lineHeight: 1.2,
          };
          return (
            <div
              key={t.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: t.x, top: t.y }}
            >
              {isEditing ? (
                <TextEditor
                  initial={t.text}
                  style={style}
                  onConfirm={(value) => confirmText(t.id, value)}
                />
              ) : (
                <div
                  data-text={t.id}
                  onPointerDown={(e) => startDrag(e, "text", t.id)}
                  onDoubleClick={() => {
                    setSelected(null);
                    setEditing(t.id);
                  }}
                  className="cursor-grab whitespace-pre bg-white px-1 active:cursor-grabbing"
                  style={style}
                >
                  {t.text}
                </div>
              )}

              {sizeShownFor === t.id && (
                <div
                  data-size-label
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-stone-900 px-1.5 py-0.5 text-white"
                  style={{ bottom: "100%", marginBottom: 6 / view.scale, fontSize: 12 / view.scale }}
                >
                  {Math.round(t.fontSize)}px
                </div>
              )}

              {isSelected && (
                <div
                  data-menu="text"
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute left-full top-0 flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-2 shadow-lg"
                  style={{ marginLeft: 8 }}
                >
                  <div className="flex gap-1.5">
                    {TEXT_COLORS.map((color) => (
                      <button
                        key={color}
                        aria-label={`Colour ${color}`}
                        onClick={() => updateText(t.id, { color })}
                        className={`size-5 rounded-full ${t.color === color ? "ring-2 ring-stone-400 ring-offset-1" : ""}`}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => updateText(t.id, { bold: !t.bold })}
                    className={`rounded px-2 py-1 text-left text-sm font-bold ${t.bold ? "bg-stone-200" : "hover:bg-stone-100"}`}
                  >
                    Bold
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* End dots sit above circles so an attached end can still be grabbed. */}
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={BOARD_W}
          height={BOARD_H}
        >
          {lines
            .filter((l) => l.id === selectedLine)
            .map(resolve)
            .map((l) => (
              <g key={l.id}>{(["from", "to"] as const).map((end) => lineEnd(l, end))}</g>
            ))}
        </svg>

        {lines
          .filter((l) => l.id === selectedLine)
          .map(resolve)
          .map((l) => (
            <div
              key={l.id}
              className="absolute"
              style={{ left: (l.from.x + l.to.x) / 2 + 12, top: (l.from.y + l.to.y) / 2 + 12 }}
            >
              <LineMenu
                time={l.time}
                onDone={(time) => {
                  setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, time } : x)));
                  setSelectedLine(null);
                }}
              />
            </div>
          ))}

        {menuCircle && (
          <div
            data-menu="circle"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute min-w-40 rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
            style={{ left: menuCircle.x + menuCircle.size / 2 + 8, top: menuCircle.y - menuCircle.size / 2 }}
          >
            <button
              onClick={() => circleToText(menuCircle)}
              className="w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100"
            >
              Text
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// The text being typed. Enter or clicking elsewhere confirms it.
function TextEditor({
  initial,
  style,
  onConfirm,
}: {
  initial: string;
  style: React.CSSProperties;
  onConfirm: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    el.textContent = initial;
    el.focus({ preventScroll: true });
    // Put the cursor at the end.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // Only on mount: the text is typed into the element directly.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ref}
      data-text-editor
      contentEditable
      suppressContentEditableWarning
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          ref.current?.blur();
        }
      }}
      onBlur={(e) => onConfirm(e.currentTarget.textContent ?? "")}
      className="min-w-[1ch] cursor-text whitespace-pre bg-white px-1 outline-none"
      style={{ ...style, userSelect: "text", caretColor: style.color }}
    />
  );
}
