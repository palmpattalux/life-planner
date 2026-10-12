// What a board is made of. Plain data, so a board can be undone, copied,
// saved and loaded as one object.
import type { Point } from "./geometry";
import type { Run } from "./richText";
import type { Timeline } from "./timeline";

// `group`: things grouped together share a group number and are selected
// and moved as one.
// `z`: the layer, for things that overlap (Move to front / back). Higher is
// in front; left out is 0. Lines are always underneath.
export type Circle = { id: number; x: number; y: number; size: number; group?: number; z?: number };
// A square outline (made from a circle); its corners can be dragged to make
// it any rectangle. Only its outline can be clicked. `label` is the text at
// its outer top left, in the square's colour. x, y is the centre.
export type Square = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label?: string;
  group?: number;
  z?: number;
};
export type Text = {
  id: number;
  x: number; // centre
  y: number;
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
  bg?: string; // background fill; left out: none
  // Parts with their own size, boldness or colour. Left out when the whole
  // text looks the same; otherwise the runs' text joined is `text`.
  runs?: Run[];
  // Added to Home's to-do list or the phase goal: the text's first checkbox
  // is ticked and unticked together with the task there (see lib/planner).
  link?: string;
  group?: number;
  z?: number;
};
// A picture pasted in from outside the site. x, y is the centre; `src` is
// where it's stored (or the picture itself, as a data: address).
export type Picture = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  group?: number;
  z?: number;
};
// A line end is either a free point or attached to a circle or text
// (fromItem / toItem), in which case it sits at that item's centre and
// follows it. `bends` are the angle points between the two ends.
// A line with `time` is drawn as a timeline: a ruler of evenly spaced dates.
export type Line = {
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
  // A phase made from another timeline: drawn as a bracket, like "]", whose
  // ends curl toward that timeline, showing only its first and last dates.
  // 1 or -1: which side the ends curl to (of the line's direction turned
  // a quarter anticlockwise on screen).
  bracket?: 1 | -1;
  group?: number;
};
export type Pin = { value: string; bold: boolean; color: string };
export type End = "from" | "to";
// Everything on the board. Kept as one object so every change can be undone
// and saved in one piece.
export type BoardData = { circles: Circle[]; squares: Square[]; texts: Text[]; lines: Line[]; pictures: Picture[] };
export const EMPTY_BOARD: BoardData = { circles: [], squares: [], texts: [], lines: [], pictures: [] };
// A board as saved, which may be from before some kinds of things existed.
export const fullBoard = (d?: Partial<BoardData> | null): BoardData => ({ ...EMPTY_BOARD, ...d });
// A saved group of things that can be placed on any board again.
export type Preset = { id: string; name: string; data: BoardData };

export type Kind = "circle" | "square" | "text" | "line" | "picture";
// Selected things, as "circle:3", "text:7", "line:2".
export type Key = `${Kind}:${number}`;

export const keyOf = (kind: Kind, id: number): Key => `${kind}:${id}`;
// Every thing on the board, as keys.
export const allKeys = (d: BoardData): Key[] => [
  ...d.circles.map((c) => keyOf("circle", c.id)),
  ...d.squares.map((q) => keyOf("square", q.id)),
  ...d.texts.map((t) => keyOf("text", t.id)),
  ...d.lines.map((l) => keyOf("line", l.id)),
  ...d.pictures.map((p) => keyOf("picture", p.id)),
];
export const idsOf = (sel: Key[], kind: Kind) =>
  new Set(sel.filter((k) => k.startsWith(kind + ":")).map((k) => Number(k.split(":")[1])));

// The biggest id or group number used on a board, so new ones don't clash.
export function maxId(data: BoardData) {
  const items = [...data.circles, ...data.squares, ...data.texts, ...data.lines, ...data.pictures];
  return Math.max(0, ...items.flatMap((i) => [i.id, i.group ?? 0]));
}
