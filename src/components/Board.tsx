"use client";

import { useEffect, useRef, useState } from "react";

type Circle = { id: number; x: number; y: number };

const SIZE = 64;
// Moving less than this many pixels between press and release counts as a click.
const CLICK_SLOP = 4;

// A blank white board. Press "b" to add a circle at the cursor.
// Drag a circle to move it; click it to open its menu.
export function Board() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    id: number;
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "b" || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const at = pointer.current ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      setCircles((cs) => [...cs, { id: nextId.current++, x: at.x, y: at.y }]);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onPointerMove(e: React.PointerEvent) {
    pointer.current = { x: e.clientX, y: e.clientY };
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < CLICK_SLOP) return;
    d.moved = true;
    setCircles((cs) =>
      cs.map((c) => (c.id === d.id ? { ...c, x: e.clientX - d.dx, y: e.clientY - d.dy } : c)),
    );
  }

  function onCirclePointerDown(e: React.PointerEvent, c: Circle) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: c.id,
      dx: e.clientX - c.x,
      dy: e.clientY - c.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) setMenuFor((open) => (open === d.id ? null : d.id));
  }

  const menuCircle = circles.find((c) => c.id === menuFor);

  return (
    <div
      className="fixed inset-0 touch-none select-none overflow-hidden bg-white"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      // Clicking empty board closes the menu.
      onPointerDown={() => setMenuFor(null)}
    >
      {circles.map((c) => (
        <div
          key={c.id}
          onPointerDown={(e) => onCirclePointerDown(e, c)}
          className="absolute cursor-grab rounded-full border-2 border-stone-900 bg-white active:cursor-grabbing"
          style={{ width: SIZE, height: SIZE, left: c.x - SIZE / 2, top: c.y - SIZE / 2 }}
        />
      ))}

      {menuCircle && (
        <div
          data-menu
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute min-h-24 w-40 rounded-lg border border-stone-200 bg-white shadow-lg"
          style={{ left: menuCircle.x + SIZE / 2 + 8, top: menuCircle.y - SIZE / 2 }}
        />
      )}
    </div>
  );
}
