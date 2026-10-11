"use client";

import { useEffect, useRef, useState } from "react";
import {
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
import { LineMenu } from "./LineMenu";
import { timelineTicks, type Timeline } from "./timeline";

type View = { x: number; y: number; scale: number };
// `group`: things grouped together share a group number and are selected
// and moved as one.
type Circle = { id: number; x: number; y: number; size: number; group?: number };
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
  group?: number;
};
type End = "from" | "to";
// Everything on the board. Kept as one object so every change can be undone
// (and, later, saved) in one piece.
type BoardData = { circles: Circle[]; texts: Text[]; lines: Line[] };
type Kind = "circle" | "text" | "line";
// Selected things, as "circle:3", "text:7", "line:2".
type Key = `${Kind}:${number}`;
// "selection": pressing inside the selection box, on empty board.
type DragKind = Kind | End | "bend" | "selection";

const CIRCLE_SIZE = 64;
const MIN_CIRCLE = 8;
const MAX_CIRCLE = 2000;
const TEXT_SIZE = 24;
const MIN_TEXT = 6;
const MAX_TEXT = 800;
const TEXT_COLORS = ["#1c1917", "#78716c", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#9333ea"];
const INK = "#1c1917";
const SELECT_BLUE = "#3b82f6";
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
const keyOf = (kind: Kind, id: number): Key => `${kind}:${id}`;
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
// - The circle menu's "Text" turns the circle into text, ready to type. Enter or
//   clicking elsewhere confirms. Double-click text to edit it again.
// - Click a line to show dots on its ends (drag to move each end), arrow
//   buttons beside its ends (click to give that end an arrowhead) and its menu:
//   "Time" turns it into a timeline, "Angle" adds a bend point you can drag.
//   Drop an end near a circle and it attaches, following it when it moves.
// - Backspace deletes whatever is selected; Ctrl+Z / Cmd+Z undoes any change.
export function Board() {
  const [board, setBoard] = useState<BoardData>({ circles: [], texts: [], lines: [] });
  const { circles, texts, lines } = board;
  const setCircles = (f: (cs: Circle[]) => Circle[]) => setBoard((b) => ({ ...b, circles: f(b.circles) }));
  const setTexts = (f: (ts: Text[]) => Text[]) => setBoard((b) => ({ ...b, texts: f(b.texts) }));
  const setLines = (f: (ls: Line[]) => Line[]) => setBoard((b) => ({ ...b, lines: f(b.lines) }));

  const [selection, setSelection] = useState<Key[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
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
  const lastResizeAt = useRef(0);
  // Whether the text being edited was just made from a circle (that change
  // is already in the undo history).
  const editingIsNew = useRef(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<Point | null>(null);
  // What is being dragged and how the board was when the drag began.
  const drag = useRef<{
    kind: DragKind;
    id: number;
    bendIndex?: number;
    start: Point; // board position where the drag began
    orig: BoardData;
    many: Key[] | null; // set when dragging several things together
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const nextId = useRef(1);
  // What Ctrl+C copied, ready for Ctrl+V.
  const clipboard = useRef<BoardData | null>(null);
  // Groups of things saved with the Preset button, to be added later on.
  const presets = useRef<BoardData[]>([]);
  const [presetSaved, setPresetSaved] = useState(false);

  // Remember the board as it is now, so the next change can be undone.
  function commit() {
    history.current.push(boardRef.current);
    if (history.current.length > MAX_UNDO) history.current.shift();
  }

  // Screen position -> board position.
  function toBoard(sx: number, sy: number): Point {
    const v = viewRef.current;
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
  }

  function itemPos(id: number | undefined, data: BoardData = board): Point | undefined {
    const item = data.circles.find((c) => c.id === id) ?? data.texts.find((t) => t.id === id);
    return item && { x: item.x, y: item.y };
  }

  // The line with attached ends moved to their items' centres.
  function resolve(l: Line, data: BoardData = board): Line {
    return { ...l, from: itemPos(l.fromItem, data) ?? l.from, to: itemPos(l.toItem, data) ?? l.to };
  }

  const pointsOf = (l: Line): Point[] => [l.from, ...(l.bends ?? []), l.to];

  // For drawing: an end attached to a circle stops at the circle's edge, so an
  // arrowhead there is visible.
  function drawPoints(l: Line): Point[] {
    const pts = pointsOf(l);
    const trim = (end: End) => {
      const c = circles.find((c) => c.id === l[`${end}Item`]);
      if (!c) return;
      const i = end === "from" ? 0 : pts.length - 1;
      const neighbour = pts[end === "from" ? 1 : pts.length - 2];
      const d = unit(pts[i], neighbour);
      pts[i] = { x: pts[i].x + d.x * (c.size / 2), y: pts[i].y + d.y * (c.size / 2) };
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
    const lIds = idsOf(keys, "line");
    const kept = (id?: number) => (id !== undefined && (cIds.has(id) || tIds.has(id)) ? id : undefined);
    return structuredClone({
      circles: data.circles.filter((c) => cIds.has(c.id)),
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
    const lIds = idsOf(sel, "line");
    const group = isGroup ? undefined : nextId.current++;
    commit();
    setBoard((b) => ({
      circles: b.circles.map((c) => (cIds.has(c.id) ? { ...c, group } : c)),
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
    for (const c of data.circles) if (cIds.has(c.id)) f = clamp(c.size * f, MIN_CIRCLE, MAX_CIRCLE) / c.size;
    for (const t of data.texts) if (tIds.has(t.id)) f = clamp(t.fontSize * f, MIN_TEXT, MAX_TEXT) / t.fontSize;
    const scalePt = (p: Point) => (single ? p : { x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f });

    setBoard((b) => ({
      circles: b.circles.map((c) => (cIds.has(c.id) ? { ...c, ...scalePt(c), size: c.size * f } : c)),
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
    const lIds = idsOf(keys, "line");
    setBoard((b) => {
      const gone = (id?: number) => id !== undefined && (cIds.has(id) || tIds.has(id));
      return {
        circles: b.circles.filter((c) => !cIds.has(c.id)),
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
        texts: [...b.texts, ...texts],
        lines: [...b.lines, ...lines],
      }));
      setSelection([
        ...circles.map((c) => keyOf("circle", c.id)),
        ...texts.map((t) => keyOf("text", t.id)),
        ...lines.map((l) => keyOf("line", l.id)),
      ]);
      setEditing(null);
    }

    function undo() {
      const prev = history.current.pop();
      if (!prev) return;
      setBoard(prev);
      // Keep selected whatever still exists, so its menu stays open.
      const exists = new Set<Key>([
        ...prev.circles.map((c) => keyOf("circle", c.id)),
        ...prev.texts.map((t) => keyOf("text", t.id)),
        ...prev.lines.map((l) => keyOf("line", l.id)),
      ]);
      setSelection((s) => s.filter((k) => exists.has(k)));
      setEditing(null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (typing(e)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
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
      commit();
      setLines((ls) => [...ls, { id: nextId.current++, from: d.from, to: d.to }]);
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
      setDraft((dr) => (dr ? { ...dr, to } : dr));
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

    // Several things selected: move them all together.
    if (d.many) {
      const cIds = idsOf(d.many, "circle");
      const tIds = idsOf(d.many, "text");
      const lIds = idsOf(d.many, "line");
      const movesWithItem = (id?: number) => id !== undefined && (cIds.has(id) || tIds.has(id));
      setBoard({
        circles: o.circles.map((c) => (cIds.has(c.id) ? { ...c, ...move(c) } : c)),
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
      return;
    }

    if (d.kind === "circle" || d.kind === "text") {
      const list = d.kind === "circle" ? o.circles : o.texts;
      const it = list.find((x) => x.id === d.id)!;
      const moveOne = <T extends { id: number; x: number; y: number }>(items: T[]) =>
        items.map((x) => (x.id === d.id ? { ...x, x: it.x + dx, y: it.y + dy } : x));
      if (d.kind === "circle") setCircles(moveOne);
      else setTexts(moveOne);
      return;
    }

    if (d.kind === "selection") return;
    const line = resolve(o.lines.find((l) => l.id === d.id)!, o);
    let next: Line;
    if (d.kind === "line") {
      // Moving the whole line takes it off anything it was attached to.
      next = {
        ...line,
        from: move(line.from),
        to: move(line.to),
        fromItem: undefined,
        toItem: undefined,
        bends: line.bends?.map(move),
      };
    } else if (d.kind === "bend") {
      next = { ...line, bends: line.bends!.map((p, i) => (i === d.bendIndex ? move(p) : p)) };
      // Keep attached ends attached.
      next = { ...next, from: o.lines.find((l) => l.id === d.id)!.from, to: o.lines.find((l) => l.id === d.id)!.to };
    } else {
      const end = d.kind;
      const pos = move(line[end]);
      const scale = viewRef.current.scale;
      const near = o.circles
        .map((c) => ({ c, dist: Math.hypot(c.x - pos.x, c.y - pos.y) }))
        .filter(({ c, dist }) => dist <= c.size / 2 + ATTACH_DISTANCE / scale)
        .sort((a, b) => a.dist - b.dist)[0]?.c;
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

  function startDrag(e: React.PointerEvent, kind: DragKind, id: number, bendIndex?: number) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const sel = selectionRef.current;
    const itemKind: Kind | null = kind === "circle" || kind === "text" || kind === "line" ? kind : null;
    const inSelection = itemKind !== null && sel.length > 1 && sel.includes(keyOf(itemKind, id));
    const grouped = itemKind !== null ? withGroups([keyOf(itemKind, id)]) : [];
    const many = inSelection ? sel : grouped.length > 1 ? grouped : null;
    drag.current = {
      kind,
      id,
      bendIndex,
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
      const all: Key[] = [
        ...circles.map((c) => keyOf("circle", c.id)),
        ...texts.map((t) => keyOf("text", t.id)),
        ...lines.map((l) => keyOf("line", l.id)),
      ];
      setSelection(withGroups(all.filter((k) => touches(k, area))));
      return;
    }

    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // A click without moving selects just that thing: circles and texts open
    // their menu, lines show their end dots, arrow buttons and menu. Clicking
    // a selected circle or text again deselects it.
    if (d.kind === "circle" || d.kind === "text" || d.kind === "line") {
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
      texts: [...b.texts, { id: c.id, x: c.x, y: c.y, text: "", fontSize: TEXT_SIZE, color: TEXT_COLORS[0], bold: false }],
    }));
    setSelection([]);
    editingIsNew.current = true;
    setEditing(c.id);
  }

  function startEditing(id: number) {
    setSelection([]);
    editingIsNew.current = false;
    setEditing(id);
  }

  function confirmText(id: number, value: string) {
    setEditing(null);
    const text = value.replace(/\n/g, " ").trim();
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

  // The line menu's "Angle": add a bend point in the middle of the longest
  // straight part of the line.
  function addBend(l: Line) {
    const pts = pointsOf(resolve(l));
    const { index, at } = newBend(pts);
    const bends = [...(l.bends ?? [])];
    bends.splice(index - 1, 0, at);
    updateLine(l.id, { bends });
  }

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
      if (!isEnd && i % tickEvery !== 0) return null;
      const { p, dir } = pointAlong(pts, n > 1 ? (len * i) / (n - 1) : 0);
      // Perpendicular to the line, pointing down-ish so labels sit under it.
      let nx = -dir.y;
      let ny = dir.x;
      if (ny < 0 || (ny === 0 && nx < 0)) {
        nx = -nx;
        ny = -ny;
      }
      const labelled = isEnd || (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2);
      const size = labelled ? MAJOR_TICK : TICK;
      return (
        <g key={i} data-tick={labelled ? text : undefined}>
          <line
            x1={p.x - nx * size}
            y1={p.y - ny * size}
            x2={p.x + nx * size}
            y2={p.y + ny * size}
            stroke={INK}
            strokeWidth={labelled ? 1.5 : 1}
          />
          {labelled && (
            <text
              x={p.x + nx * (MAJOR_TICK + TICK_LABEL_SIZE)}
              y={p.y + ny * (MAJOR_TICK + TICK_LABEL_SIZE)}
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
  const single = selection.length === 1 ? selection[0] : null;
  const singleId = single ? Number(single.split(":")[1]) : null;
  const menuCircle = single?.startsWith("circle:") ? circles.find((c) => c.id === singleId) : undefined;
  const selectedLine = single?.startsWith("line:") ? lines.find((l) => l.id === singleId) : undefined;
  const groupBox =
    selection.length > 1 ? mergeBoxes(selection.map((k) => boxOf(k)).filter((b): b is Box => !!b)) : null;
  groupBoxRef.current = groupBox;
  // Whether the selection is exactly one group (then the button ungroups).
  const groupOf = (k: Key) => {
    const [kind, idStr] = k.split(":");
    const list: { id: number; group?: number }[] = kind === "circle" ? circles : kind === "text" ? texts : lines;
    return list.find((x) => x.id === Number(idStr))?.group;
  };
  const isOneGroup =
    selection.length > 1 &&
    groupOf(selection[0]) !== undefined &&
    selection.every((k) => groupOf(k) === groupOf(selection[0])) &&
    withGroups(selection, board).length === selection.length;
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
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={INK} />
            </marker>
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
                  stroke={INK}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerStart={l.fromArrow ? "url(#arrowhead)" : undefined}
                  markerEnd={l.toArrow ? "url(#arrowhead)" : undefined}
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
                  onPointerDown={(e) => startDrag(e, "line", l.id)}
                />
              </g>
            );
          })}
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
                  initial={t.text}
                  style={style}
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
                  {t.text}
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

        {/* Handles for the selected line sit above circles so an attached end
            can still be grabbed. */}
        {selectedLine &&
          (() => {
            const l = resolve(selectedLine);
            const pts = pointsOf(l);
            return (
              <>
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
                  />
                </div>
              </>
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
