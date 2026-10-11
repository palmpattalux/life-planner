import type { Point } from "./geometry";

// Browsers don't say whether a wheel event came from a mouse or a trackpad.
// Trackpads send pixel deltas that are small, fractional or sideways; mouse
// wheels send big whole-number steps straight up or down.
export function isTrackpadSwipe(e: WheelEvent) {
  if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
  if (e.deltaX !== 0) return true;
  return !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50;
}

// A point nearly level or upright with `anchor` (within a few degrees) is put
// exactly level or upright with it, so lines snap straight.
export const STRAIGHT_SNAP_DEG = 3;
export function straighten(p: Point, anchor: Point): Point {
  const dx = Math.abs(p.x - anchor.x);
  const dy = Math.abs(p.y - anchor.y);
  const limit = Math.tan((STRAIGHT_SNAP_DEG * Math.PI) / 180);
  if (dx > 0 && dy / dx < limit) return { x: p.x, y: anchor.y };
  if (dy > 0 && dx / dy < limit) return { x: anchor.x, y: p.y };
  return p;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
