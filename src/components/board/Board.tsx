"use client";

import { Fragment, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  ATTACH_DISTANCE,
  BRACKET_CURL,
  BOARD_H,
  BOARD_W,
  CHECKED,
  CIRCLE_SIZE,
  CLICK_SLOP,
  DOT_SPACING,
  INK,
  LINE_WIDTH,
  LINE_WIDTHS,
  LINE_LABEL_SIZE,
  MAJOR_TICK,
  NOW_RED,
  MAX_CIRCLE,
  MAX_PICTURE,
  MAX_SCALE,
  MAX_TEXT,
  MAX_UNDO,
  MIN_CIRCLE,
  MIN_SCALE,
  MIN_TEXT,
  PHASE_GAP,
  PHASE_GAP_PAST_LABELS,
  PHASE_ORANGE,
  PICTURE_SIZE,
  PIN_GROW,
  RESIZE_UNDO_GAP_MS,
  SELECT_BLUE,
  SNAP_DISTANCE,
  SNAP_PINK,
  squareLabelSize,
  TEXT_COLORS,
  TEXT_FILLS,
  TEXT_SIZE,
  TICK,
  TICK_LABEL_GAP,
  TICK_LABEL_SIZE,
  TOP_LAYER,
  UNCHECKED,
} from "./constants";
import {
  distanceAlong,
  offsetPolyline,
  subPolyline,
  boxAround,
  boxesTouch,
  circleTouchesBox,
  mergeBoxes,
  newBend,
  bracketPath,
  pointAlong,
  polylineLength,
  segmentTouchesBox,
  unit,
  type Box,
  type Point,
} from "./geometry";
import { CheckMark, ChecklistIcon, LayerButton, LineWidths, LinkButton, PinIcon, SquareIcon, TrashIcon } from "./icons";
import { clamp, isTrackpadSwipe, straighten } from "./input";
import { LineMenu } from "./LineMenu";
import { LinkMenu, type AddTarget, type TaskPage } from "./LinkMenu";
import { ToolIcon } from "./ToolIcon";
import { keptGuides, snapBoxes, type SnapBox } from "./snapping";
import {
  allKeys,
  EMPTY_BOARD,
  fullBoard,
  idsOf,
  keyOf,
  maxId,
  type BoardData,
  type Circle,
  type End,
  type Key,
  type Kind,
  type Line,
  type Picture,
  type Pin,
  type Preset,
  type Square,
  type Text,
} from "./model";
import { BULLET, isPlain, mergeRuns, runLines, setListKind, sliceRuns, type ListKind, type Run } from "./richText";
import { SIDE_MENU_W, SideMenu } from "./SideMenu";
import { TextEditor } from "./TextEditor";
import { dateAlong, subSteps, tickValue, timelineLabels, timelineTicks, type TimeUnit } from "./timeline";
import { getShortcuts } from "@/lib/shortcuts";

type View = { x: number; y: number; scale: number };
// The room (in board units) one smaller step of a stretched timeline needs
// before it shows, and how many to skip when they don't all fit yet.
const SUB_TICK_GAP = 34;
const SUB_STEP_CHOICES: Record<TimeUnit, number[]> = {
  year: [1, 3, 6],
  month: [1, 2, 5, 10, 15],
  week: [1],
  day: [1, 3, 6, 12],
};
// "selection": pressing inside the selection box, on empty board.
type DragKind = Kind | End | "bend" | "corner" | "selection";

// A huge white board with faint grey dots and a light grey edge.
// - Two-finger swipe moves around; pinch or mouse wheel zooms.
// - "b" adds a circle at the cursor; "t" starts typing a text there. Hold "n" to draw a line; let go to confirm.
// - Drag circles, texts and lines to move them.
// - Drag on empty board to draw a selection box: everything it touches is
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
// - "m" opens the menu on the right, which holds the saved presets.
// - "v" turns view mode on and off: nothing can be changed, and hovering a
//   text makes it bigger to read. (These keys can be changed in Home's menu.)
// The board starts from `initial` and reports every change to `onChange`, so
// the page around it can save it. Presets are kept by the page too.
// README.md lists every control in full.
// What the page around the board can ask of it (used by Merge's "Select?").
export type BoardApi = {
  // A copy of the selected things.
  selected: () => BoardData;
  // Take the selected things off the board (can be undone); returns the
  // board as it is without them.
  removeSelected: () => BoardData;
  // A linked task was ticked or unticked somewhere else: tick or untick the
  // linked text's first checkbox to match (not an undoable change).
  setLinkDone: (link: string, done: boolean) => void;
};

// Adding board texts as tasks on Home's to-do list or the phase goal, kept
// by the page around the board (see lib/planner).
export type Planner = {
  add: (to: AddTarget, task: { text: string; link: string; done: boolean }) => Promise<void>;
  taskPages: () => Promise<TaskPage[]>;
  // A linked text's first checkbox was ticked or unticked on the board.
  onCheck: (link: string, done: boolean) => void;
  // A deadline task's text was deleted: delete its priority task too.
  removePriority?: (link: string) => Promise<void>;
};

