import type { Point } from "./geometry";
import type { Key } from "./model";

// A circle, square or text as a box, for snapping things in line. Lines
// snap by their points (ends, bends and timeline marks) as zero-size boxes,
// and only to other lines' points (`line: true`). A line's middle (`mid`) is
// a target only: a circle, square or text's centre snaps to it, across the
// line ("x": a level line, so the text sits centred above or below it) or
// along it ("y": an upright line). A line's free tip (`tip`) is a target
// too: a circle, square or text's centre snaps in line with it either way,
// so a text above an upright line can sit centred on it. A dragged line
// point also snaps in line with the centres of circles, squares and texts.
export type SnapBox = {
  key: Key;
  x: number;
  y: number;
  w: number;
  h: number;
  line?: boolean;
  mid?: "x" | "y";
  tip?: boolean;
};
export type Guide = { a: Point; b: Point };

// How far to nudge things being dragged (by dx, dy) so an edge or middle of
// one of them lines up with an edge or middle of another circle, square or
// text, like in Canva, and the guide lines to show. They all move together.
// `reach` is how close counts, in board units.
export function snapBoxes(moving: SnapBox[], dx: number, dy: number, all: SnapBox[], reach: number) {
  const movingKeys = new Set(moving.map((q) => q.key));
  const others = all.filter((s) => !movingKeys.has(s.key));
  const lineOf = (s: SnapBox, key: "x" | "y", size: "w" | "h") => [s[key] - s[size] / 2, s[key], s[key] + s[size] / 2];
  const axis = (key: "x" | "y", size: "w" | "h", shift: number) => {
    let best: { delta: number; at: number } | null = null;
    for (const q of moving) {
      if (q.mid || q.tip) continue;
      const mine = lineOf({ ...q, [key]: q[key] + shift }, key, size);
      for (const o of others) {
        // A line's middle: only centres snap to it, and only across the line.
        if (o.mid) {
          if (q.line || o.mid !== key) continue;
          const delta = o[key] - mine[1];
          if (Math.abs(delta) <= reach && (!best || Math.abs(delta) < Math.abs(best.delta)))
            best = { delta, at: o[key] };
          continue;
        }
        // A line's tip, or a line point lining up with a centre: centres only.
        if (o.tip || (q.line && !o.line)) {
          if (o.tip && q.line) continue;
          const delta = o[key] - mine[1];
          if (Math.abs(delta) <= reach && (!best || Math.abs(delta) < Math.abs(best.delta)))
            best = { delta, at: o[key] };
          continue;
        }
        // Lines snap to lines; circles, squares and texts to each other.
        if (!!o.line !== !!q.line) continue;
        for (const target of lineOf(o, key, size)) {
          for (const m of mine) {
            const delta = target - m;
            if (Math.abs(delta) <= reach && (!best || Math.abs(delta) < Math.abs(best.delta)))
              best = { delta, at: target };
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
  const lines: Guide[] = [];
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
export function keptGuides(guides: Guide[], snapped: Point, final: Point) {
  return guides.filter((g) => (g.a.x === g.b.x ? final.x === snapped.x : final.y === snapped.y));
}
