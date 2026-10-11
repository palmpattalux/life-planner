"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  distanceAlong,
  offsetPolyline,
  subPolyline,
  boxAround,
  boxesTouch,
  circleTouchesBox,
  mergeBoxes,
  newBend,
  pointAlong,
  polylineLength,
  segmentTouchesBox,
  unit,
  type Box,
  type Point,
} from "./geometry";
import { CheckMark, ChecklistIcon, LinkButton, PinIcon, SquareIcon } from "./icons";
import { LineMenu } from "./LineMenu";
import { tickValue, timelineTicks, type Timeline } from "./timeline";

type View = { x: number; y: number; scale: number };
// `group`: things grouped together share a group number and are selected
// and moved as one.
type Circle = { id: number; x: number; y: number; size: number; group?: number };
// A square outline (made from a circle); its corners can be dragged to make
// it any rectangle. Only its outline can be clicked. `label` is the text at
// its outer top left, in the square's colour. x, y is the centre.
type Square = { id: number; x: number; y: number; w: number; h: number; color: string; label?: string; group?: number };
type Text = {
  id: number;
  x: number; // centre
  y: number;
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
  group?: number;
};
// A line end is either a free point or attached to a circle or text
// (fromItem / toItem), in which case it sits at that item's centre and
// follows it. `bends` are the angle points between the two ends.
// A line with `time` is drawn as a timeline: a ruler of evenly spaced dates.
type Line = {
  id: number;
  from: Point;
  to: Point;
  fromItem?: number;
  toItem?: number;
  bends?: Point[];
  fromArrow?: boolean;
  toArrow?: boolean;
  time?: Timeline;
  label?: string; // text in the middle of the line
  color?: string; // the line, its arrowheads and timeline marks (default ink)
  // Pinned timeline marks, by their value (as in `time`): drawn bigger
  // (when bold) and in their own colour.
  pins?: Pin[];
  group?: number;
};
type Pin = { value: string; bold: boolean; color: string };
type End = "from" | "to";
// Everything on the board. Kept as one object so every change can be undone
// (and, later, saved) in one piece.
type BoardData = { circles: Circle[]; squares: Square[]; texts: Text[]; lines: Line[] };
type Kind = "circle" | "square" | "text" | "line";
// Selected things, as "circle:3", "text:7", "line:2".
type Key = `${Kind}:${number}`;
// "selection": pressing inside the selection box, on empty board.
// A circle, square or text as a box, for snapping things in line. Lines
// snap by their points (ends, bends and timeline marks) as zero-size boxes,
// and only to other lines' points (`line: true`).
type SnapBox = { key: Key; x: number; y: number; w: number; h: number; line?: boolean };
type DragKind = Kind | End | "bend" | "corner" | "selection";

