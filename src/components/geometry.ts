// Small geometry helpers for lines that can bend (polylines).

export type Point = { x: number; y: number };

export function dist(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function unit(from: Point, to: Point): Point {
  const d = dist(from, to) || 1;
  return { x: (to.x - from.x) / d, y: (to.y - from.y) / d };
}

export function polylineLength(points: Point[]) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

// The point `d` along the polyline, and the direction of the segment it's on.
export function pointAlong(points: Point[], d: number): { p: Point; dir: Point } {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = dist(a, b);
    if (d <= seg || i === points.length - 1) {
      const t = seg ? Math.min(1, Math.max(0, d / seg)) : 0;
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dir: unit(a, b) };
    }
    d -= seg;
  }
  return { p: points[0], dir: { x: 1, y: 0 } };
}

// Distance from p to the straight piece a-b.
export function distToSegment(p: Point, a: Point, b: Point) {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2)) : 0;
  return dist(p, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
}

// Index (in `points`) to insert a new bend at: the middle of the straight
// piece nearest `near` (where the line was clicked), or else of the longest.
export function newBend(points: Point[], near?: Point): { index: number; at: Point } {
  let best = 1;
  for (let i = 2; i < points.length; i++) {
    const better = near
      ? distToSegment(near, points[i - 1], points[i]) < distToSegment(near, points[best - 1], points[best])
      : dist(points[i - 1], points[i]) > dist(points[best - 1], points[best]);
    if (better) best = i;
  }
  const a = points[best - 1];
  const b = points[best];
  return { index: best, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export function boxAround(points: Point[]): Box {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

export function boxContains(outer: Box, inner: Box) {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

export function mergeBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

export function boxesTouch(a: Box, b: Box) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function circleTouchesBox(c: Point, r: number, box: Box) {
  const x = Math.min(box.maxX, Math.max(box.minX, c.x));
  const y = Math.min(box.maxY, Math.max(box.minY, c.y));
  return dist(c, { x, y }) <= r;
}

// Whether the straight piece a-b passes through the box (clipping a to b
// against each side of the box).
export function segmentTouchesBox(a: Point, b: Point, box: Box) {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sides: [number, number][] = [
    [-dx, a.x - box.minX],
    [dx, box.maxX - a.x],
    [-dy, a.y - box.minY],
    [dy, box.maxY - a.y],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

// How far along the polyline the point nearest to p is.
export function distanceAlong(points: Point[], p: Point): number {
  let best = Infinity;
  let bestAlong = 0;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = dist(a, b);
    const t = seg ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (seg * seg))) : 0;
    const d = dist(p, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (d < best) {
      best = d;
      bestAlong = walked + seg * t;
    }
    walked += seg;
  }
  return bestAlong;
}

// The part of the polyline from distance d1 to d2 along it (d1 <= d2).
export function subPolyline(points: Point[], d1: number, d2: number): Point[] {
  const out = [pointAlong(points, d1).p];
  let walked = 0;
  for (let i = 1; i < points.length - 1; i++) {
    walked += dist(points[i - 1], points[i]);
    if (walked > d1 && walked < d2) out.push(points[i]);
  }
  out.push(pointAlong(points, d2).p);
  return out;
}

// The polyline moved sideways by `by` (each corner moved along the average of
// its two sides' sideways directions). Positive `by` is to the left of the
// direction of travel on screen (y pointing down).
export function offsetPolyline(points: Point[], by: number): Point[] {
  const side = (a: Point, b: Point) => {
    const d = unit(a, b);
    return { x: d.y, y: -d.x };
  };
  return points.map((p, i) => {
    const before = i > 0 ? side(points[i - 1], p) : null;
    const after = i < points.length - 1 ? side(p, points[i + 1]) : null;
    const n = before && after ? unit({ x: 0, y: 0 }, { x: before.x + after.x, y: before.y + after.y }) : (before ?? after)!;
    return { x: p.x + n.x * by, y: p.y + n.y * by };
  });
}
