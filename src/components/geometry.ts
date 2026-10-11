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

// Index (in `points`) to insert a new bend at: the middle of the longest segment.
export function newBend(points: Point[]): { index: number; at: Point } {
  let best = 1;
  for (let i = 2; i < points.length; i++) {
    if (dist(points[i - 1], points[i]) > dist(points[best - 1], points[best])) best = i;
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