const CIRCLE_SIZE = 64;
const MIN_CIRCLE = 8;
const MAX_CIRCLE = 2000;
const TEXT_SIZE = 24;
const MIN_TEXT = 6;
const MAX_TEXT = 800;
const TEXT_COLORS = ["#1c1917", "#78716c", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#9333ea"];
const INK = "#1c1917";
const SELECT_BLUE = "#3b82f6";
const SNAP_PINK = "#ec4899";
// Checklist boxes are stored as these characters at the start of a text line.
const UNCHECKED = "☐";
const CHECKED = "☑";
// Pressing Tab while typing moves the line right by this much.
const INDENT = "    ";
const PHASE_ORANGE = "#f97316";
// How far a new phase sits from the timeline it was made from, in board units.
const PHASE_GAP = 48;
const PHASE_GAP_PAST_LABELS = 72;
// How much bigger a bold pinned timeline mark is drawn.
const PIN_GROW = 1.5;
// Moving less than this many pixels between press and release counts as a click.
const CLICK_SLOP = 4;
// Scroll steps closer together than this are one resize, undone in one go.
const RESIZE_UNDO_GAP_MS = 500;
const MAX_UNDO = 200;

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
// Text in the middle of a line, in board units.
const LINE_LABEL_SIZE = 16;
// How close (in screen pixels, beyond the circle's edge) a dragged line end
// has to be to a circle to attach to it.
const ATTACH_DISTANCE = 16;
// How close (in screen pixels) a dragged square's edge or middle has to be to
// another square's to snap in line with it.
const SNAP_DISTANCE = 8;

// Browsers don't say whether a wheel event came from a mouse or a trackpad.
// Trackpads send pixel deltas that are small, fractional or sideways; mouse
// wheels send big whole-number steps straight up or down.
function isTrackpadSwipe(e: WheelEvent) {
  if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
  if (e.deltaX !== 0) return true;
  return !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50;
}

// Square labels grow and shrink with their square.
const squareLabelSize = (size: number) => Math.max(8, size / 4);
// A point nearly level or upright with `anchor` (within a few degrees) is put
// exactly level or upright with it, so lines snap straight.
const STRAIGHT_SNAP_DEG = 3;
function straighten(p: Point, anchor: Point): Point {
  const dx = Math.abs(p.x - anchor.x);
  const dy = Math.abs(p.y - anchor.y);
  const limit = Math.tan((STRAIGHT_SNAP_DEG * Math.PI) / 180);
  if (dx > 0 && dy / dx < limit) return { x: p.x, y: anchor.y };
  if (dy > 0 && dx / dy < limit) return { x: anchor.x, y: p.y };
  return p;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const keyOf = (kind: Kind, id: number): Key => `${kind}:${id}`;
// Every thing on the board, as keys.
const allKeys = (d: BoardData): Key[] => [
  ...d.circles.map((c) => keyOf("circle", c.id)),
  ...d.squares.map((q) => keyOf("square", q.id)),
  ...d.texts.map((t) => keyOf("text", t.id)),
  ...d.lines.map((l) => keyOf("line", l.id)),
];
const idsOf = (sel: Key[], kind: Kind) =>
  new Set(sel.filter((k) => k.startsWith(kind + ":")).map((k) => Number(k.split(":")[1])));

// A huge white board with faint grey dots and a light grey edge.
// - Two-finger swipe moves around; pinch or mouse wheel zooms.
// - "b" adds a circle at the cursor. Hold "n" to draw a line; let go to confirm.
// - Drag circles, texts and lines to move them.
// - Drag on empty board to draw a selection box: everything fully inside it is
//   selected and can be moved together (drag any of them) or resized together
//   (scroll wheel / trackpad).
// - Click a circle or text to select it and open its menu. While selected, the
//   scroll wheel / trackpad resizes it instead of moving the board.
// - The circle menu's "Text" turns the circle into text, ready to type. Enter
//   starts a new line; clicking elsewhere confirms. Double-click to edit again.
// - The circle menu's "Square" turns the circle into a square outline (only the
//   outline is clickable) with a colour and a label at its outer top left.
// - Click a line to show dots on its ends (drag to move each end), arrow
//   buttons beside its ends (click to give that end an arrowhead) and its menu:
//   "Time" turns it into a timeline, "Angle" adds a bend point you can drag.
//   Drop an end near a circle or text and it attaches, following it when it moves.
// - Backspace deletes whatever is selected; Ctrl+Z / Cmd+Z undoes any change,
//   Ctrl+Shift+Z / Cmd+Shift+Z redoes it.
export function Board() {
  const [board, setBoard] = useState<BoardData>({ circles: [], squares: [], texts: [], lines: [] });
  const { circles, squares, texts, lines } = board;
  const setCircles = (f: (cs: Circle[]) => Circle[]) => setBoard((b) => ({ ...b, circles: f(b.circles) }));
  const setSquares = (f: (qs: Square[]) => Square[]) => setBoard((b) => ({ ...b, squares: f(b.squares) }));
  const setTexts = (f: (ts: Text[]) => Text[]) => setBoard((b) => ({ ...b, texts: f(b.texts) }));
  const setLines = (f: (ls: Line[]) => Line[]) => setBoard((b) => ({ ...b, lines: f(b.lines) }));

  const [selection, setSelection] = useState<Key[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  // Choosing a phase on a timeline: the first tick picked (null until the
  // first click) and the tick under the mouse.
  // `pin`: choosing one mark to pin instead of a stretch.
  const [phase, setPhase] = useState<{
    lineId: number;
    start: number | null;
    hover: number;
    pin?: boolean;
  } | null>(null);
  // The pinned mark whose box (bold, colours) is showing.
  const [pinMenu, setPinMenu] = useState<{ lineId: number; value: string } | null>(null);
  // Alignment lines shown while a square snaps to other squares.
  const [snapGuides, setSnapGuides] = useState<{ a: Point; b: Point }[]>([]);
  // Which line's middle text is being typed.
  const [editingLineLabel, setEditingLineLabel] = useState<number | null>(null);
  // Which square's label is being typed.
  const [editingLabel, setEditingLabel] = useState<number | null>(null);
  // Which text is showing its px size label while being resized.
  const [sizeShownFor, setSizeShownFor] = useState<number | null>(null);
  const sizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The line being drawn while N is held: starts where N was pressed,
  // ends at the cursor.
  const [draft, setDraft] = useState<{ from: Point; to: Point } | null>(null);
  // The selection box being dragged out, in screen coordinates.
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });

  // Event listeners set up once read the latest values through refs.
  const boardRef = useRef(board);
  boardRef.current = board;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const viewRef = useRef(view);
  viewRef.current = view;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  // The box around several selected things (set while rendering).
  const groupBoxRef = useRef<Box | null>(null);

  // Undo history: snapshots of the board from before each change.
  const history = useRef<BoardData[]>([]);
  // Changes that were undone, newest last, for Ctrl+Shift+Z.
  const future = useRef<BoardData[]>([]);
  const lastResizeAt = useRef(0);
  // Whether the text being edited was just made from a circle (that change
  // is already in the undo history).
  const editingIsNew = useRef(false);
  // A list marker added to the end of the text when editing starts from the
  // checklist or 1.2.3. buttons.
  const editingAppend = useRef("");

  const rootRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<Point | null>(null);
  // What is being dragged and how the board was when the drag began.
  const drag = useRef<{
    kind: DragKind;
    id: number;
    index?: number; // which bend or square corner
    start: Point; // board position where the drag began
    orig: BoardData;
    many: Key[] | null; // set when dragging several things together
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const nextId = useRef(1);
  // Where a line was last pressed, so "Angle" adds its bend on that side.
  const linePressedAt = useRef<{ id: number; at: Point } | null>(null);
  // What Ctrl+C copied, ready for Ctrl+V.
  const clipboard = useRef<BoardData | null>(null);
  // Groups of things saved with the Preset button, to be added later on.
  const presets = useRef<BoardData[]>([]);
  const [presetSaved, setPresetSaved] = useState(false);

  // Remember the board as it is now, so the next change can be undone.
  function commit() {
    history.current.push(boardRef.current);
    if (history.current.length > MAX_UNDO) history.current.shift();
    // A new change means the undone ones can't be redone any more.
    future.current = [];
  }

  // Screen position -> board position.
  function toBoard(sx: number, sy: number): Point {
    const v = viewRef.current;
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
  }

  function itemPos(id: number | undefined, data: BoardData = board): Point | undefined {
    const item =
      data.circles.find((c) => c.id === id) ?? data.texts.find((t) => t.id === id) ?? data.squares.find((q) => q.id === id);
    return item && { x: item.x, y: item.y };
  }

  // The line with attached ends moved to their items' centres.
  function resolve(l: Line, data: BoardData = board): Line {
    return { ...l, from: itemPos(l.fromItem, data) ?? l.from, to: itemPos(l.toItem, data) ?? l.to };
  }

  const pointsOf = (l: Line): Point[] => [l.from, ...(l.bends ?? []), l.to];

  // For drawing: an end attached to a circle or text stops at its edge, so an
  // arrowhead there is visible.
  function drawPoints(l: Line): Point[] {
    const pts = pointsOf(l);
    const trim = (end: End) => {
      const id = l[`${end}Item`];
      if (id === undefined) return;
      const i = end === "from" ? 0 : pts.length - 1;
      const neighbour = pts[end === "from" ? 1 : pts.length - 2];
      const d = unit(pts[i], neighbour);
      const c = circles.find((c) => c.id === id);
      const box = !c && texts.some((t) => t.id === id) ? boxOf(keyOf("text", id)) : null;
      let by = 0;
      if (c) by = c.size / 2;
      else if (box) {
        // Where the line leaves the text's box.
        const hw = (box.maxX - box.minX) / 2;
        const hh = (box.maxY - box.minY) / 2;
        by = Math.min(d.x ? hw / Math.abs(d.x) : Infinity, d.y ? hh / Math.abs(d.y) : Infinity);
      }
      pts[i] = { x: pts[i].x + d.x * by, y: pts[i].y + d.y * by };
    };
    trim("from");
    trim("to");
    return pts;
  }

  // The area a thing covers on the board, for the selection box.
  function boxOf(key: Key, data: BoardData = board): Box | null {
    const [kind, idStr] = key.split(":");
    const id = Number(idStr);
    if (kind === "circle") {
      const c = data.circles.find((c) => c.id === id);
      return c ? { minX: c.x - c.size / 2, minY: c.y - c.size / 2, maxX: c.x + c.size / 2, maxY: c.y + c.size / 2 } : null;
    }
    if (kind === "square") {
      const q = data.squares.find((q) => q.id === id);
      return q ? { minX: q.x - q.w / 2, minY: q.y - q.h / 2, maxX: q.x + q.w / 2, maxY: q.y + q.h / 2 } : null;
    }
    if (kind === "text") {
      const el = document.querySelector(`[data-text="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const a = toBoard(r.left, r.top);
      const b = toBoard(r.right, r.bottom);
      return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
    }
    const l = data.lines.find((l) => l.id === id);
    return l ? boxAround(pointsOf(resolve(l, data))) : null;
  }

  // Circles, squares and texts as boxes (centre and size) for snapping.
  function snapBoxesOf(data: BoardData): SnapBox[] {
    const scale = viewRef.current.scale;
    return [
      ...data.circles.map((c) => ({ key: keyOf("circle", c.id), x: c.x, y: c.y, w: c.size, h: c.size })),
      ...data.squares.map((q) => ({ key: keyOf("square", q.id), x: q.x, y: q.y, w: q.w, h: q.h })),
      ...data.texts.map((t) => {
        // The text's size from the page; its centre from the data (the page
        // may already show it moved).
        const r = document.querySelector(`[data-text="${t.id}"]`)?.getBoundingClientRect();
        return { key: keyOf("text", t.id), x: t.x, y: t.y, w: (r?.width ?? 0) / scale, h: (r?.height ?? 0) / scale };
      }),
      ...data.lines.flatMap((l) =>
        lineSnapPoints(l, data).map((p) => ({ key: keyOf("line", l.id), ...p, w: 0, h: 0, line: true })),
      ),
    ];
  }

  // A line's points that snap: its ends, bends and timeline marks.
  function lineSnapPoints(l: Line, data: BoardData): Point[] {
    const pts = pointsOf(resolve(l, data));
    const labels = (l.time && timelineTicks(l.time)) || [];
    const len = polylineLength(pts);
    const marks = labels.length > 1 ? labels.map((_, i) => pointAlong(pts, (len * i) / (labels.length - 1)).p) : [];
    return [...pts, ...marks];
  }

  // Snap one dragged line point (an end or bend) in line with other lines'
  // points. Returns where it goes and the guide lines.
  function snapLinePoint(lineId: number, p: Point, data: BoardData) {
    const snap = snapBoxes([{ key: keyOf("line", lineId), ...p, w: 0, h: 0, line: true }], 0, 0, snapBoxesOf(data));
    return { at: { x: p.x + snap.dx, y: p.y + snap.dy }, lines: snap.lines };
  }

  // How far to nudge things being dragged (by dx, dy) so an edge or middle of
  // one of them lines up with an edge or middle of another circle, square or
  // text, like in Canva, and the guide lines to show. They all move together.
  function snapBoxes(moving: SnapBox[], dx: number, dy: number, all: SnapBox[]) {
    const reach = SNAP_DISTANCE / viewRef.current.scale;
    const movingKeys = new Set(moving.map((q) => q.key));
    const others = all.filter((s) => !movingKeys.has(s.key));
    const lineOf = (s: SnapBox, key: "x" | "y", size: "w" | "h") => [s[key] - s[size] / 2, s[key], s[key] + s[size] / 2];
    const axis = (key: "x" | "y", size: "w" | "h", shift: number) => {
      let best: { delta: number; at: number } | null = null;
      for (const q of moving) {
        const mine = lineOf({ ...q, [key]: q[key] + shift }, key, size);
        for (const o of others) {
          // Lines snap to lines; circles, squares and texts to each other.
          if (!!o.line !== !!q.line) continue;
          for (const target of lineOf(o, key, size)) {
            for (const m of mine) {
              const delta = target - m;
              if (Math.abs(delta) <= reach && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: target };
            }
          }
        }
      }
      return best;
    };
    const sx = axis("x", "w", dx);
    const sy = axis("y", "h", dy);
    const ndx = dx + (sx?.delta ?? 0);
    const ndy = dy + (sy?.delta ?? 0);
    const placed = [...moving.map((q) => ({ ...q, x: q.x + ndx, y: q.y + ndy })), ...others];
    // A guide runs across every square on that line.
    const lines: { a: Point; b: Point }[] = [];
    if (sx) {
      const ss = placed.filter((s) => lineOf(s, "x", "w").some((v) => Math.abs(v - sx.at) < 0.5));
      lines.push({
        a: { x: sx.at, y: Math.min(...ss.map((s) => s.y - s.h / 2)) },
        b: { x: sx.at, y: Math.max(...ss.map((s) => s.y + s.h / 2)) },
      });
    }
    if (sy) {
      const ss = placed.filter((s) => lineOf(s, "y", "h").some((v) => Math.abs(v - sy.at) < 0.5));
      lines.push({
        a: { x: Math.min(...ss.map((s) => s.x - s.w / 2)), y: sy.at },
        b: { x: Math.max(...ss.map((s) => s.x + s.w / 2)), y: sy.at },
      });
    }
    return { dx: ndx, dy: ndy, lines };
  }

  // The guide lines still true after a snapped point was moved again
  // (vertical guides need the same x, horizontal ones the same y).
  function keptGuides(guides: { a: Point; b: Point }[], snapped: Point, final: Point) {
    return guides.filter((g) => (g.a.x === g.b.x ? final.x === snapped.x : final.y === snapped.y));
  }

  // The circle or text (topmost first) that this board point is inside.
  function itemAt(p: Point, data: BoardData): { id: number; x: number; y: number } | undefined {
    const text = [...data.texts].reverse().find((t) => {
      const b = boxOf(keyOf("text", t.id), data);
      return b && p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
    });
    if (text) return text;
    return [...data.circles].reverse().find((c) => Math.hypot(c.x - p.x, c.y - p.y) <= c.size / 2);
  }

  // Whether a thing touches the selection box at all.
  function touches(key: Key, area: Box): boolean {
    const [kind, idStr] = key.split(":");
    const id = Number(idStr);
    if (kind === "circle") {
      const c = circles.find((c) => c.id === id);
      return !!c && circleTouchesBox(c, c.size / 2, area);
    }
    if (kind === "text") {
      const box = boxOf(key);
      return !!box && boxesTouch(box, area);
    }
    if (kind === "square") {
      // Only the outline counts, like clicking.
      const b = boxOf(key);
      if (!b) return false;
      const c = [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
      ];
      return c.some((p, i) => segmentTouchesBox(p, c[(i + 1) % 4], area));
    }
    const l = lines.find((l) => l.id === id);
    if (!l) return false;
    const pts = pointsOf(resolve(l));
    return pts.some((p, i) => i > 0 && segmentTouchesBox(pts[i - 1], p, area));
  }

  // These keys plus everything grouped with any of them.
  function withGroups(keys: Key[], data: BoardData = boardRef.current): Key[] {
    const all: [Key, number | undefined][] = [
      ...data.circles.map((c) => [keyOf("circle", c.id), c.group] as [Key, number | undefined]),
      ...data.texts.map((t) => [keyOf("text", t.id), t.group] as [Key, number | undefined]),
      ...data.squares.map((q) => [keyOf("square", q.id), q.group] as [Key, number | undefined]),
      ...data.lines.map((l) => [keyOf("line", l.id), l.group] as [Key, number | undefined]),
    ];
    const groups = new Set(all.filter(([k, g]) => g !== undefined && keys.includes(k)).map(([, g]) => g));
    return all.filter(([k, g]) => keys.includes(k) || (g !== undefined && groups.has(g))).map(([k]) => k);
  }

  // The selected things, as their own little board (for copy and presets).
  // Line ends stay attached only to things that are copied too.
  function pickOut(keys: Key[], data: BoardData): BoardData {
    const cIds = idsOf(keys, "circle");
    const tIds = idsOf(keys, "text");
    const sIds = idsOf(keys, "square");
    const lIds = idsOf(keys, "line");
    const kept = (id?: number) => (id !== undefined && (cIds.has(id) || tIds.has(id) || sIds.has(id)) ? id : undefined);
    return structuredClone({
      circles: data.circles.filter((c) => cIds.has(c.id)),
      squares: data.squares.filter((q) => sIds.has(q.id)),
      texts: data.texts.filter((t) => tIds.has(t.id)),
      lines: data.lines
        .filter((l) => lIds.has(l.id))
        .map((l) => ({ ...resolve(l, data), fromItem: kept(l.fromItem), toItem: kept(l.toItem) })),
    });
  }

  // Group the selected things, or ungroup them if they already are one group.
  function toggleGroup(isGroup: boolean) {
    const sel = selectionRef.current;
    const cIds = idsOf(sel, "circle");
    const tIds = idsOf(sel, "text");
    const sIds = idsOf(sel, "square");
    const lIds = idsOf(sel, "line");
    const group = isGroup ? undefined : nextId.current++;
    commit();
    setBoard((b) => ({
      circles: b.circles.map((c) => (cIds.has(c.id) ? { ...c, group } : c)),
      squares: b.squares.map((q) => (sIds.has(q.id) ? { ...q, group } : q)),
      texts: b.texts.map((t) => (tIds.has(t.id) ? { ...t, group } : t)),
      lines: b.lines.map((l) => (lIds.has(l.id) ? { ...l, group } : l)),
    }));
  }

  function savePreset() {
    presets.current.push(pickOut(selectionRef.current, boardRef.current));
    setPresetSaved(true);
    setTimeout(() => setPresetSaved(false), 1200);
  }

  // Start with the middle of the board in the middle of the screen.
  useEffect(() => {
    setView({
      x: window.innerWidth / 2 - BOARD_W / 2,
      y: window.innerHeight / 2 - BOARD_H / 2,
      scale: 1,
    });
  }, []);

  // Scroll wheel / trackpad. With something selected it resizes it (a group
  // grows or shrinks around its middle). Otherwise: two-finger swipe moves
  // around, pinch zooms (pinch arrives as a wheel event with ctrlKey), mouse
  // wheel zooms.
  useEffect(() => {
    const el = rootRef.current!;
    function onWheel(e: WheelEvent) {
      e.preventDefault();

      const sel = selectionRef.current;
      // Several things selected: only a pinch (or mouse wheel) with the
      // cursor inside their box resizes them. Two-finger swipes, and anything
      // outside the box, move around the board as usual.
      const box = groupBoxRef.current;
      const at = toBoard(e.clientX, e.clientY);
      const pad = 6 / viewRef.current.scale;
      const insideBox =
        !!box && at.x >= box.minX - pad && at.x <= box.maxX + pad && at.y >= box.minY - pad && at.y <= box.maxY + pad;
      const groupResize = sel.length > 1 && insideBox && (e.ctrlKey || !isTrackpadSwipe(e));
      const resizable = groupResize || (sel.length === 1 && !sel[0].startsWith("line:"));
      if (resizable) {
        const now = Date.now();
        if (now - lastResizeAt.current > RESIZE_UNDO_GAP_MS) commit();
        lastResizeAt.current = now;
        resizeSelection(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
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
    // Set up once; reads current values through refs.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Grow or shrink everything selected by `k` around the middle of the group.
  function resizeSelection(k: number) {
    const sel = selectionRef.current;
    const data = boardRef.current;
    const box = mergeBoxes(sel.map((key) => boxOf(key, data)).filter((b): b is Box => !!b));
    if (!box) return;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const cIds = idsOf(sel, "circle");
    const tIds = idsOf(sel, "text");
    const lIds = idsOf(sel, "line");
    const single = sel.length === 1;
    // Clamp the factor so no circle or text goes past its size limits.
    let f = k;
    const sIds = idsOf(sel, "square");
    for (const c of data.circles) if (cIds.has(c.id)) f = clamp(c.size * f, MIN_CIRCLE, MAX_CIRCLE) / c.size;
    for (const q of data.squares) {
      if (!sIds.has(q.id)) continue;
      f = Math.max(f, MIN_CIRCLE / Math.min(q.w, q.h));
      f = Math.min(f, MAX_CIRCLE / Math.max(q.w, q.h));
    }
    for (const t of data.texts) if (tIds.has(t.id)) f = clamp(t.fontSize * f, MIN_TEXT, MAX_TEXT) / t.fontSize;
    const scalePt = (p: Point) => (single ? p : { x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f });

    setBoard((b) => ({
      circles: b.circles.map((c) => (cIds.has(c.id) ? { ...c, ...scalePt(c), size: c.size * f } : c)),
      squares: b.squares.map((q) => (sIds.has(q.id) ? { ...q, ...scalePt(q), w: q.w * f, h: q.h * f } : q)),
      texts: b.texts.map((t) => (tIds.has(t.id) ? { ...t, ...scalePt(t), fontSize: t.fontSize * f } : t)),
      lines: b.lines.map((l) =>
        lIds.has(l.id)
          ? {
              ...l,
              from: l.fromItem !== undefined ? l.from : scalePt(l.from),
              to: l.toItem !== undefined ? l.to : scalePt(l.to),
              bends: l.bends?.map(scalePt),
            }
          : l,
      ),
    }));

    if (single && tIds.size === 1) {
      setSizeShownFor([...tIds][0]);
      if (sizeTimer.current) clearTimeout(sizeTimer.current);
      sizeTimer.current = setTimeout(() => setSizeShownFor(null), 900);
    }
  }

  // Remove these things. Line ends attached to a removed circle or text stay
  // where they are.
  function removeKeys(keys: Key[]) {
    const cIds = idsOf(keys, "circle");
    const tIds = idsOf(keys, "text");
    const sIds = idsOf(keys, "square");
    const lIds = idsOf(keys, "line");
    setBoard((b) => {
      const gone = (id?: number) => id !== undefined && (cIds.has(id) || tIds.has(id) || sIds.has(id));
      return {
        circles: b.circles.filter((c) => !cIds.has(c.id)),
        squares: b.squares.filter((q) => !sIds.has(q.id)),
        texts: b.texts.filter((t) => !tIds.has(t.id)),
        lines: b.lines
          .filter((l) => !lIds.has(l.id))
          .map((l) => {
            const r = resolve(l, b);
            return {
              ...l,
              ...(gone(l.fromItem) && { from: r.from, fromItem: undefined }),
              ...(gone(l.toItem) && { to: r.to, toItem: undefined }),
            };
          }),
      };
    });
  }

  useEffect(() => {
    function cursorOnBoard() {
      const screen = pointer.current ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      return toBoard(screen.x, screen.y);
    }

    // Typing into a text or a menu field shouldn't trigger board shortcuts.
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    };

    // Add a copy of `items` centred on `at`, with new ids, and select it.
    function paste(items: BoardData, at: Point) {
      const pts = [
        ...items.circles,
        ...items.squares,
        ...items.texts,
        ...items.lines.flatMap((l) => pointsOf(l)),
      ];
      const box = boxAround(pts);
      const dx = at.x - (box.minX + box.maxX) / 2;
      const dy = at.y - (box.minY + box.maxY) / 2;
      const move = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
      const ids = new Map<number, number>();
      const newId = (old: number) => {
        if (!ids.has(old)) ids.set(old, nextId.current++);
        return ids.get(old)!;
      };
      const groups = new Map<number, number>();
      const newGroup = (g?: number) => {
        if (g === undefined) return undefined;
        if (!groups.has(g)) groups.set(g, nextId.current++);
        return groups.get(g);
      };
      const copy = structuredClone(items);
      const circles = copy.circles.map((c) => ({ ...c, ...move(c), id: newId(c.id), group: newGroup(c.group) }));
      const squares = copy.squares.map((q) => ({ ...q, ...move(q), id: newId(q.id), group: newGroup(q.group) }));
      const texts = copy.texts.map((t) => ({ ...t, ...move(t), id: newId(t.id), group: newGroup(t.group) }));
      const lines = copy.lines.map((l) => ({
        ...l,
        id: nextId.current++,
        from: move(l.from),
        to: move(l.to),
        bends: l.bends?.map(move),
        fromItem: l.fromItem !== undefined ? newId(l.fromItem) : undefined,
        toItem: l.toItem !== undefined ? newId(l.toItem) : undefined,
        group: newGroup(l.group),
      }));
      commit();
      setBoard((b) => ({
        circles: [...b.circles, ...circles],
        squares: [...b.squares, ...squares],
        texts: [...b.texts, ...texts],
        lines: [...b.lines, ...lines],
      }));
      setSelection(allKeys({ circles, squares, texts, lines }));
      setEditing(null);
      setEditingLabel(null);
      setEditingLineLabel(null);
    }

    function undo() {
      const prev = history.current.pop();
      if (!prev) return;
      future.current.push(boardRef.current);
      restore(prev);
    }

    function redo() {
      const next = future.current.pop();
      if (!next) return;
      history.current.push(boardRef.current);
      restore(next);
    }

    function restore(prev: BoardData) {
      setBoard(prev);
      // Keep selected whatever still exists, so its menu stays open.
      const exists = new Set<Key>(allKeys(prev));
      setSelection((s) => s.filter((k) => exists.has(k)));
      setEditing(null);
      setEditingLabel(null);
      setEditingLineLabel(null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (typing(e)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const sel = selectionRef.current;
        if (sel.length === 0) return;
        e.preventDefault();
        clipboard.current = pickOut(sel, boardRef.current);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        if (!clipboard.current) return;
        e.preventDefault();
        paste(clipboard.current, cursorOnBoard());
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        const sel = selectionRef.current;
        if (sel.length === 0) return;
        commit();
        removeKeys(sel);
        setSelection([]);
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "b") {
        const at = cursorOnBoard();
        commit();
        const id = nextId.current++;
        setCircles((cs) => [...cs, { id, x: at.x, y: at.y, size: CIRCLE_SIZE }]);
        // Select it straight away so its menu shows.
        setSelection([keyOf("circle", id)]);
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
      commit();
      // A line started or ended inside a circle or text is attached to it.
      const data = boardRef.current;
      const a = itemAt(d.from, data);
      const b = itemAt(d.to, data);
      setLines((ls) => [
        ...ls,
        {
          id: nextId.current++,
          from: a ? { x: a.x, y: a.y } : d.from,
          to: b ? { x: b.x, y: b.y } : d.to,
          fromItem: a?.id,
          toItem: b?.id,
        },
      ]);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // Set up once; reads current values through refs.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onPointerMove(e: React.PointerEvent) {
    pointer.current = { x: e.clientX, y: e.clientY };
    if (draftRef.current) {
      const to = toBoard(e.clientX, e.clientY);
      setDraft((dr) => (dr ? { ...dr, to: straighten(to, dr.from) } : dr));
    }
    if (marquee) {
      setMarquee({ ...marquee, x2: e.clientX, y2: e.clientY });
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < CLICK_SLOP) return;
    if (!d.moved) commit();
    d.moved = true;
    const at = toBoard(e.clientX, e.clientY);
    const dx = at.x - d.start.x;
    const dy = at.y - d.start.y;
    const move = (pt: Point) => ({ x: pt.x + dx, y: pt.y + dy });
    const o = d.orig;

    // Several things selected: move them all together. Squares among them
    // snap to the other squares, nudging the whole lot.
    if (d.many) {
      const all = snapBoxesOf(o);
      const moving = all.filter((s) => d.many!.includes(s.key));
      const snap = moving.length ? snapBoxes(moving, dx, dy, all) : { dx, dy, lines: [] };
      setSnapGuides(snap.lines);
      moveMany(d.many, snap.dx, snap.dy, o);
      return;
    }
    if (d.kind === "circle" || d.kind === "text" || d.kind === "square") {
      const key = keyOf(d.kind, d.id);
      const all = snapBoxesOf(o);
      const snap = snapBoxes(all.filter((s) => s.key === key), dx, dy, all);
      setSnapGuides(snap.lines);
      moveMany([key], snap.dx, snap.dy, o);
      return;
    }

    if (d.kind === "corner") {
      // The opposite corner stays put; the square stretches to the cursor.
      const q = o.squares.find((q) => q.id === d.id)!;
      const sx = d.index === 1 || d.index === 2 ? 1 : -1; // corners: 0 top left, 1 top right, 2 bottom right, 3 bottom left
      const sy = d.index === 2 || d.index === 3 ? 1 : -1;
      const fixed = { x: q.x - (sx * q.w) / 2, y: q.y - (sy * q.h) / 2 };
      const cx = q.x + (sx * q.w) / 2 + dx;
      const cy = q.y + (sy * q.h) / 2 + dy;
      const w = Math.max(MIN_CIRCLE, sx * (cx - fixed.x));
      const h = Math.max(MIN_CIRCLE, sy * (cy - fixed.y));
      setSquares(() =>
        o.squares.map((s) =>
          s.id === d.id ? { ...s, w, h, x: fixed.x + (sx * w) / 2, y: fixed.y + (sy * h) / 2 } : s,
        ),
      );
      return;
    }
    if (d.kind === "selection") return;
    const line = resolve(o.lines.find((l) => l.id === d.id)!, o);
    let next: Line;
    if (d.kind === "line") {
      // Its ends, bends and marks snap in line with other lines' points.
      const all = snapBoxesOf(o);
      const snap = snapBoxes(all.filter((b) => b.key === keyOf("line", d.id)), dx, dy, all);
      setSnapGuides(snap.lines);
      const shift = (pt: Point) => ({ x: pt.x + snap.dx, y: pt.y + snap.dy });
      // Moving the whole line takes it off anything it was attached to.
      next = {
        ...line,
        from: shift(line.from),
        to: shift(line.to),
        fromItem: undefined,
        toItem: undefined,
        bends: line.bends?.map(shift),
      };
    } else if (d.kind === "bend") {
      // Straighten against whichever neighbour it is nearly level or upright with.
      const pts = pointsOf(line);
      const i = d.index! + 1;
      // Snap in line with other lines' points; nearly straight wins.
      const snapped = snapLinePoint(d.id, move(pts[i]), o);
      const at = straighten(straighten(snapped.at, pts[i - 1]), pts[i + 1]);
      setSnapGuides(keptGuides(snapped.lines, snapped.at, at));
      next = { ...line, bends: line.bends!.map((p, j) => (j === d.index ? at : p)) };
      // Keep attached ends attached.
      next = { ...next, from: o.lines.find((l) => l.id === d.id)!.from, to: o.lines.find((l) => l.id === d.id)!.to };
    } else {
      const end = d.kind;
      const pts = pointsOf(line);
      const neighbour = end === "from" ? pts[1] : pts[pts.length - 2];
      // Snap in line with other lines' points; nearly straight wins.
      const snapped = snapLinePoint(d.id, move(line[end]), o);
      const pos = straighten(snapped.at, neighbour);
      const scale = viewRef.current.scale;
      // Nearest circle or text within reach (distance from its edge).
      const reach = ATTACH_DISTANCE / scale;
      const near = [
        ...o.circles.map((c) => ({ c, gap: Math.hypot(c.x - pos.x, c.y - pos.y) - c.size / 2 })),
        ...o.texts.map((t) => {
          const b = boxOf(keyOf("text", t.id), o);
          const gap = b
            ? Math.hypot(Math.max(b.minX - pos.x, 0, pos.x - b.maxX), Math.max(b.minY - pos.y, 0, pos.y - b.maxY))
            : Infinity;
          return { c: t, gap };
        }),
      ]
        .filter(({ gap }) => gap <= reach)
        .sort((a, b) => a.gap - b.gap)[0]?.c;
      setSnapGuides(near ? [] : keptGuides(snapped.lines, snapped.at, pos));
      const other: End = end === "from" ? "to" : "from";
      next = {
        ...line,
        [end]: near ? { x: near.x, y: near.y } : pos,
        [`${end}Item`]: near?.id,
        // The other end keeps its attachment.
        [other]: o.lines.find((l) => l.id === d.id)![other],
      };
    }
    setLines(() => o.lines.map((l) => (l.id === d.id ? next : l)));
  }

  // Move these things by dx, dy from where they were in `o`.
  function moveMany(keys: Key[], dx: number, dy: number, o: BoardData) {
    const move = (pt: Point) => ({ x: pt.x + dx, y: pt.y + dy });
    const cIds = idsOf(keys, "circle");
    const tIds = idsOf(keys, "text");
    const sIds = idsOf(keys, "square");
    const lIds = idsOf(keys, "line");
    const movesWithItem = (id?: number) => id !== undefined && (cIds.has(id) || tIds.has(id) || sIds.has(id));
    setBoard({
      circles: o.circles.map((c) => (cIds.has(c.id) ? { ...c, ...move(c) } : c)),
      squares: o.squares.map((q) => (sIds.has(q.id) ? { ...q, ...move(q) } : q)),
      texts: o.texts.map((t) => (tIds.has(t.id) ? { ...t, ...move(t) } : t)),
      lines: o.lines.map((l) => {
        if (!lIds.has(l.id)) return l;
        const r = resolve(l, o);
        // Ends attached to something that moves too stay attached.
        return {
          ...l,
          from: move(r.from),
          to: move(r.to),
          fromItem: movesWithItem(l.fromItem) ? l.fromItem : undefined,
          toItem: movesWithItem(l.toItem) ? l.toItem : undefined,
          bends: l.bends?.map(move),
        };
      }),
    });
  }

  function startDrag(e: React.PointerEvent, kind: DragKind, id: number, index?: number) {
    e.stopPropagation();
    setPinMenu(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    const sel = selectionRef.current;
    const itemKind: Kind | null =
      kind === "circle" || kind === "square" || kind === "text" || kind === "line" ? kind : null;
    const inSelection = itemKind !== null && sel.length > 1 && sel.includes(keyOf(itemKind, id));
    const grouped = itemKind !== null ? withGroups([keyOf(itemKind, id)]) : [];
    const many = inSelection ? sel : grouped.length > 1 ? grouped : null;
    drag.current = {
      kind,
      id,
      index,
      start: toBoard(e.clientX, e.clientY),
      orig: boardRef.current,
      many,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  }

  // Pressing on empty board starts a selection box (or, inside the box
  // around several selected things, drags them).
  function onBoardPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPinMenu(null);
    // Inside the box around several selected things: drag them all.
    const at = toBoard(e.clientX, e.clientY);
    const pad = 6 / viewRef.current.scale;
    if (groupBox && at.x >= groupBox.minX - pad && at.x <= groupBox.maxX + pad && at.y >= groupBox.minY - pad && at.y <= groupBox.maxY + pad) {
      drag.current = {
        kind: "selection",
        id: -1,
        start: at,
        orig: boardRef.current,
        many: selection,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      return;
    }
    setMarquee({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY });
  }

  function onPointerUp() {
    if (marquee) {
      const m = marquee;
      setMarquee(null);
      const small = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) < CLICK_SLOP;
      if (small) {
        // A plain click on empty board deselects everything.
        setSelection([]);
        return;
      }
      const a = toBoard(Math.min(m.x1, m.x2), Math.min(m.y1, m.y2));
      const b = toBoard(Math.max(m.x1, m.x2), Math.max(m.y1, m.y2));
      const area = { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
      setSelection(withGroups(allKeys(board).filter((k) => touches(k, area))));
      return;
    }

    const d = drag.current;
    drag.current = null;
    setSnapGuides([]);
    if (!d || d.moved) return;
    // A click without moving selects just that thing: circles and texts open
    // their menu, lines show their end dots, arrow buttons and menu. Clicking
    // a selected circle or text again deselects it.
    if (d.kind === "circle" || d.kind === "square" || d.kind === "text" || d.kind === "line") {
      const k = keyOf(d.kind, d.id);
      const grouped = withGroups([k]);
      if (grouped.length > 1) setSelection(grouped);
      else setSelection((s) => (s.length === 1 && s[0] === k && d.kind !== "line" ? [] : [k]));
    }
  }

  // The circle menu's "Text": swap the circle for an empty text in the same
  // place (same id, so attached lines stay attached) and start typing.
  function circleToText(c: Circle) {
    commit();
    setBoard((b) => ({
      ...b,
      circles: b.circles.filter((x) => x.id !== c.id),
      texts: [
        ...b.texts,
        { id: c.id, x: c.x, y: c.y, text: "", fontSize: TEXT_SIZE, color: TEXT_COLORS[0], bold: false, group: c.group },
      ],
    }));
    setSelection([]);
    editingIsNew.current = true;
    setEditing(c.id);
  }

  // The circle menu's square icon: swap the circle for a square outline in the
  // same place (same id, so attached lines stay attached), still selected.
  function circleToSquare(c: Circle) {
    commit();
    setBoard((b) => ({
      ...b,
      circles: b.circles.filter((x) => x.id !== c.id),
      squares: [...b.squares, { id: c.id, x: c.x, y: c.y, w: c.size, h: c.size, color: TEXT_COLORS[0], group: c.group }],
    }));
    setSelection([keyOf("square", c.id)]);
  }

  function updateSquare(id: number, patch: Partial<Square>) {
    commit();
    setSquares((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function confirmLineLabel(id: number, value: string) {
    setEditingLineLabel(null);
    const label = value.trim() || undefined;
    if (lines.find((l) => l.id === id)?.label !== label) updateLine(id, { label });
  }

  function confirmLabel(id: number, value: string) {
    setEditingLabel(null);
    const label = value.trim() || undefined;
    if (squares.find((q) => q.id === id)?.label !== label) updateSquare(id, { label });
  }

  function startEditing(id: number, append = "") {
    setSelection([]);
    editingIsNew.current = false;
    editingAppend.current = append;
    setEditing(id);
  }

  // Start a checklist or numbered list on the line after the text.
  function startList(t: Text, marker: string) {
    startEditing(t.id, t.text ? `\n${marker}` : marker);
  }

  // Tick or untick the checklist box on one line of a text.
  function toggleCheck(id: number, lineIndex: number) {
    const t = texts.find((x) => x.id === id);
    if (!t) return;
    const lines = t.text.split("\n");
    const line = lines[lineIndex];
    const indent = line.match(/^ */)![0];
    const box = line[indent.length] === CHECKED ? UNCHECKED : CHECKED;
    lines[lineIndex] = indent + box + line.slice(indent.length + 1);
    updateText(id, { text: lines.join("\n") });
  }

  function confirmText(id: number, value: string) {
    setEditing(null);
    // Keep the first line's indent, so only trailing space and blank leading lines go.
    const text = value.trim() ? value.replace(/^\s*\n/, "").trimEnd() : "";
    const current = texts.find((t) => t.id === id);
    if (!editingIsNew.current && current?.text !== text) commit();
    if (text) {
      setTexts((ts) => ts.map((t) => (t.id === id ? { ...t, text } : t)));
      return;
    }
    // An empty text would be invisible, so drop it.
    removeKeys([keyOf("text", id)]);
  }

  function updateText(id: number, patch: Partial<Text>) {
    commit();
    setTexts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function updateLine(id: number, patch: Partial<Line>) {
    commit();
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  // The line menu's "Angle": add a bend point in the middle of the straight
  // part of the line that was clicked (between the nearest bend and that tip).
  function addBend(l: Line) {
    const pts = pointsOf(resolve(l));
    const pressed = linePressedAt.current?.id === l.id ? linePressedAt.current.at : undefined;
    const { index, at } = newBend(pts, pressed);
    const bends = [...(l.bends ?? [])];
    bends.splice(index - 1, 0, at);
    updateLine(l.id, { bends });
  }

  // A timeline's drawn points, its tick labels and the gap between ticks.
  function timelineGeometry(l: Line) {
    const pts = drawPoints(resolve(l));
    const labels = (l.time && timelineTicks(l.time)) || [];
    const len = polylineLength(pts) || 1;
    return { pts, labels, len, spacing: labels.length > 1 ? len / (labels.length - 1) : len };
  }

  // The tick of the phase's timeline nearest this screen position.
  function phaseTickAt(sx: number, sy: number) {
    const l = lines.find((x) => x.id === phase?.lineId);
    if (!l) return 0;
    const { pts, labels, spacing } = timelineGeometry(l);
    return clamp(Math.round(distanceAlong(pts, toBoard(sx, sy)) / spacing), 0, labels.length - 1);
  }

  // Make the chosen stretch of the timeline into its own timeline, beside the
  // original and not connected to it.
  function confirmPhase() {
    if (!phase || phase.start === null) return;
    const l = lines.find((x) => x.id === phase.lineId);
    const i1 = Math.min(phase.start, phase.hover);
    const i2 = Math.max(phase.start, phase.hover);
    if (!l?.time || i1 === i2) return;
    const { pts, spacing } = timelineGeometry(l);
    // Upright timelines get the phase on their right (past the tick labels,
    // so a little further out); level ones get it above.
    const d = unit(pts[0], pts[1]);
    const upright = Math.abs(d.y) > Math.abs(d.x);
    const side = upright ? Math.sign(d.y) : d.x > 0 || (d.x === 0 && d.y <= 0) ? 1 : -1;
    const gap = upright ? PHASE_GAP_PAST_LABELS : PHASE_GAP;
    const off = offsetPolyline(subPolyline(pts, i1 * spacing, i2 * spacing), side * gap);
    const id = nextId.current++;
    commit();
    setLines((ls) => [
      ...ls,
      {
        id,
        from: off[0],
        to: off[off.length - 1],
        bends: off.length > 2 ? off.slice(1, -1) : undefined,
        time: { unit: l.time!.unit, start: tickValue(l.time!, i1), end: tickValue(l.time!, i2) },
      },
    ]);
    setPhase(null);
    setSelection([keyOf("line", id)]);
  }

  // Pin the mark under the mouse: it becomes bigger and bold, and its box
  // (bold, colours) opens.
  function confirmPin(index: number) {
    const l = lines.find((x) => x.id === phase?.lineId);
    setPhase(null);
    if (!l?.time) return;
    const value = tickValue(l.time, index);
    if (!l.pins?.some((p) => p.value === value)) {
      updateLine(l.id, { pins: [...(l.pins ?? []), { value, bold: true, color: INK }] });
    }
    setPinMenu({ lineId: l.id, value });
  }

  function updatePin(lineId: number, value: string, patch: Partial<Pin>) {
    const l = lines.find((x) => x.id === lineId);
    if (!l) return;
    updateLine(lineId, { pins: l.pins?.map((p) => (p.value === value ? { ...p, ...patch } : p)) });
  }

  // Enter confirms the phase; Escape stops choosing one.
  useEffect(() => {
    if (!phase) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter") {
        if (phase?.pin) confirmPin(phase.hover);
        else confirmPhase();
      }
      if (e.key === "Escape") setPhase(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The ruler marks for a timeline line: one tick per day/week/month/year,
  // evenly spaced along the line from its start to its end. Labels are thinned
  // out when they would overlap.
  function timelineMarks(l: Line, pts: Point[]) {
    const labels = l.time && timelineTicks(l.time);
    if (!labels) return null;
    const len = polylineLength(pts) || 1;
    const n = labels.length;
    const spacing = n > 1 ? len / (n - 1) : len;
    const labelEvery = Math.max(1, Math.ceil(TICK_LABEL_GAP / spacing));
    const tickEvery = Math.max(1, Math.ceil(3 / spacing));
    return labels.map((text, i) => {
      const isEnd = i === 0 || i === n - 1;
      const pin = l.pins?.find((p) => p.value === tickValue(l.time!, i));
      if (!pin && !isEnd && i % tickEvery !== 0) return null;
      const { p, dir } = pointAlong(pts, n > 1 ? (len * i) / (n - 1) : 0);
      // Perpendicular to the line, pointing down-ish so labels sit under it.
      let nx = -dir.y;
      let ny = dir.x;
      if (ny < 0 || (ny === 0 && nx < 0)) {
        nx = -nx;
        ny = -ny;
      }
      const labelled = !!pin || isEnd || (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2);
      // A bold pin is drawn bigger.
      const grow = pin?.bold ? PIN_GROW : 1;
      const size = (labelled ? MAJOR_TICK : TICK) * grow;
      const fontSize = TICK_LABEL_SIZE * grow;
      return (
        <g
          key={i}
          data-tick={labelled ? text : undefined}
          data-pin={pin ? text : undefined}
          // Clicking a pin opens its box.
          style={pin ? { pointerEvents: "auto", cursor: "pointer" } : undefined}
          onPointerDown={
            pin
              ? (e) => {
                  e.stopPropagation();
                  setSelection([]);
                  setPinMenu({ lineId: l.id, value: pin.value });
                }
              : undefined
          }
        >
          <line
            x1={p.x - nx * size}
            y1={p.y - ny * size}
            x2={p.x + nx * size}
            y2={p.y + ny * size}
            stroke={pin?.color ?? l.color ?? INK}
            strokeWidth={(labelled ? 1.5 : 1) * grow}
          />
          {labelled && (
            <text
              x={p.x + nx * (size + fontSize)}
              y={p.y + ny * (size + fontSize)}
              fontSize={fontSize}
              fontWeight={pin?.bold ? 700 : 400}
              fill={pin?.color ?? l.color ?? "#57534e"}
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
  const single = selection.length === 1 ? selection[0] : null;
  const singleId = single ? Number(single.split(":")[1]) : null;
  const menuCircle = single?.startsWith("circle:") ? circles.find((c) => c.id === singleId) : undefined;
  const menuSquare = single?.startsWith("square:") ? squares.find((q) => q.id === singleId) : undefined;
  const selectedLine = single?.startsWith("line:") ? lines.find((l) => l.id === singleId) : undefined;
  const groupBox =
    selection.length > 1 ? mergeBoxes(selection.map((k) => boxOf(k)).filter((b): b is Box => !!b)) : null;
  groupBoxRef.current = groupBox;
  // Whether the selection is exactly one group (then the button ungroups).
  const groupOf = (k: Key) => {
    const [kind, idStr] = k.split(":");
    const list: { id: number; group?: number }[] =
      kind === "circle" ? circles : kind === "square" ? squares : kind === "text" ? texts : lines;
    return list.find((x) => x.id === Number(idStr))?.group;
  };
  const isOneGroup =
    selection.length > 1 &&
    groupOf(selection[0]) !== undefined &&
    selection.every((k) => groupOf(k) === groupOf(selection[0])) &&
    withGroups(selection, board).length === selection.length;
  const arrowheadFor = (l: Line) => `url(#arrowhead-${Math.max(0, TEXT_COLORS.indexOf(l.color ?? INK))})`;
  const toPolyline = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const px = (n: number) => n / view.scale; // a size in screen pixels, in board units

  return (
    <div
      ref={rootRef}
      // overflow-clip (not hidden): focusing a field in a menu must not scroll the board.
      className="fixed inset-0 touch-none select-none overflow-clip bg-white"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        setMarquee(null);
      }}
      onPointerDown={onBoardPointerDown}
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
            boxShadow: `0 0 0 ${px(1)}px rgb(0 0 0 / 0.12)`,
            backgroundImage: `radial-gradient(circle, rgb(0 0 0 / ${dotAlpha}) 1px, transparent 1.2px)`,
            backgroundSize: `${DOT_SPACING}px ${DOT_SPACING}px`,
          }}
        />

        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={BOARD_W}
          height={BOARD_H}
        >
          <defs>
            {/* One arrowhead per line colour. */}
            {TEXT_COLORS.map((color, i) => (
              <marker
                key={color}
                id={`arrowhead-${i}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={color} />
              </marker>
            ))}
          </defs>
          {lines.map((l) => resolve(l)).map((l) => {
            const pts = drawPoints(l);
            const isSelected = selection.includes(keyOf("line", l.id));
            return (
              <g key={l.id}>
                {isSelected && selection.length > 1 && (
                  <polyline
                    points={toPolyline(pts)}
                    fill="none"
                    stroke={SELECT_BLUE}
                    strokeOpacity={0.35}
                    strokeWidth={px(6)}
                    strokeLinejoin="round"
                  />
                )}
                <polyline
                  data-line="line"
                  points={toPolyline(pts)}
                  fill="none"
                  stroke={l.color ?? INK}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerStart={l.fromArrow ? arrowheadFor(l) : undefined}
                  markerEnd={l.toArrow ? arrowheadFor(l) : undefined}
                />
                {timelineMarks(l, pts)}
                {/* Wider invisible stroke so the line is easy to grab. */}
                <polyline
                  data-line-hit={l.id}
                  points={toPolyline(pts)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={px(14)}
                  className="cursor-grab active:cursor-grabbing"
                  style={{ pointerEvents: "stroke" }}
                  onPointerDown={(e) => {
                    linePressedAt.current = { id: l.id, at: toBoard(e.clientX, e.clientY) };
                    startDrag(e, "line", l.id);
                  }}
                />
              </g>
            );
          })}
          {phase &&
            (() => {
              const l = lines.find((x) => x.id === phase.lineId);
              if (!l) return null;
              const { pts, spacing } = timelineGeometry(l);
              const at = pointAlong(pts, phase.hover * spacing).p;
              const lo = Math.min(phase.start ?? phase.hover, phase.hover) * spacing;
              const hi = Math.max(phase.start ?? phase.hover, phase.hover) * spacing;
              return (
                <g data-phase-preview>
                  {hi > lo && (
                    <polyline
                      points={toPolyline(subPolyline(pts, lo, hi))}
                      fill="none"
                      stroke={PHASE_ORANGE}
                      strokeWidth={4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  <circle cx={at.x} cy={at.y} r={px(5)} fill={PHASE_ORANGE} />
                </g>
              );
            })()}
          {draft && (
            <line
              data-line="draft"
              x1={draft.from.x}
              y1={draft.from.y}
              x2={draft.to.x}
              y2={draft.to.y}
              stroke={INK}
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
            style={{
              width: c.size,
              height: c.size,
              left: c.x - c.size / 2,
              top: c.y - c.size / 2,
              boxShadow:
                selection.length > 1 && selection.includes(keyOf("circle", c.id))
                  ? `0 0 0 ${px(3)}px rgb(59 130 246 / 0.35)`
                  : undefined,
            }}
          />
        ))}

        {squares.map((q) => {
          const inGroup = selection.length > 1 && selection.includes(keyOf("square", q.id));
          const labelStyle = { fontSize: squareLabelSize(Math.min(q.w, q.h)), color: q.color, lineHeight: 1.2 };
          return (
            <div
              key={q.id}
              className="pointer-events-none absolute"
              style={{ left: q.x - q.w / 2, top: q.y - q.h / 2, width: q.w, height: q.h }}
            >
              <svg className="absolute inset-0 overflow-visible" width={q.w} height={q.h}>
                {inGroup && (
                  <rect width={q.w} height={q.h} fill="none" stroke={SELECT_BLUE} strokeOpacity={0.35} strokeWidth={px(6)} />
                )}
                <rect x={1} y={1} width={q.w - 2} height={q.h - 2} fill="none" stroke={q.color} strokeWidth={2} />
                {/* Only the outline can be grabbed, not the space inside. */}
                <rect
                  data-square={q.id}
                  width={q.w}
                  height={q.h}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={px(12)}
                  className="cursor-grab active:cursor-grabbing"
                  style={{ pointerEvents: "stroke" }}
                  onPointerDown={(e) => startDrag(e, "square", q.id)}
                />
              </svg>
              {/* The label sits on the outside of the top left corner. */}
              <div className="absolute bottom-full left-0" style={{ marginBottom: Math.min(q.w, q.h) * 0.04 }}>
                {editingLabel === q.id ? (
                  <div className="pointer-events-auto">
                    <TextEditor
                      initial={q.label ?? ""}
                      style={labelStyle}
                      onConfirm={(value) => confirmLabel(q.id, value)}
                    />
                  </div>
                ) : (
                  q.label && (
                    <div data-square-label={q.id} className="whitespace-pre px-1" style={labelStyle}>
                      {q.label}
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}

        {/* Guide lines while a square snaps, drawn above the squares and a
            little past them. */}
        {snapGuides.length > 0 && (
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={BOARD_W} height={BOARD_H}>
            {snapGuides.map((g, i) => {
              const d = unit(g.a, g.b);
              const ext = px(12);
              return (
                <line
                  key={i}
                  data-snap-guide
                  x1={g.a.x - d.x * ext}
                  y1={g.a.y - d.y * ext}
                  x2={g.b.x + d.x * ext}
                  y2={g.b.y + d.y * ext}
                  stroke={SNAP_PINK}
                  strokeWidth={px(1)}
                />
              );
            })}
          </svg>
        )}

        {/* Text in the middle of lines. Drag it to move the line; double-click
            to edit it. */}
        {lines.map((line) => {
          if (!line.label && editingLineLabel !== line.id) return null;
          const pts = drawPoints(resolve(line));
          const mid = pointAlong(pts, polylineLength(pts) / 2).p;
          const style = { fontSize: LINE_LABEL_SIZE, color: INK, lineHeight: 1.2, textAlign: "center" as const };
          return (
            <div
              key={line.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: mid.x, top: mid.y }}
            >
              {editingLineLabel === line.id ? (
                <TextEditor
                  initial={line.label ?? ""}
                  style={style}
                  onConfirm={(value) => confirmLineLabel(line.id, value)}
                />
              ) : (
                <div
                  data-line-label={line.id}
                  onPointerDown={(e) => startDrag(e, "line", line.id)}
                  onDoubleClick={() => {
                    setSelection([]);
                    setEditingLineLabel(line.id);
                  }}
                  className="cursor-grab whitespace-pre bg-white px-1 active:cursor-grabbing"
                  style={style}
                >
                  {line.label}
                </div>
              )}
            </div>
          );
        })}

        {texts.map((t) => {
          const isEditing = editing === t.id;
          const showMenu = single === keyOf("text", t.id);
          const inGroup = selection.length > 1 && selection.includes(keyOf("text", t.id));
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
                  initial={t.text + editingAppend.current}
                  style={style}
                  lists
                  onConfirm={(value) => confirmText(t.id, value)}
                />
              ) : (
                <div
                  data-text={t.id}
                  onPointerDown={(e) => startDrag(e, "text", t.id)}
                  onDoubleClick={() => startEditing(t.id)}
                  className="cursor-grab whitespace-pre bg-white px-1 active:cursor-grabbing"
                  style={{
                    ...style,
                    boxShadow: inGroup ? `0 0 0 ${px(2)}px rgb(59 130 246 / 0.35)` : undefined,
                  }}
                >
                  {t.text.split("\n").map((full, i) => {
                    const indent = full.match(/^ */)![0];
                    const line = full.slice(indent.length);
                    const box = line[0] === UNCHECKED || line[0] === CHECKED;
                    return (
                      <Fragment key={i}>
                        {i > 0 && "\n"}
                        {indent}
                        {box ? (
                          <>
                            <span
                              data-checkbox
                              onPointerDown={(e) => e.stopPropagation()}
                              onDoubleClick={(e) => e.stopPropagation()}
                              onClick={() => toggleCheck(t.id, i)}
                              className="relative inline-block cursor-pointer rounded-[0.12em] align-[-0.1em]"
                              style={{
                                width: "0.85em",
                                height: "0.85em",
                                marginRight: "0.3em",
                                border: `0.09em solid ${t.color}`,
                              }}
                            >
                              {line[0] === CHECKED && <CheckMark color={t.color} />}
                            </span>
                            {line.slice(1).replace(/^ /, "")}
                          </>
                        ) : (
                          line
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              )}

              {sizeShownFor === t.id && (
                <div
                  data-size-label
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-stone-900 px-1.5 py-0.5 text-white"
                  style={{ bottom: "100%", marginBottom: px(6), fontSize: px(12) }}
                >
                  {Math.round(t.fontSize)}px
                </div>
              )}

              {showMenu && (
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
                  <div className="flex gap-1">
                    <button
                      aria-label="Checklist"
                      onClick={() => startList(t, `${UNCHECKED} `)}
                      className="flex items-center rounded px-2 py-1 hover:bg-stone-100"
                    >
                      <ChecklistIcon />
                    </button>
                    <button
                      onClick={() => startList(t, "1. ")}
                      className="rounded px-2 py-1 text-sm hover:bg-stone-100"
                    >
                      1.2.3.
                    </button>
                  </div>
                  <button
                    onClick={() => updateText(t.id, { bold: !t.bold })}
                    className={`rounded px-2 py-1 text-left text-sm font-bold ${t.bold ? "bg-stone-200" : "hover:bg-stone-100"}`}
                  >
                    Bold
                  </button>
                  <LinkButton />
                </div>
              )}
            </div>
          );
        })}

        {/* Handles for the selected line sit above circles so an attached end
            can still be grabbed. */}
        {selectedLine &&
          (() => {
            const l = resolve(selectedLine);
            const pts = pointsOf(l);
            return (
              <>
                {/* The menu goes underneath the handles so it never hides an end. */}
                <div
                  className="absolute"
                  style={(() => {
                    const mid = pointAlong(pts, polylineLength(pts) / 2).p;
                    return { left: mid.x + 12, top: mid.y + 12 };
                  })()}
                >
                  <LineMenu
                    key={l.id}
                    time={l.time}
                    onDone={(time) => {
                      updateLine(l.id, { time });
                      setSelection([]);
                    }}
                    onAngle={() => addBend(selectedLine)}
                    onText={() => {
                      setSelection([]);
                      setEditingLineLabel(l.id);
                    }}
                  />
                </div>
                <svg
                  className="pointer-events-none absolute left-0 top-0 overflow-visible"
                  width={BOARD_W}
                  height={BOARD_H}
                >
                  {(l.bends ?? []).map((p, i) => (
                    <rect
                      key={`bend-${i}`}
                      data-line-bend={i}
                      x={p.x - px(5)}
                      y={p.y - px(5)}
                      width={px(10)}
                      height={px(10)}
                      transform={`rotate(45 ${p.x} ${p.y})`}
                      fill="white"
                      stroke={INK}
                      strokeWidth={px(1.5)}
                      className="pointer-events-auto cursor-move"
                      onPointerDown={(e) => startDrag(e, "bend", l.id, i)}
                    />
                  ))}
                  {(["from", "to"] as const).map((end) => (
                    <circle
                      key={end}
                      data-line-end={end}
                      data-attached={l[`${end}Item`] !== undefined ? "yes" : "no"}
                      cx={l[end].x}
                      cy={l[end].y}
                      r={px(6)}
                      fill="white"
                      stroke={INK}
                      strokeWidth={px(1.5)}
                      className="pointer-events-auto cursor-move"
                      onPointerDown={(e) => startDrag(e, end, l.id)}
                    />
                  ))}
                </svg>

                {/* Arrow buttons just beyond each end: click to give that end
                    an arrowhead (click again to remove it). */}
                {(["from", "to"] as const).map((end) => {
                  const tip = end === "from" ? pts[0] : pts[pts.length - 1];
                  const prev = end === "from" ? pts[1] : pts[pts.length - 2];
                  const d = unit(prev, tip);
                  const at = { x: tip.x + d.x * px(26), y: tip.y + d.y * px(26) };
                  const on = !!l[`${end}Arrow`];
                  return (
                    <button
                      key={end}
                      data-arrow-toggle={end}
                      aria-label={`Arrow at ${end === "from" ? "start" : "end"}`}
                      aria-pressed={on}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => updateLine(l.id, { [`${end}Arrow`]: !on })}
                      className={`absolute flex items-center justify-center rounded-full border shadow-sm ${
                        on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700"
                      }`}
                      style={{
                        width: px(22),
                        height: px(22),
                        left: at.x - px(11),
                        top: at.y - px(11),
                      }}
                    >
                      <svg
                        width="70%"
                        height="70%"
                        viewBox="0 0 16 16"
                        style={{ transform: `rotate(${Math.atan2(d.y, d.x)}rad)` }}
                      >
                        <path d="M2 8 H12 M8 4 L12 8 L8 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  );
                })}

              </>
            );
          })()}

        {selectedLine &&
          !phase &&
          (() => {
            const { pts, labels, len } = timelineGeometry(selectedLine);
            if (labels.length < 2) return null;
            const at = pointAlong(pts, len / 3).p;
            return (
              <div
                data-menu="phase"
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute flex -translate-x-1/2 -translate-y-full flex-col rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
                style={{ left: at.x, top: at.y - px(14) }}
              >
                <button
                  onClick={() => {
                    setSelection([]);
                    setPhase({ lineId: selectedLine.id, start: null, hover: 0 });
                  }}
                  className="w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100"
                >
                  Phase
                </button>
                <div className="flex gap-1.5 px-2 py-1.5">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      aria-label={`Colour ${color}`}
                      onClick={() => updateLine(selectedLine.id, { color })}
                      className={`size-5 rounded-full ${(selectedLine.color ?? INK) === color ? "ring-2 ring-stone-400 ring-offset-1" : ""}`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => {
                    setSelection([]);
                    setPhase({ lineId: selectedLine.id, start: null, hover: 0, pin: true });
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-stone-100"
                >
                  <PinIcon />
                  Pin
                </button>
              </div>
            );
          })()}

        {pinMenu &&
          (() => {
            const l = lines.find((x) => x.id === pinMenu.lineId);
            const pin = l?.pins?.find((p) => p.value === pinMenu.value);
            if (!l?.time || !pin) return null;
            const { pts, labels, spacing } = timelineGeometry(l);
            const i = labels.findIndex((_, j) => tickValue(l.time!, j) === pin.value);
            if (i < 0) return null;
            const at = pointAlong(pts, i * spacing).p;
            return (
              <div
                data-menu="pin"
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute flex -translate-x-1/2 items-center gap-2 rounded-lg border border-stone-200 bg-white p-2 shadow-lg"
                style={{ left: at.x, top: at.y + MAJOR_TICK * PIN_GROW + TICK_LABEL_SIZE * PIN_GROW * 2 + px(8) }}
              >
                <button
                  aria-label="Bold"
                  aria-pressed={pin.bold}
                  onClick={() => updatePin(l.id, pin.value, { bold: !pin.bold })}
                  className={`size-6 rounded text-sm font-bold ${pin.bold ? "bg-stone-200" : "hover:bg-stone-100"}`}
                >
                  B
                </button>
                <div className="flex gap-1.5">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      aria-label={`Colour ${color}`}
                      onClick={() => updatePin(l.id, pin.value, { color })}
                      className={`size-5 rounded-full ${pin.color === color ? "ring-2 ring-stone-400 ring-offset-1" : ""}`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

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
            <button
              onClick={() => circleToSquare(menuCircle)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-stone-100"
            >
              <SquareIcon />
              Square
            </button>
            <LinkButton />
          </div>
        )}

        {menuSquare &&
          [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([sx, sy], i) => (
            <div
              key={i}
              data-square-corner={i}
              onPointerDown={(e) => startDrag(e, "corner", menuSquare.id, i)}
              className={`absolute border border-stone-900 bg-white ${sx === sy ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
              style={{
                width: px(10),
                height: px(10),
                borderWidth: px(1.5),
                left: menuSquare.x + (sx * menuSquare.w) / 2 - px(5),
                top: menuSquare.y + (sy * menuSquare.h) / 2 - px(5),
              }}
            />
          ))}

        {menuSquare && (
          <div
            data-menu="square"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute flex min-w-40 flex-col gap-1 rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
            style={{ left: menuSquare.x + menuSquare.w / 2 + 8 + px(8), top: menuSquare.y - menuSquare.h / 2 }}
          >
            <div className="flex gap-1.5 px-1 py-1">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  aria-label={`Colour ${color}`}
                  onClick={() => updateSquare(menuSquare.id, { color })}
                  className={`size-5 rounded-full ${menuSquare.color === color ? "ring-2 ring-stone-400 ring-offset-1" : ""}`}
                  style={{ background: color }}
                />
              ))}
            </div>
            <button
              onClick={() => {
                setSelection([]);
                setEditingLabel(menuSquare.id);
              }}
              className="w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100"
            >
              Text
            </button>
            <LinkButton />
          </div>
        )}

        {groupBox && (
          <div
            data-group-box
            className="pointer-events-none absolute border-dashed"
            style={{
              left: groupBox.minX - px(6),
              top: groupBox.minY - px(6),
              width: groupBox.maxX - groupBox.minX + px(12),
              height: groupBox.maxY - groupBox.minY + px(12),
              borderWidth: px(1.5),
              borderColor: SELECT_BLUE,
            }}
          />
        )}
        {groupBox && (
          // Beside the selection box; stays the same size on screen.
          <button
            data-group-button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggleGroup(isOneGroup)}
            className="absolute origin-top-left rounded-md border border-stone-200 bg-white px-2 py-1 text-sm shadow"
            style={{
              left: groupBox.maxX + px(12),
              top: groupBox.minY - px(6),
              transform: `scale(${1 / view.scale})`,
            }}
          >
            {isOneGroup ? "Ungroup" : "Group"}
          </button>
        )}
      </div>

      {selection.length > 1 && (
        <button
          data-preset-button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={savePreset}
          className="absolute right-4 top-4 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium shadow"
        >
          {presetSaved ? "Preset saved" : "Preset"}
        </button>
      )}

      {phase && (
        // While choosing a phase: move along the timeline, click to start,
        // click again (or Enter) to finish. Escape stops.
        <div
          data-phase-overlay
          className="absolute inset-0 cursor-crosshair"
          onPointerMove={(e) => setPhase({ ...phase, hover: phaseTickAt(e.clientX, e.clientY) })}
          onPointerDown={(e) => {
            e.stopPropagation();
            const hover = phaseTickAt(e.clientX, e.clientY);
            if (phase.pin) confirmPin(hover);
            else if (phase.start === null) setPhase({ ...phase, start: hover, hover });
            else confirmPhase();
          }}
        />
      )}

      {marquee && (
        <div
          data-marquee
          className="pointer-events-none absolute border border-blue-500 bg-blue-500/10"
          style={{
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
          }}
        />
      )}
    </div>
  );
}

