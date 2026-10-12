// Merging one board's things into another board.
import { EMPTY_BOARD, maxId, type BoardData } from "./model";

// Past this many things, or this much saved data, a board may start to feel
// slow (every move redraws and snaps against everything on it).
export const SLOW_ITEMS = 1000;
export const SLOW_BYTES = 1_000_000;
// The space left between what's already on the board and what's merged in.
const MERGE_GAP = 200;

export const itemCount = (d: BoardData) => d.circles.length + d.squares.length + d.texts.length + d.lines.length;

// Whether a board this big might be slow.
export const mightBeSlow = (d: BoardData) => itemCount(d) > SLOW_ITEMS || JSON.stringify(d).length > SLOW_BYTES;

// Roughly the area everything on a board covers (texts are estimated from
// their length, since there is no page to measure them on here).
function bounds(d: BoardData) {
  const boxes = [
    ...d.circles.map((c) => [c.x - c.size / 2, c.y - c.size / 2, c.x + c.size / 2, c.y + c.size / 2]),
    ...d.squares.map((q) => [q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2]),
    ...d.texts.map((t) => {
      const rows = t.text.split("\n");
      const w = (Math.max(...rows.map((r) => r.length)) * t.fontSize * 0.55) / 2;
      const h = (rows.length * t.fontSize * 1.2) / 2;
      return [t.x - w, t.y - h, t.x + w, t.y + h];
    }),
    ...d.lines.flatMap((l) => [l.from, l.to, ...(l.bends ?? [])].map((p) => [p.x, p.y, p.x, p.y])),
  ];
  if (boxes.length === 0) return null;
  return {
    minX: Math.min(...boxes.map((b) => b[0])),
    minY: Math.min(...boxes.map((b) => b[1])),
    maxX: Math.max(...boxes.map((b) => b[2])),
  };
}

// `target` with a copy of everything in `source` added, to the right of what
// the target already has. The copies get new ids (and group numbers) so
// nothing clashes; lines stay attached to the same things.
export function mergeInto(target: BoardData, source: BoardData): BoardData {
  const t = { ...EMPTY_BOARD, ...target };
  const s = structuredClone({ ...EMPTY_BOARD, ...source });
  const tb = bounds(t);
  const sb = bounds(s);
  const dx = tb && sb ? tb.maxX + MERGE_GAP - sb.minX : 0;
  const dy = tb && sb ? tb.minY - sb.minY : 0;
  const move = <P extends { x: number; y: number }>(p: P): P => ({ ...p, x: p.x + dx, y: p.y + dy });

  let next = maxId(t) + 1;
  const ids = new Map<number, number>();
  const newId = (old: number) => {
    if (!ids.has(old)) ids.set(old, next++);
    return ids.get(old)!;
  };
  const groups = new Map<number, number>();
  const newGroup = (g?: number) => {
    if (g === undefined) return undefined;
    if (!groups.has(g)) groups.set(g, next++);
    return groups.get(g);
  };
  // Items first, so lines can find their new ids.
  const circles = s.circles.map((c) => ({ ...move(c), id: newId(c.id), group: newGroup(c.group) }));
  const squares = s.squares.map((q) => ({ ...move(q), id: newId(q.id), group: newGroup(q.group) }));
  const texts = s.texts.map((x) => ({ ...move(x), id: newId(x.id), group: newGroup(x.group) }));
  const itemIds = new Set([...s.circles, ...s.squares, ...s.texts].map((i) => i.id));
  const attached = (id?: number) => (id !== undefined && itemIds.has(id) ? newId(id) : undefined);
  const lines = s.lines.map((l) => ({
    ...l,
    id: next++,
    from: move(l.from),
    to: move(l.to),
    bends: l.bends?.map(move),
    fromItem: attached(l.fromItem),
    toItem: attached(l.toItem),
    group: newGroup(l.group),
  }));
  return {
    circles: [...t.circles, ...circles],
    squares: [...t.squares, ...squares],
    texts: [...t.texts, ...texts],
    lines: [...t.lines, ...lines],
  };
}