export function Board({
  initial = EMPTY_BOARD,
  onChange,
  presets = [],
  onSavePreset,
  onUpdatePreset,
  onDeletePreset,
  api,
  onSelectionChange,
  planner,
  onUploadPicture,
}: {
  initial?: BoardData;
  onChange?: (data: BoardData) => void;
  presets?: Preset[];
  onSavePreset?: (data: BoardData) => void;
  onUpdatePreset?: (id: string, data: BoardData) => void;
  onDeletePreset?: (id: string) => void;
  api?: React.Ref<BoardApi>;
  // Told how many things are selected whenever that changes.
  onSelectionChange?: (count: number) => void;
  planner?: Planner;
  // Stores a pasted picture and gives back its address.
  onUploadPicture?: (file: Blob) => Promise<string>;
}) {
  const [board, setBoard] = useState<BoardData>(initial);
  const { circles, squares, texts, lines, pictures } = board;
  const setCircles = (f: (cs: Circle[]) => Circle[]) => setBoard((b) => ({ ...b, circles: f(b.circles) }));
  const setSquares = (f: (qs: Square[]) => Square[]) => setBoard((b) => ({ ...b, squares: f(b.squares) }));
  const setTexts = (f: (ts: Text[]) => Text[]) => setBoard((b) => ({ ...b, texts: f(b.texts) }));
  const setLines = (f: (ls: Line[]) => Line[]) => setBoard((b) => ({ ...b, lines: f(b.lines) }));
  const setPictures = (f: (ps: Picture[]) => Picture[]) => setBoard((b) => ({ ...b, pictures: f(b.pictures) }));

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
  // This moment, for the "Now" arrow on timelines (kept up to the minute),
  // and the timeline whose arrow is showing the word "Now".
  const [now, setNow] = useState(() => new Date());
  const [nowShown, setNowShown] = useState<number | null>(null);
  // The timeline whose "Deadline task" is asking for the deadline, what's
  // typed so far, and why it couldn't be made.
  const [deadlineFor, setDeadlineFor] = useState<number | null>(null);
  const [deadlineInput, setDeadlineInput] = useState("");
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // The angle point clicked on the selected line; Backspace / Delete removes it.
  const [selectedBend, setSelectedBend] = useState<{ lineId: number; index: number } | null>(null);
  const selectedBendRef = useRef(selectedBend);
  selectedBendRef.current = selectedBend;
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
    // Everything's snap boxes, worked out once when the drag starts moving
    // (reading text sizes from the page on every mouse move is slow).
    snaps?: SnapBox[];
  } | null>(null);
  const nextId = useRef(maxId(initial) + 1);
  // Where a line was last pressed, so "Angle" adds its bend on that side.
  const linePressedAt = useRef<{ id: number; at: Point } | null>(null);
  // What Ctrl+C copied, ready for Ctrl+V.
  const clipboard = useRef<BoardData | null>(null);
  const pasteFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [presetSaved, setPresetSaved] = useState(false);
  // The right-hand menu opened with "m".
  const [menuOpen, setMenuOpen] = useState(false);
  // View mode: looking only, nothing can be changed (see toggleView).
  const [viewing, setViewing] = useState(false);
  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;
  // Phones and tablets: a toolbar stands in for the keys.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => setIsTouch(window.matchMedia("(pointer: coarse)").matches), []);
  // The toolbar's Line: the next finger drag draws one line.
  const [lineMode, setLineMode] = useState(false);
  // Fingers on the screen, for two-finger moving and pinching like a trackpad.
  const touchPoints = useRef(new Map<number, Point>());
  const gesture = useRef<{ mid: Point; dist: number; resize: boolean; committed: boolean } | null>(null);
  // The preset placed on the board with "Edit", until "Update preset" saves it.
  const [editingPreset, setEditingPreset] = useState<string | null>(null);

  // Tell the page about every change (not the first render: nothing changed).
  const reported = useRef(board);
  useEffect(() => {
    if (board === reported.current) return;
    reported.current = board;
    onChange?.(board);
  }, [board]); // eslint-disable-line react-hooks/exhaustive-deps

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
      data.circles.find((c) => c.id === id) ??
      data.texts.find((t) => t.id === id) ??
      data.squares.find((q) => q.id === id);
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
      return c
        ? { minX: c.x - c.size / 2, minY: c.y - c.size / 2, maxX: c.x + c.size / 2, maxY: c.y + c.size / 2 }
        : null;
    }
    if (kind === "square" || kind === "picture") {
      const q = (kind === "square" ? data.squares : data.pictures).find((q) => q.id === id);
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
      ...data.pictures.map((p) => ({ key: keyOf("picture", p.id), x: p.x, y: p.y, w: p.w, h: p.h })),
      ...data.texts.map((t) => {
        // The text's size from the page; its centre from the data (the page
        // may already show it moved).
        const r = document.querySelector(`[data-text="${t.id}"]`)?.getBoundingClientRect();
        return { key: keyOf("text", t.id), x: t.x, y: t.y, w: (r?.width ?? 0) / scale, h: (r?.height ?? 0) / scale };
      }),
      ...data.lines.flatMap((l) =>
        lineSnapPoints(l, data).map((p) => ({ key: keyOf("line", l.id), ...p, w: 0, h: 0, line: true })),
      ),
      // Each line's middle, so a text above or below it snaps centred on it.
      ...data.lines.map((l) => {
        const pts = pointsOf(resolve(l, data));
        const { p, dir } = pointAlong(pts, polylineLength(pts) / 2);
        return {
          key: keyOf("line", l.id),
          ...p,
          w: 0,
          h: 0,
          mid: Math.abs(dir.x) >= Math.abs(dir.y) ? "x" : "y",
        } as SnapBox;
      }),
    ];
  }

  // A line's points that snap: its ends, bends and timeline marks (a phase
  // bracket shows no marks, so only its ends and bends).
  function lineSnapPoints(l: Line, data: BoardData): Point[] {
    const pts = pointsOf(resolve(l, data));
    const labels = (!l.bracket && l.time && timelineTicks(l.time)) || [];
    const len = polylineLength(pts);
    const marks = labels.length > 1 ? labels.map((_, i) => pointAlong(pts, (len * i) / (labels.length - 1)).p) : [];
    return [...pts, ...marks];
  }

  // How close (in board units) things have to be to snap, at this zoom.
  const snapReach = () => SNAP_DISTANCE / viewRef.current.scale;

  // Snap one dragged line point (an end or bend) in line with other lines'
  // points. Returns where it goes and the guide lines.
  function snapLinePoint(lineId: number, p: Point, all: SnapBox[]) {
    const snap = snapBoxes([{ key: keyOf("line", lineId), ...p, w: 0, h: 0, line: true }], 0, 0, all, snapReach());
    return { at: { x: p.x + snap.dx, y: p.y + snap.dy }, lines: snap.lines };
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
    if (kind === "text" || kind === "picture") {
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
      ...data.pictures.map((p) => [keyOf("picture", p.id), p.group] as [Key, number | undefined]),
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
    const pIds = idsOf(keys, "picture");
    const kept = (id?: number) => (id !== undefined && (cIds.has(id) || tIds.has(id) || sIds.has(id)) ? id : undefined);
    return structuredClone({
      pictures: data.pictures.filter((p) => pIds.has(p.id)),
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
    const pIds = idsOf(sel, "picture");
    const group = isGroup ? undefined : nextId.current++;
    commit();
    setBoard((b) => ({
      pictures: b.pictures.map((p) => (pIds.has(p.id) ? { ...p, group } : p)),
      circles: b.circles.map((c) => (cIds.has(c.id) ? { ...c, group } : c)),
      squares: b.squares.map((q) => (sIds.has(q.id) ? { ...q, group } : q)),
      texts: b.texts.map((t) => (tIds.has(t.id) ? { ...t, group } : t)),
      lines: b.lines.map((l) => (lIds.has(l.id) ? { ...l, group } : l)),
    }));
  }

  // Add a copy of `items` centred on `at`, with new ids, and select it.
  function paste(saved: BoardData, at: Point) {
    // (Presets saved before pictures existed have none.)
    const items = fullBoard(saved);
    const pts = [
      ...items.circles,
      ...items.squares,
      ...items.texts,
      ...items.pictures,
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
    // A copy isn't linked to the to-do list or phase goal (only the original is).
    const texts = copy.texts.map((t) => ({
      ...t,
      ...move(t),
      id: newId(t.id),
      group: newGroup(t.group),
      link: undefined,
    }));
    const pictures = copy.pictures.map((p) => ({ ...p, ...move(p), id: newId(p.id), group: newGroup(p.group) }));
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
      pictures: [...b.pictures, ...pictures],
    }));
    setSelection(allKeys({ circles, squares, texts, lines, pictures }));
    setEditing(null);
    setEditingLabel(null);
    setEditingLineLabel(null);
  }

  function savePreset() {
    const data = pickOut(selectionRef.current, boardRef.current);
    if (editingPreset) onUpdatePreset?.(editingPreset, data);
    else onSavePreset?.(data);
    setEditingPreset(null);
    setPresetSaved(true);
    setTimeout(() => setPresetSaved(false), 1200);
  }

  // Place a copy of a preset in the middle of the screen, selected.
  function placePreset(preset: Preset) {
    paste(preset.data, toBoard(window.innerWidth / 2, window.innerHeight / 2));
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
      // The side menu scrolls like a normal page.
      if ((e.target as HTMLElement).closest("[data-side-menu]")) return;
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

  // The middle of the screen, on the board (where the toolbar adds things).
  function screenCentre() {
    return toBoard(window.innerWidth / 2, window.innerHeight / 2);
  }

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
    const pIds = idsOf(sel, "picture");
    for (const p of data.pictures) {
      if (!pIds.has(p.id)) continue;
      f = Math.max(f, MIN_CIRCLE / Math.min(p.w, p.h));
      f = Math.min(f, MAX_PICTURE / Math.max(p.w, p.h));
    }
    const scalePt = (p: Point) => (single ? p : { x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f });
    // A text resized on its own keeps its left edge where it is, so it never
    // needs lining up again.
    // (The text starts 4 units in from its box: its px-1 padding.)
    const left = box.minX + 4;
    const textAt = (t: Text) => (single ? { x: left + (t.x - left) * f, y: t.y } : scalePt(t));

    setBoard((b) => ({
      circles: b.circles.map((c) => (cIds.has(c.id) ? { ...c, ...scalePt(c), size: c.size * f } : c)),
      squares: b.squares.map((q) => (sIds.has(q.id) ? { ...q, ...scalePt(q), w: q.w * f, h: q.h * f } : q)),
      pictures: b.pictures.map((p) => (pIds.has(p.id) ? { ...p, ...scalePt(p), w: p.w * f, h: p.h * f } : p)),
      texts: b.texts.map((t) => (tIds.has(t.id) ? { ...t, ...textAt(t), fontSize: t.fontSize * f } : t)),
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
  // The board without these things. Lines attached to something removed
  // stay where they are, unattached.
  function withoutKeys(keys: Key[], b: BoardData): BoardData {
    const cIds = idsOf(keys, "circle");
    const tIds = idsOf(keys, "text");
    const sIds = idsOf(keys, "square");
    const lIds = idsOf(keys, "line");
    const pIds = idsOf(keys, "picture");
    const gone = (id?: number) => id !== undefined && (cIds.has(id) || tIds.has(id) || sIds.has(id));
    return {
      pictures: b.pictures.filter((p) => !pIds.has(p.id)),
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
  }

  function removeKeys(keys: Key[]) {
    setBoard((b) => withoutKeys(keys, b));
  }

  useImperativeHandle(api, () => ({
    selected: () => pickOut(selectionRef.current, boardRef.current),
    removeSelected: () => {
      const rest = withoutKeys(selectionRef.current, boardRef.current);
      commit();
      setBoard(rest);
      setSelection([]);
      return rest;
    },
    setLinkDone: (link, done) =>
      setTexts((ts) =>
        ts.map((t) => {
          if (t.link !== link || firstBoxLine(t.text) === -1) return t;
          const next = withFirstBox(t, done ? CHECKED : UNCHECKED);
          return next.text === t.text ? t : next;
        }),
      ),
  }));
  useEffect(() => onSelectionChange?.(selection.length), [selection.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Delete whatever is selected (Backspace / Delete, or the phone toolbar).
  function deleteSelection() {
    const sel = selectionRef.current;
    // A clicked angle point goes first: the line straightens there.
    const bend = selectedBendRef.current;
    if (bend && sel.length === 1 && sel[0] === keyOf("line", bend.lineId)) {
      const line = boardRef.current.lines.find((l) => l.id === bend.lineId);
      const bends = line?.bends?.filter((_, i) => i !== bend.index);
      setSelectedBend(null);
      if (line) updateLine(line.id, { bends: bends?.length ? bends : undefined });
      return;
    }
    if (sel.length === 0) return;
    commit();
    removeKeys(sel);
    setSelection([]);
  }

  // A picture pasted from outside the site: shrunk if it's huge, stored
  // (or kept in the board itself if it can't be), then put on the board
  // centred on `at`, selected.
  async function addPicture(file: Blob, at: Point) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return;
    }
    const shrink = (max: number) => {
      const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * k);
      canvas.height = Math.round(bitmap.height * k);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas;
    };
    let src: string;
    try {
      if (!onUploadPicture) throw new Error();
      const blob = await new Promise<Blob | null>((ok) => shrink(2000).toBlob(ok, "image/webp", 0.9));
      if (!blob) throw new Error();
      src = await onUploadPicture(blob);
    } catch {
      src = shrink(1000).toDataURL("image/webp", 0.85);
    }
    // As big on screen as the picture itself, up to a limit.
    const k = Math.min(1, PICTURE_SIZE / Math.max(bitmap.width, bitmap.height)) / viewRef.current.scale;
    const id = nextId.current++;
    commit();
    setPictures((ps) => [...ps, { id, x: at.x, y: at.y, w: bitmap.width * k, h: bitmap.height * k, src }]);
    setSelection([keyOf("picture", id)]);
  }

  // "b" (or the phone toolbar's Circle): a new circle here, selected straight
  // away so its menu shows.
  function addCircle(at: Point) {
    commit();
    const id = nextId.current++;
    setCircles((cs) => [...cs, { id, x: at.x, y: at.y, size: CIRCLE_SIZE }]);
    setSelection([keyOf("circle", id)]);
  }

  // Letting go of N (or lifting the finger with the phone's Line tool):
  // the line being drawn is added.
  function finishDraft() {
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

    function onKeyDown(e: KeyboardEvent) {
      if (typing(e)) return;
      const keys = getShortcuts();
      // View mode: only its own key (or Escape) does anything.
      if (viewingRef.current) {
        if (
          !e.repeat &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          (e.key.toLowerCase() === keys.view || e.key === "Escape")
        )
          toggleView();
        return;
      }
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
        // Replace whatever was copied outside the site (like a picture), so
        // pasting brings these back rather than that. Their words go along,
        // for pasting somewhere else.
        const words = clipboard.current.texts.map((t) => taskText(t.text)).join("\n");
        navigator.clipboard?.writeText(words).catch(() => {});
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        // The paste event below decides between a picture copied outside the
        // site and things copied on the board. Some browsers don't send one
        // without a text box focused; then paste the board's own copy.
        if (pasteFallback.current) clearTimeout(pasteFallback.current);
        const at = cursorOnBoard();
        pasteFallback.current = setTimeout(() => {
          pasteFallback.current = null;
          if (clipboard.current) paste(clipboard.current, at);
        }, 150);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === keys.presets) {
        setMenuOpen((open) => !open);
      } else if (key === keys.view) {
        toggleView();
      } else if (key === keys.text) {
        e.preventDefault();
        addText(cursorOnBoard());
      } else if (key === keys.circle) {
        addCircle(cursorOnBoard());
      } else if (key === keys.line && !draftRef.current) {
        const at = cursorOnBoard();
        setDraft({ from: at, to: at });
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key.toLowerCase() === getShortcuts().line) finishDraft();
    }

    // Pasting: a picture copied from outside the site goes on the board at
    // the cursor; otherwise whatever was copied on the board.
    function onPaste(e: ClipboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA"].includes(el.tagName))) return;
      if (viewingRef.current) return;
      if (pasteFallback.current) clearTimeout(pasteFallback.current);
      pasteFallback.current = null;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      e.preventDefault();
      if (file) void addPicture(file, cursorOnBoard());
      else if (clipboard.current) paste(clipboard.current, cursorOnBoard());
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("paste", onPaste);
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
    const all = (d.snaps ??= snapBoxesOf(o));

    // Several things selected: move them all together. Squares among them
    // snap to the other squares, nudging the whole lot.
    if (d.many) {
      const many = new Set(d.many);
      const moving = all.filter((s) => many.has(s.key));
      const snap = moving.length ? snapBoxes(moving, dx, dy, all, snapReach()) : { dx, dy, lines: [] };
      setSnapGuides(snap.lines);
      moveMany(d.many, snap.dx, snap.dy, o);
      return;
    }
    // A deadline task's text only slides straight across its timeline,
    // staying level with its date.
    const dragged = d.kind === "text" ? o.texts.find((t) => t.id === d.id) : undefined;
    const spot = dragged?.deadline && deadlineSpot(dragged.deadline, o);
    if (dragged && spot) {
      const off = (dragged.x + dx - spot.p.x) * spot.n.x + (dragged.y + dy - spot.p.y) * spot.n.y;
      setSnapGuides([]);
      moveMany([keyOf("text", d.id)], spot.p.x + spot.n.x * off - dragged.x, spot.p.y + spot.n.y * off - dragged.y, o);
      return;
    }
    if (d.kind === "circle" || d.kind === "text" || d.kind === "square" || d.kind === "picture") {
      const key = keyOf(d.kind, d.id);
      const snap = snapBoxes(
        all.filter((s) => s.key === key),
        dx,
        dy,
        all,
        snapReach(),
      );
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
    const line = resolve(
      o.lines.find((l) => l.id === d.id)!,
      o,
    );
    let next: Line;
    if (d.kind === "line") {
      // Its ends, bends and marks snap in line with other lines' points.
      const snap = snapBoxes(
        all.filter((b) => b.key === keyOf("line", d.id)),
        dx,
        dy,
        all,
        snapReach(),
      );
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
      const snapped = snapLinePoint(d.id, move(pts[i]), all);
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
      const snapped = snapLinePoint(d.id, move(line[end]), all);
      const pos = straighten(snapped.at, neighbour);
      const scale = viewRef.current.scale;
      // Nearest circle or text within reach (distance from its edge).
      const reach = ATTACH_DISTANCE / scale;
      const near = [
        ...o.circles.map((c) => ({ c, gap: Math.hypot(c.x - pos.x, c.y - pos.y) - c.size / 2 })),
        ...o.texts.map((t) => {
          const b = all.find((s) => s.key === keyOf("text", t.id))!;
          const gap = Math.hypot(
            Math.max(b.x - b.w / 2 - pos.x, 0, pos.x - b.x - b.w / 2),
            Math.max(b.y - b.h / 2 - pos.y, 0, pos.y - b.y - b.h / 2),
          );
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
    const pIds = idsOf(keys, "picture");
    const movesWithItem = (id?: number) => id !== undefined && (cIds.has(id) || tIds.has(id) || sIds.has(id));
    setBoard({
      pictures: o.pictures.map((p) => (pIds.has(p.id) ? { ...p, ...move(p) } : p)),
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

  // View mode on or off. Turning it on lets go of whatever was selected or
  // open, so nothing can be changed until it's off again.
  function toggleView() {
    if (!viewingRef.current) {
      setSelection([]);
      setMenuOpen(false);
      setPinMenu(null);
      setPhase(null);
      setSelectedBend(null);
      setDraft(null);
      setLineMode(false);
    }
    viewingRef.current = !viewingRef.current;
    setViewing(viewingRef.current);
  }

  // In view mode, presses and clicks on the board do nothing (two fingers
  // still move around and zoom), except on the view mode switch itself.
  function blockedInView(e: React.SyntheticEvent) {
    if (!viewingRef.current || (e.target as HTMLElement).closest?.("[data-view-switch]")) return false;
    e.stopPropagation();
    return true;
  }

  function startDrag(e: React.PointerEvent, kind: DragKind, id: number, index?: number) {
    e.stopPropagation();
    setPinMenu(null);
    setSelectedBend(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    const sel = selectionRef.current;
    const itemKind: Kind | null =
      kind === "circle" || kind === "square" || kind === "text" || kind === "line" || kind === "picture" ? kind : null;
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
    // View mode: nothing to select (and the view mode switch stays clickable).
    if (viewingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPinMenu(null);
    // Inside the box around several selected things: drag them all.
    const at = toBoard(e.clientX, e.clientY);
    const pad = 6 / viewRef.current.scale;
    if (
      groupBox &&
      at.x >= groupBox.minX - pad &&
      at.x <= groupBox.maxX + pad &&
      at.y >= groupBox.minY - pad &&
      at.y <= groupBox.maxY + pad
    ) {
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

  // The middle of the two fingers on the screen and how far apart they are.
  function twoFingers() {
    const [a, b] = [...touchPoints.current.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  // Stop whatever one finger had started (a drag, a selection box, a line),
  // putting back anything it moved.
  function cancelPress() {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      setBoard(d.orig);
      history.current.pop();
    }
    setMarquee(null);
    setSnapGuides([]);
    setDraft(null);
  }

  // Touch, like a trackpad: two fingers move around and pinch to zoom; with
  // something selected, a pinch resizes it instead (a group only when the
  // pinch is inside its box). The toolbar's Line makes the next drag draw a line.
  function onTouchDown(e: React.PointerEvent) {
    if (e.pointerType !== "touch") {
      blockedInView(e);
      return;
    }
    touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPoints.current.size < 2 && blockedInView(e)) return;
    if (touchPoints.current.size >= 2) {
      e.stopPropagation();
      if (touchPoints.current.size > 2) return;
      cancelPress();
      rootRef.current!.setPointerCapture(e.pointerId);
      const { mid, dist } = twoFingers();
      const sel = selectionRef.current;
      const box = groupBoxRef.current;
      const at = toBoard(mid.x, mid.y);
      const pad = 6 / viewRef.current.scale;
      const insideBox =
        !!box && at.x >= box.minX - pad && at.x <= box.maxX + pad && at.y >= box.minY - pad && at.y <= box.maxY + pad;
      const resize =
        !viewingRef.current && ((sel.length === 1 && !sel[0].startsWith("line:")) || (sel.length > 1 && insideBox));
      gesture.current = { mid, dist, resize, committed: false };
      return;
    }
    if (lineMode && !(e.target as HTMLElement).closest("button, input, [contenteditable]")) {
      e.stopPropagation();
      rootRef.current!.setPointerCapture(e.pointerId);
      const at = toBoard(e.clientX, e.clientY);
      setDraft({ from: at, to: at });
    }
  }

  function onTouchMove(e: React.PointerEvent) {
    if (!touchPoints.current.has(e.pointerId)) return;
    touchPoints.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    e.stopPropagation();
    if (touchPoints.current.size < 2) return;
    const { mid, dist } = twoFingers();
    const k = g.dist > 0 ? dist / g.dist : 1;
    if (g.resize) {
      if (!g.committed) commit();
      g.committed = true;
      resizeSelection(k);
    } else {
      const from = g.mid;
      setView((v) => {
        const scale = clamp(v.scale * k, MIN_SCALE, MAX_SCALE);
        const f = scale / v.scale;
        return { scale, x: mid.x - (from.x - v.x) * f, y: mid.y - (from.y - v.y) * f };
      });
    }
    g.mid = mid;
    g.dist = dist;
  }

  function onTouchUp(e: React.PointerEvent) {
    if (!touchPoints.current.delete(e.pointerId)) return;
    if (!gesture.current) return;
    // Lifting the fingers after moving or pinching does nothing else.
    e.stopPropagation();
    if (touchPoints.current.size === 0) gesture.current = null;
  }

  function onPointerUp() {
    // The toolbar's Line: lifting the finger adds the line.
    if (lineMode && draftRef.current) {
      finishDraft();
      setLineMode(false);
      return;
    }
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
    if (d.kind === "bend") setSelectedBend({ lineId: d.id, index: d.index! });
    // A click without moving selects just that thing: circles and texts open
    // their menu, lines show their end dots, arrow buttons and menu. Clicking
    // a selected circle or text again deselects it.
    if (d.kind === "circle" || d.kind === "square" || d.kind === "text" || d.kind === "line" || d.kind === "picture") {
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
    editingAppend.current = "";
    setEditing(c.id);
  }

  // "t": a new empty text at this spot, ready to type (like the circle menu's
  // Text, without the circle).
  function addText(at: Point) {
    const id = nextId.current++;
    commit();
    setTexts((ts) => [
      ...ts,
      { id, x: at.x, y: at.y, text: "", fontSize: TEXT_SIZE, color: TEXT_COLORS[0], bold: false },
    ]);
    setSelection([]);
    editingIsNew.current = true;
    editingAppend.current = "";
    setEditing(id);
  }

  // Where a deadline sits on its timeline, and the direction straight across
  // the timeline there, on the side away from its labels (null when the
  // timeline is gone or the deadline isn't on it).
  function deadlineSpot(d: { line: number; at: string }, data: BoardData = board) {
    const l = data.lines.find((x) => x.id === d.line);
    const f = l?.time && dateAlong(l.time, new Date(d.at));
    if (!l || f === null || f === undefined) return null;
    const pts = drawPoints(resolve(l, data));
    const { p, dir } = pointAlong(pts, f * (polylineLength(pts) || 1));
    let n = { x: dir.y, y: -dir.x };
    if (n.y > 0 || (n.y === 0 && n.x > 0)) n = { x: -n.x, y: -n.y };
    return { p, n, upright: Math.abs(dir.y) > Math.abs(dir.x) };
  }

  // A timeline's "Deadline task": a bold text with a checkbox level with the
  // deadline's date, ready to type. Once it has words it's on Home's
  // Priority tasks too, with this deadline, ticked together with the text.
  function addDeadlineText(l: Line, at: Date) {
    const deadline = { line: l.id, at: at.toISOString() };
    const spot = deadlineSpot(deadline);
    if (!spot) return false;
    const gap = spot.upright ? 72 : 36;
    const id = nextId.current++;
    commit();
    setTexts((ts) => [
      ...ts,
      {
        id,
        x: spot.p.x + spot.n.x * gap,
        y: spot.p.y + spot.n.y * gap,
        text: `${UNCHECKED} `,
        fontSize: TEXT_SIZE,
        color: TEXT_COLORS[0],
        bold: true,
        link: crypto.randomUUID(),
        deadline,
      },
    ]);
    setSelection([]);
    editingIsNew.current = true;
    editingAppend.current = "";
    setEditing(id);
    return true;
  }

  // The circle menu's square icon: swap the circle for a square outline in the
  // same place (same id, so attached lines stay attached), still selected.
  function circleToSquare(c: Circle) {
    commit();
    setBoard((b) => ({
      ...b,
      circles: b.circles.filter((x) => x.id !== c.id),
      squares: [
        ...b.squares,
        { id: c.id, x: c.x, y: c.y, w: c.size, h: c.size, color: TEXT_COLORS[0], group: c.group },
      ],
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

  // The text menu's list buttons: every line of the text becomes a numbered
  // list, bullet points or a checklist (or back to plain lines if it already
  // is one). An empty text starts typing the first line.
  function makeList(t: Text, kind: ListKind) {
    if (!t.text) {
      startEditing(t.id, kind === "number" ? "1. " : kind === "bullet" ? `${BULLET} ` : `${UNCHECKED} `);
      return;
    }
    const runs = setListKind(t.runs ?? [{ text: t.text }], 0, t.text.split("\n").length - 1, kind, UNCHECKED);
    updateText(t.id, { text: runs.map((r) => r.text).join(""), runs: isPlain(runs) ? undefined : runs });
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
    // The box keeps its own size and colour.
    const at = lines.slice(0, lineIndex).join("\n").length + (lineIndex > 0 ? 1 : 0) + indent.length;
    const runs =
      t.runs &&
      mergeRuns([
        ...sliceRuns(t.runs, 0, at),
        { ...sliceRuns(t.runs, at, at + 1)[0], text: box },
        ...sliceRuns(t.runs, at + 1),
      ]);
    updateText(id, { text: lines.join("\n"), runs });
    // The first box of a linked text is the task on Home too.
    if (t.link && lineIndex === firstBoxLine(t.text)) planner?.onCheck(t.link, box === CHECKED);
  }

  // The text menu's Link > Add to: add the text as a task on Home's to-do
  // list, the phase goal or one of its task pages. The text gets a checkbox
  // (if it has none) that's ticked together with the task.
  async function addTextTo(t: Text, to: AddTarget) {
    if (!planner) return;
    const link = t.link ?? crypto.randomUUID();
    const boxed = firstBoxLine(t.text) === -1 ? withFirstBox(t, UNCHECKED) : t;
    if (boxed !== t || !t.link) updateText(t.id, { text: boxed.text, runs: boxed.runs, link });
    const done = boxed.text.split("\n")[firstBoxLine(boxed.text)].trimStart()[0] === CHECKED;
    await planner.add(to, { text: taskText(t.text), link, done });
  }

  function confirmText(id: number, value: string, typed?: Run[]) {
    setEditing(null);
    // Keep the first line's indent, so only trailing space and blank leading lines go.
    const text = value.trim() ? value.replace(/^\s*\n/, "").trimEnd() : "";
    const cut = value.length - value.replace(/^\s*\n/, "").length;
    const kept = typed && sliceRuns(typed, cut, cut + text.length);
    const runs = kept && !isPlain(kept) ? kept : undefined;
    const current = texts.find((t) => t.id === id);
    const changed = current?.text !== text || JSON.stringify(current?.runs) !== JSON.stringify(runs);
    if (!editingIsNew.current && changed) commit();
    if (text) {
      setTexts((ts) => ts.map((t) => (t.id === id ? { ...t, text, runs } : t)));
      // A deadline task's words go to Home's Priority tasks too.
      const words = taskText(text);
      if (current?.deadline && current.link && words && changed) {
        const done = text.split("\n")[firstBoxLine(text)]?.trimStart()[0] === CHECKED;
        void planner
          ?.add({ kind: "priority", deadline: current.deadline.at }, { text: words, link: current.link, done })
          .catch(() => {});
      }
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

  // Give everything selected the same colour: squares, texts (all of their
  // text, including parts that had their own colour) and lines.
  function colorSelection(color: string) {
    commit();
    const sq = idsOf(selection, "square");
    const tx = idsOf(selection, "text");
    const ln = idsOf(selection, "line");
    setSquares((qs) => qs.map((q) => (sq.has(q.id) ? { ...q, color } : q)));
    setTexts((ts) =>
      ts.map((t) => {
        if (!tx.has(t.id)) return t;
        const runs = t.runs?.map((r) => ({ ...r, color: undefined }));
        return { ...t, color, runs: runs && !isPlain(runs) ? runs : undefined };
      }),
    );
    setLines((ls) => ls.map((l) => (ln.has(l.id) ? { ...l, color } : l)));
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
    const labels = (l.time && timelineLabels(l.time)) || [];
    const len = polylineLength(pts) || 1;
    return { pts, labels, len, spacing: labels.length > 1 ? len / (labels.length - 1) : len };
  }

  // The smaller steps showing between a timeline's ticks because it's
  // stretched far enough (by its real length on the board, not the zoom): the
  // longer it is, the more of them show. `pos` is where, in ticks (2.5 is
  // halfway between the third and fourth tick).
  function subTicks(l: Line): { pos: number; label: string }[] {
    if (!l.time || l.bracket) return [];
    const { labels, spacing } = timelineGeometry(l);
    const out: { pos: number; label: string }[] = [];
    for (let j = 0; j < labels.length - 1; j++) {
      const steps = subSteps(l.time.unit, tickValue(l.time, j));
      const every = SUB_STEP_CHOICES[l.time.unit].find((k) => (spacing * k) / steps.length >= SUB_TICK_GAP);
      if (!every) continue;
      for (let i = every; steps.length - i >= every / 2; i += every) {
        out.push({ pos: j + i / steps.length, label: steps[i] });
      }
    }
    return out;
  }

  // The tick of the phase's timeline nearest this screen position.
  function phaseTickAt(sx: number, sy: number) {
    const l = lines.find((x) => x.id === phase?.lineId);
    if (!l) return 0;
    const { pts, labels, spacing } = timelineGeometry(l);
    const at = distanceAlong(pts, toBoard(sx, sy)) / spacing;
    const tick = clamp(Math.round(at), 0, labels.length - 1);
    // Phases can also start or end at the smaller steps showing in between
    // (pins only go on the ticks).
    if (phase?.pin) return tick;
    return subTicks(l).reduce((best, s) => (Math.abs(s.pos - at) < Math.abs(best - at) ? s.pos : best), tick);
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
    // Each end as a tick, plus which smaller step inside it (0: the tick itself).
    const split = (pos: number) => {
      const j = Math.floor(pos + 1e-9);
      const value = tickValue(l.time!, j);
      return { value, sub: Math.round((pos - j) * subSteps(l.time!.unit, value).length) };
    };
    const a = split(i1);
    const b = split(i2);
    const time =
      a.sub || b.sub
        ? { unit: l.time.unit, start: a.value, end: b.value, startSub: a.sub, endSub: b.sub }
        : { unit: l.time.unit, start: a.value, end: b.value };
    const id = nextId.current++;
    commit();
    setLines((ls) => [
      ...ls,
      {
        id,
        from: off[0],
        to: off[off.length - 1],
        bends: off.length > 2 ? off.slice(1, -1) : undefined,
        time,
        // Its ends curl back toward the timeline it came from.
        bracket: side > 0 ? -1 : 1,
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
    const labels = l.time && timelineLabels(l.time);
    if (!labels) return null;
    const len = polylineLength(pts) || 1;
    const n = labels.length;
    const spacing = n > 1 ? len / (n - 1) : len;
    const labelEvery = Math.max(1, Math.ceil(TICK_LABEL_GAP / spacing));
    const tickEvery = Math.max(1, Math.ceil(3 / spacing));
    const main = labels.map((text, i) => {
      const isEnd = i === 0 || i === n - 1;
      const pin = l.pins?.find((p) => p.value === tickValue(l.time!, i));
      if (!pin && !isEnd && i % tickEvery !== 0) return null;
      // A phase bracket shows only its first and last dates, outside the
      // bracket (away from the timeline it came from), with no marks.
      if (l.bracket && !pin && !isEnd) return null;
      const { p, dir } = pointAlong(pts, n > 1 ? (len * i) / (n - 1) : 0);
      if (l.bracket && !pin) {
        const away = { x: -dir.y * l.bracket, y: dir.x * l.bracket };
        const gap = TICK_LABEL_SIZE;
        return (
          <text
            key={i}
            data-tick={text}
            x={p.x + away.x * gap}
            y={p.y + away.y * gap}
            fontSize={TICK_LABEL_SIZE}
            fill={l.color ?? "#57534e"}
            // Beside an upright bracket the label starts (or ends) at it.
            textAnchor={away.x > 0.5 ? "start" : away.x < -0.5 ? "end" : "middle"}
            dominantBaseline="middle"
          >
            {text}
          </text>
        );
      }
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
    // The smaller steps in between, drawn smaller and lighter.
    const subs = subTicks(l).map(({ pos, label }) => {
      const { p, dir } = pointAlong(pts, pos * spacing);
      let nx = -dir.y;
      let ny = dir.x;
      if (ny < 0 || (ny === 0 && nx < 0)) {
        nx = -nx;
        ny = -ny;
      }
      const fontSize = TICK_LABEL_SIZE * 0.8;
      return (
        <g key={`sub${pos}`} data-sub-tick={label} opacity={0.6}>
          <line
            x1={p.x - nx * TICK * 0.6}
            y1={p.y - ny * TICK * 0.6}
            x2={p.x + nx * TICK * 0.6}
            y2={p.y + ny * TICK * 0.6}
            stroke={l.color ?? INK}
            strokeWidth={1}
          />
          <text
            x={p.x + nx * (TICK * 0.6 + fontSize)}
            y={p.y + ny * (TICK * 0.6 + fontSize)}
            fontSize={fontSize}
            fill={l.color ?? "#57534e"}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {label}
          </text>
        </g>
      );
    });
    return [...main, ...subs];
  }

  // A small arrow at today's date on a timeline, on the side away from the
  // labels (drawn above the line so it can be hovered). Hovering or pressing
  // it shows "Now".
  function nowArrow(l: Line, pts: Point[]) {
    const f = l.time ? dateAlong(l.time, now) : null;
    if (f === null) return null;
    const { p, dir } = pointAlong(pts, f * (polylineLength(pts) || 1));
    let nx = dir.y;
    let ny = -dir.x;
    if (ny > 0 || (ny === 0 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    const tip = 3;
    const size = 8;
    const back = { x: p.x + nx * (tip + size), y: p.y + ny * (tip + size) };
    const shown = nowShown === l.id;
    return (
      <g
        data-now={l.id}
        style={{ pointerEvents: "auto", cursor: "pointer" }}
        onPointerEnter={(e) => e.pointerType === "mouse" && setNowShown(l.id)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setNowShown(null)}
        onPointerDown={(e) => {
          e.stopPropagation();
          setNowShown(shown && e.pointerType !== "mouse" ? null : l.id);
        }}
      >
        <circle cx={back.x} cy={back.y} r={size} fill="transparent" />
        <polygon
          points={[
            [p.x + nx * tip, p.y + ny * tip],
            [back.x - dir.x * (size / 2), back.y - dir.y * (size / 2)],
            [back.x + dir.x * (size / 2), back.y + dir.y * (size / 2)],
          ]
            .map((q) => q.join(","))
            .join(" ")}
          fill={NOW_RED}
        />
        {shown && (
          <text
            data-now-label
            x={back.x + nx * TICK_LABEL_SIZE}
            y={back.y + ny * TICK_LABEL_SIZE}
            fontSize={TICK_LABEL_SIZE}
            fontWeight={700}
            fill={NOW_RED}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            Now
          </text>
        )}
      </g>
    );
  }

  // Circles, squares, pictures and texts, back to front: by layer, and
  // otherwise in that order. (Lines are always underneath them.)
  const layered = [
    ...circles.map((c) => ({ key: keyOf("circle", c.id), z: c.z ?? 0 })),
    ...squares.map((q) => ({ key: keyOf("square", q.id), z: q.z ?? 0 })),
    ...pictures.map((p) => ({ key: keyOf("picture", p.id), z: p.z ?? 0 })),
    ...texts.map((t) => ({ key: keyOf("text", t.id), z: t.z ?? 0 })),
  ];
  const layerOf = new Map(
    layered
      .map((e, i) => ({ ...e, i }))
      .sort((a, b) => a.z - b.z || a.i - b.i)
      .map((e, i) => [e.key, i + 1]),
  );
  // Whether this thing overlaps any other circle, square, picture or text
  // (only then does its box show Layer).
  function overlapsOthers(key: Key) {
    const box = boxOf(key);
    return (
      !!box &&
      layered.some((e) => {
        if (e.key === key) return false;
        const other = boxOf(e.key);
        return !!other && boxesTouch(box, other);
      })
    );
  }
  // Layer > Move to front / Move to back.
  function moveLayer(key: Key, front: boolean) {
    const zs = layered.map((e) => e.z);
    const z = front ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
    const [kind, idStr] = key.split(":");
    const id = Number(idStr);
    commit();
    setBoard((b) => ({
      ...b,
      circles: kind === "circle" ? b.circles.map((c) => (c.id === id ? { ...c, z } : c)) : b.circles,
      squares: kind === "square" ? b.squares.map((q) => (q.id === id ? { ...q, z } : q)) : b.squares,
      pictures: kind === "picture" ? b.pictures.map((p) => (p.id === id ? { ...p, z } : p)) : b.pictures,
      texts: kind === "text" ? b.texts.map((t) => (t.id === id ? { ...t, z } : t)) : b.texts,
    }));
  }
  const layerButton = (key: Key) =>
    overlapsOthers(key) && <LayerButton onFront={() => moveLayer(key, true)} onBack={() => moveLayer(key, false)} />;

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
      kind === "circle"
        ? circles
        : kind === "square"
          ? squares
          : kind === "text"
            ? texts
            : kind === "picture"
              ? pictures
              : lines;
    return list.find((x) => x.id === Number(idStr))?.group;
  };
  const isOneGroup =
    selection.length > 1 &&
    groupOf(selection[0]) !== undefined &&
    selection.every((k) => groupOf(k) === groupOf(selection[0])) &&
    withGroups(selection, board).length === selection.length;
  const arrowheadFor = (l: Line) =>
    `url(#arrowhead-${Math.max(0, TEXT_COLORS.indexOf(l.color ?? INK))}-${LINE_WIDTHS.includes(l.width ?? LINE_WIDTH) ? (l.width ?? LINE_WIDTH) : LINE_WIDTH})`;
  const toPolyline = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const px = (n: number) => n / view.scale; // a size in screen pixels, in board units

  return (
    <div
      ref={rootRef}
      // overflow-clip (not hidden): focusing a field in a menu must not scroll the board.
      data-viewing={viewing || undefined}
      className="fixed inset-0 touch-none select-none overflow-clip bg-white"
      onClickCapture={blockedInView}
      onDoubleClickCapture={blockedInView}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        setMarquee(null);
      }}
      onPointerDown={onBoardPointerDown}
      onPointerDownCapture={onTouchDown}
      onPointerMoveCapture={onTouchMove}
      onPointerUpCapture={onTouchUp}
      onPointerCancelCapture={onTouchUp}
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
            boxShadow: `0 0 0 ${px(1)}px rgb(var(--dot) / 0.12)`,
            backgroundImage: `radial-gradient(circle, rgb(var(--dot) / ${dotAlpha}) 1px, transparent 1.2px)`,
            backgroundSize: `${DOT_SPACING}px ${DOT_SPACING}px`,
          }}
        />

        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={BOARD_W} height={BOARD_H}>
          <defs>
            {/* One arrowhead per line colour and thickness (thicker lines get
                bigger arrowheads, but not as much bigger as the line). */}
            {TEXT_COLORS.flatMap((color, i) =>
              LINE_WIDTHS.map((w) => {
                // Rounded, so the server and the browser write the same number.
                const size = Math.round(((10 * (w / LINE_WIDTH) ** 0.75) / w) * 100) / 100;
                return (
                  <marker
                    key={`${color}-${w}`}
                    id={`arrowhead-${i}-${w}`}
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth={size}
                    markerHeight={size}
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L10,5 L0,10 z" fill={color} />
                  </marker>
                );
              }),
            )}
          </defs>
          {lines
            .map((l) => resolve(l))
            .map((l) => {
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
                  {l.bracket && l.time ? (
                    <path
                      data-line="line"
                      data-bracket
                      d={bracketPath(pts, l.bracket, BRACKET_CURL)}
                      fill="none"
                      stroke={l.color ?? INK}
                      strokeWidth={l.width ?? LINE_WIDTH}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <polyline
                      data-line="line"
                      points={toPolyline(pts)}
                      fill="none"
                      stroke={l.color ?? INK}
                      strokeWidth={l.width ?? LINE_WIDTH}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerStart={l.fromArrow ? arrowheadFor(l) : undefined}
                      markerEnd={l.toArrow ? arrowheadFor(l) : undefined}
                    />
                  )}
                  {timelineMarks(l, pts)}
                  {/* Wider invisible stroke so the line is easy to grab. */}
                  <polyline
                    data-line-hit={l.id}
                    points={toPolyline(pts)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(px(14), (l.width ?? LINE_WIDTH) + px(8))}
                    className="cursor-grab active:cursor-grabbing"
                    style={{ pointerEvents: "stroke" }}
                    onPointerDown={(e) => {
                      linePressedAt.current = { id: l.id, at: toBoard(e.clientX, e.clientY) };
                      startDrag(e, "line", l.id);
                    }}
                  />
                  {nowArrow(l, pts)}
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
              zIndex: layerOf.get(keyOf("circle", c.id)),
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
              style={{
                zIndex: layerOf.get(keyOf("square", q.id)),
                left: q.x - q.w / 2,
                top: q.y - q.h / 2,
                width: q.w,
                height: q.h,
              }}
            >
              <svg className="absolute inset-0 overflow-visible" width={q.w} height={q.h}>
                {inGroup && (
                  <rect
                    width={q.w}
                    height={q.h}
                    fill="none"
                    stroke={SELECT_BLUE}
                    strokeOpacity={0.35}
                    strokeWidth={px(6)}
                  />
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

        {pictures.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.id}
            data-picture={p.id}
            src={p.src}
            alt=""
            draggable={false}
            onPointerDown={(e) => startDrag(e, "picture", p.id)}
            className="absolute max-w-none cursor-grab select-none active:cursor-grabbing"
            style={{
              zIndex: layerOf.get(keyOf("picture", p.id)),
              left: p.x - p.w / 2,
              top: p.y - p.h / 2,
              width: p.w,
              height: p.h,
              outline: selection.includes(keyOf("picture", p.id))
                ? `${px(selection.length > 1 ? 3 : 2)}px solid rgb(59 130 246 / ${selection.length > 1 ? 0.35 : 0.8})`
                : undefined,
            }}
          />
        ))}

        {/* Guide lines while a square snaps, drawn above the squares and a
            little past them. */}
        {snapGuides.length > 0 && (
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={BOARD_W}
            height={BOARD_H}
            style={{ zIndex: TOP_LAYER }}
          >
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
            background: t.bg,
          };
          return (
            // Centred on t.x, t.y without a transform, so the text's layer and
            // its menu (always on top) aren't boxed in together.
            <div
              key={t.id}
              className="absolute flex items-center justify-center"
              style={{ left: t.x, top: t.y, width: 0, height: 0 }}
            >
              <div className="relative shrink-0">
                {isEditing ? (
                  <div className="relative" style={{ zIndex: TOP_LAYER }}>
                    <TextEditor
                      initial={t.text + editingAppend.current}
                      initialRuns={[...(t.runs ?? [{ text: t.text }]), { text: editingAppend.current }]}
                      style={style}
                      lists
                      onConfirm={(value, runs) => confirmText(t.id, value, runs)}
                    />
                  </div>
                ) : (
                  <div
                    data-text={t.id}
                    onPointerDown={(e) => startDrag(e, "text", t.id)}
                    onDoubleClick={() => startEditing(t.id)}
                    className="relative cursor-grab whitespace-pre px-1 active:cursor-grabbing"
                    style={{
                      ...style,
                      zIndex: layerOf.get(keyOf("text", t.id)),
                      boxShadow: inGroup ? `0 0 0 ${px(2)}px rgb(59 130 246 / 0.35)` : undefined,
                    }}
                  >
                    {runLines(t.runs ?? [{ text: t.text }]).map((lineRuns, i) => {
                      const full = lineRuns.map((r) => r.text).join("");
                      const indent = full.match(/^ */)![0];
                      const line = full.slice(indent.length);
                      const box = line[0] === UNCHECKED || line[0] === CHECKED;
                      const boxRun = sliceRuns(lineRuns, indent.length, indent.length + 1)[0];
                      const boxColor = boxRun?.color ?? t.color;
                      const restFrom = indent.length + (box ? (line[1] === " " ? 2 : 1) : 0);
                      return (
                        <Fragment key={i}>
                          {i > 0 && "\n"}
                          {indent}
                          {box && (
                            <span style={{ fontSize: boxRun.scale ? `${boxRun.scale}em` : undefined }}>
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
                                  border: `0.09em solid ${boxColor}`,
                                }}
                              >
                                {line[0] === CHECKED && <CheckMark color={boxColor} />}
                              </span>
                            </span>
                          )}
                          {sliceRuns(lineRuns, restFrom).map((r, j) => (
                            <span
                              key={j}
                              style={{
                                fontSize: r.scale ? `${r.scale}em` : undefined,
                                fontWeight: r.bold === undefined ? undefined : r.bold ? 700 : 400,
                                color: r.color,
                                backgroundColor: r.bg,
                              }}
                            >
                              {r.text}
                            </span>
                          ))}
                        </Fragment>
                      );
                    })}
                  </div>
                )}

                {sizeShownFor === t.id && (
                  <div
                    data-size-label
                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-stone-900 px-1.5 py-0.5 text-white"
                    style={{ bottom: "100%", marginBottom: px(6), fontSize: px(12), zIndex: TOP_LAYER }}
                  >
                    {Math.round(t.fontSize)}px
                  </div>
                )}

                {showMenu && (
                  <div
                    data-menu="text"
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute left-full top-0 flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-2 shadow-lg"
                    style={{ marginLeft: 8, zIndex: TOP_LAYER }}
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
                        onClick={() => makeList(t, "check")}
                        className="flex items-center rounded px-2 py-1 hover:bg-stone-100"
                      >
                        <ChecklistIcon />
                      </button>
                      <button
                        aria-label="Bullet points"
                        onClick={() => makeList(t, "bullet")}
                        className="rounded px-2 py-1 text-sm hover:bg-stone-100"
                      >
                        {BULLET}
                      </button>
                      <button
                        onClick={() => makeList(t, "number")}
                        className="rounded px-2 py-1 text-sm hover:bg-stone-100"
                      >
                        1.2.3.
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateText(t.id, { bold: !t.bold })}
                        className={`rounded px-2 py-1 text-left text-sm font-bold ${t.bold ? "bg-stone-200" : "hover:bg-stone-100"}`}
                      >
                        Bold
                      </button>
                      {/* Background fill for the whole text (none to start with). */}
                      <button
                        aria-label="No fill"
                        onClick={() => updateText(t.id, { bg: undefined })}
                        className={`size-5 rounded border border-stone-300 bg-[linear-gradient(135deg,transparent_45%,#d6d3d1_45%,#d6d3d1_55%,transparent_55%)] ${t.bg ? "" : "ring-2 ring-stone-400 ring-offset-1"}`}
                      />
                      {TEXT_FILLS.map((fill) => (
                        <button
                          key={fill}
                          aria-label={`Fill ${fill}`}
                          onClick={() => updateText(t.id, { bg: fill })}
                          className={`size-5 rounded border border-stone-200 ${t.bg === fill ? "ring-2 ring-stone-400 ring-offset-1" : ""}`}
                          style={{ background: fill }}
                        />
                      ))}
                    </div>
                    {layerButton(keyOf("text", t.id))}
                    {/* A deadline task: delete it for good, here and on Home. */}
                    {t.deadline && (
                      <button
                        data-delete-deadline
                        onClick={() => {
                          if (!window.confirm("Delete this deadline task for good? It's removed from Home too."))
                            return;
                          setSelection([]);
                          removeKeys([keyOf("text", t.id)]);
                          if (t.link) void planner?.removePriority?.(t.link).catch(() => {});
                        }}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                      >
                        <TrashIcon />
                        Delete
                      </button>
                    )}
                    {planner ? (
                      <LinkMenu onAdd={(to) => addTextTo(t, to)} taskPages={planner.taskPages} />
                    ) : (
                      <LinkButton />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {single?.startsWith("picture:") &&
          (() => {
            const p = pictures.find((x) => x.id === singleId);
            const layer = p && layerButton(keyOf("picture", p.id));
            if (!p || !layer) return null;
            return (
              <div
                data-menu="picture"
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute min-w-40 rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
                style={{ left: p.x + p.w / 2 + 8, top: p.y - p.h / 2, zIndex: TOP_LAYER }}
              >
                {layer}
              </div>
            );
          })()}

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
                    return { left: mid.x + 12, top: mid.y + 12, zIndex: TOP_LAYER };
                  })()}
                >
                  <LineMenu
                    key={l.id}
                    time={l.time}
                    color={l.color}
                    onColor={(color) => updateLine(l.id, { color })}
                    width={l.width ?? LINE_WIDTH}
                    onWidth={(width) => updateLine(l.id, { width })}
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
                  style={{ zIndex: TOP_LAYER }}
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
                      data-selected={selectedBend?.lineId === l.id && selectedBend.index === i ? "yes" : undefined}
                      fill={selectedBend?.lineId === l.id && selectedBend.index === i ? SELECT_BLUE : "white"}
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
                        zIndex: TOP_LAYER,
                      }}
                    >
                      <svg
                        width="70%"
                        height="70%"
                        viewBox="0 0 16 16"
                        style={{ transform: `rotate(${Math.atan2(d.y, d.x)}rad)` }}
                      >
                        <path
                          d="M2 8 H12 M8 4 L12 8 L8 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
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
            // A phase made between smaller steps only has its colours.
            const ends = selectedLine.time?.startSub !== undefined;
            const { p: at, dir } = pointAlong(pts, len / 3);
            // Beside the line, on its upper or left side, clear of the line
            // itself so it never covers an end dot.
            let n = { x: dir.y, y: -dir.x };
            if (n.y > 1e-6 || (Math.abs(n.y) <= 1e-6 && n.x > 0)) n = { x: -n.x, y: -n.y };
            const toSide = Math.abs(n.x) > Math.abs(n.y);
            return (
              <div
                data-menu="phase"
                onPointerDown={(e) => e.stopPropagation()}
                className={`absolute flex flex-col rounded-lg border border-stone-200 bg-white p-1 shadow-lg ${toSide ? "-translate-x-full -translate-y-1/2" : "-translate-x-1/2 -translate-y-full"}`}
                style={{ left: at.x + n.x * px(14), top: at.y + n.y * px(14), zIndex: TOP_LAYER }}
              >
                {!ends && (
                  <button
                    onClick={() => {
                      setSelection([]);
                      setPhase({ lineId: selectedLine.id, start: null, hover: 0 });
                    }}
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100"
                  >
                    Phase
                  </button>
                )}
                {!ends && planner && (
                  <button
                    data-deadline-task
                    onClick={() => {
                      setDeadlineFor(deadlineFor === selectedLine.id ? null : selectedLine.id);
                      setDeadlineError(null);
                    }}
                    className={`w-full rounded px-2 py-1 text-left text-sm ${deadlineFor === selectedLine.id ? "bg-stone-100" : "hover:bg-stone-100"}`}
                  >
                    Deadline task
                  </button>
                )}
                {deadlineFor === selectedLine.id && (
                  <form
                    data-deadline-form
                    className="space-y-1 px-2 py-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const at = new Date(deadlineInput);
                      if (!deadlineInput || isNaN(at.getTime())) return setDeadlineError("Pick a date and time.");
                      if (!addDeadlineText(selectedLine, at))
                        return setDeadlineError("That date isn't on this timeline.");
                      setDeadlineFor(null);
                      setDeadlineInput("");
                    }}
                  >
                    <label className="block text-xs text-stone-500">
                      Deadline
                      <input
                        type="datetime-local"
                        autoFocus
                        value={deadlineInput}
                        onChange={(e) => {
                          setDeadlineInput(e.target.value);
                          setDeadlineError(null);
                        }}
                        className="mt-0.5 block rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
                      />
                    </label>
                    {deadlineError && <p className="text-xs text-red-600">{deadlineError}</p>}
                    <button className="w-full rounded bg-stone-900 px-2 py-1 text-sm font-medium text-white">
                      Make task
                    </button>
                  </form>
                )}
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
                {!ends && (
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
                )}
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
                style={{
                  left: at.x,
                  top: at.y + MAJOR_TICK * PIN_GROW + TICK_LABEL_SIZE * PIN_GROW * 2 + px(8),
                  zIndex: TOP_LAYER,
                }}
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
            style={{
              left: menuCircle.x + menuCircle.size / 2 + 8,
              top: menuCircle.y - menuCircle.size / 2,
              zIndex: TOP_LAYER,
            }}
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
            {layerButton(keyOf("circle", menuCircle.id))}
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
                zIndex: TOP_LAYER,
              }}
            />
          ))}

        {menuSquare && (
          <div
            data-menu="square"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute flex min-w-40 flex-col gap-1 rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
            style={{
              left: menuSquare.x + menuSquare.w / 2 + 8 + px(8),
              top: menuSquare.y - menuSquare.h / 2,
              zIndex: TOP_LAYER,
            }}
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
            {layerButton(keyOf("square", menuSquare.id))}
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
              zIndex: TOP_LAYER,
            }}
          />
        )}
        {groupBox && (
          // Beside the selection box; stays the same size on screen.
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute flex origin-top-left flex-col items-start gap-1"
            style={{
              left: groupBox.maxX + px(12),
              top: groupBox.minY - px(6),
              transform: `scale(${1 / view.scale})`,
              zIndex: TOP_LAYER,
            }}
          >
            <button
              data-group-button
              onClick={() => toggleGroup(isOneGroup)}
              className="rounded-md border border-stone-200 bg-white px-2 py-1 text-sm shadow"
            >
              {isOneGroup ? "Ungroup" : "Group"}
            </button>
            {/* Only lines selected: one thickness for them all. */}
            {selection.every((k) => k.startsWith("line:")) && (
              <div className="rounded-md border border-stone-200 bg-white shadow">
                <LineWidths
                  value={(() => {
                    const ws = new Set(
                      lines.filter((l) => selection.includes(keyOf("line", l.id))).map((l) => l.width ?? LINE_WIDTH),
                    );
                    return ws.size === 1 ? [...ws][0] : undefined;
                  })()}
                  onPick={(width) => {
                    commit();
                    const ids = idsOf(selection, "line");
                    setLines((ls) => ls.map((l) => (ids.has(l.id) ? { ...l, width } : l)));
                  }}
                />
              </div>
            )}
            {/* One colour for everything selected. */}
            <div
              data-group-colors
              className="flex gap-1.5 rounded-md border border-stone-200 bg-white px-2 py-1.5 shadow"
            >
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  aria-label={`Colour ${color}`}
                  onClick={() => colorSelection(color)}
                  className="size-5 rounded-full"
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {!viewing && (selection.length > 1 || (editingPreset && selection.length > 0)) && (
        <button
          data-preset-button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={savePreset}
          className="absolute top-4 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium shadow"
          style={{ right: menuOpen ? SIDE_MENU_W + 16 : 16 }}
        >
          {presetSaved ? "Preset saved" : editingPreset ? "Update preset" : "Save preset"}
        </button>
      )}

      {/* View mode: a switch at the top shows it's on; pressing it turns it off. */}
      {viewing && (
        <button
          data-view-switch
          role="switch"
          aria-checked
          onClick={toggleView}
          className="animate-pop fixed left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white py-1.5 pl-4 pr-1.5 text-sm font-medium shadow-[0_2px_10px_rgba(0,0,0,0.15)]"
          style={{ zIndex: TOP_LAYER }}
        >
          View mode
          <span className="relative h-5 w-9 rounded-full bg-stone-900">
            <span className="absolute left-[18px] top-0.5 size-4 rounded-full bg-white" />
          </span>
        </button>
      )}

      {isTouch && !viewing && (
        <div
          data-toolbar
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
        >
          {lineMode && (
            <span className="rounded-md bg-stone-900 px-2 py-1 text-xs text-white">Drag to draw a line</span>
          )}
          <div className="flex rounded-xl border border-stone-200 bg-white p-1 shadow-lg">
            {(
              [
                ["Circle", () => addCircle(screenCentre()), false, false],
                ["Line", () => setLineMode((m) => !m), lineMode, false],
                ["Text", () => addText(screenCentre()), false, false],
                ["Undo", undo, false, false],
                ["Redo", redo, false, false],
                ["Delete", deleteSelection, false, selection.length === 0],
                ["Presets", () => setMenuOpen((o) => !o), menuOpen, false],
              ] as const
            ).map(([label, onClick, on, disabled]) => (
              <button
                key={label}
                data-tool={label}
                onClick={onClick}
                disabled={disabled}
                aria-pressed={on}
                className={`flex w-12 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium disabled:text-stone-300 ${on ? "bg-stone-900 text-white" : "active:bg-stone-100"}`}
              >
                <ToolIcon tool={label} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {menuOpen && (
        <SideMenu
          presets={presets}
          onUse={(p) => {
            setEditingPreset(null);
            placePreset(p);
          }}
          onEdit={(p) => {
            placePreset(p);
            setEditingPreset(p.id);
          }}
          onDelete={(p) => {
            if (editingPreset === p.id) setEditingPreset(null);
            onDeletePreset?.(p.id);
          }}
        />
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

// Which line of a text has its first checkbox (-1: none).
function firstBoxLine(text: string) {
  return text.split("\n").findIndex((line) => {
    const c = line.trimStart()[0];
    return c === UNCHECKED || c === CHECKED;
  });
}

// The text with its first checkbox set to `box`, or (with none) a box added
// to the start of its first line.
function withFirstBox(t: Text, box: string): Text {
  const lines = t.text.split("\n");
  let i = firstBoxLine(t.text);
  const add = i === -1;
  if (add) i = 0;
  const indent = lines[i].match(/^ */)![0];
  const at = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0) + indent.length;
  const text = add
    ? t.text.slice(0, at) + box + " " + t.text.slice(at)
    : t.text.slice(0, at) + box + t.text.slice(at + 1);
  const runs =
    t.runs &&
    mergeRuns(
      add
        ? [...sliceRuns(t.runs, 0, at), { text: box + " " }, ...sliceRuns(t.runs, at)]
        : [
            ...sliceRuns(t.runs, 0, at),
            { ...sliceRuns(t.runs, at, at + 1)[0], text: box },
            ...sliceRuns(t.runs, at + 1),
          ],
    );
  return { ...t, text, runs };
}

// A text as a task's words: its lines without checkboxes, bullets or numbers.
function taskText(text: string) {
  return text
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(new RegExp(`^(${UNCHECKED}|${CHECKED}|${BULLET}|\\d+\\.)\\s*`), "")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
}
