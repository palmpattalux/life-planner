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