// The text typed so far on the caret's line, up to the caret.
function textBeforeCaret(el: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const range = document.createRange();
  range.setStart(el, 0);
  range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  let text = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    else if (node.nodeName === "BR") text += "\n";
    else node.childNodes.forEach(walk);
  };
  walk(range.cloneContents());
  return text.slice(text.lastIndexOf("\n") + 1);
}

// The text being typed. Enter starts a new line; clicking elsewhere confirms it.
// Tab moves the caret's line right and Shift+Tab moves it back. With `lists`, Enter on a checklist line starts the next line with a box, and
// on a numbered line with the next number. Enter on a line holding only the
// box or number ends the list.
function TextEditor({
  initial,
  style,
  lists = false,
  onConfirm,
}: {
  initial: string;
  style: React.CSSProperties;
  lists?: boolean;
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
        if (e.key === "Tab") {
          e.preventDefault();
          const before = textBeforeCaret(e.currentTarget);
          const sel = window.getSelection()!;
          // Step to the start of the line, add or remove the indent there, then
          // step back to where the caret was.
          const moveCaret = (dir: "backward" | "forward", n: number) => {
            for (let i = 0; i < n; i++) sel.modify("move", dir, "character");
          };
          moveCaret("backward", before.length);
          if (!e.shiftKey) {
            document.execCommand("insertText", false, INDENT);
            moveCaret("forward", before.length);
            return;
          }
          const remove = Math.min(before.match(/^ */)![0].length, INDENT.length);
          for (let i = 0; i < remove; i++) document.execCommand("forwardDelete");
          moveCaret("forward", before.length - remove);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const full = lists ? textBeforeCaret(e.currentTarget) : "";
          const indent = full.match(/^ */)![0];
          const line = full.slice(indent.length);
          const number = line.match(/^(\d+)\. /);
          const marker = /^[☐☑] /.test(line) ? `${UNCHECKED} ` : number ? `${Number(number[1]) + 1}. ` : "";
          if (marker && line === (number ? number[0] : line.slice(0, 2))) {
            // An empty list line: remove its box or number to end the list.
            for (let i = 0; i < line.length; i++) document.execCommand("delete");
            return;
          }
          document.execCommand("insertLineBreak");
          // A list line keeps its indent on the next line.
          if (marker) document.execCommand("insertText", false, indent + marker);
        }
      }}
      onBlur={(e) => onConfirm(e.currentTarget.innerText)}
      className="min-w-[1ch] cursor-text whitespace-pre bg-white px-1 outline-none"
      style={{ ...style, userSelect: "text", caretColor: style.color }}
    />
  );
}
