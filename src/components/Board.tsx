"use client";

import { useEffect, useRef, useState } from "react";

type Circle = { id: number; x: number; y: number };

const SIZE = 64;

// A blank white board. Press "b" to add a circle at the cursor, then drag it.
export function Board() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
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
    setCircles((cs) =>
      cs.map((c) => (c.id === d.id ? { ...c, x: e.clientX - d.dx, y: e.clientY - d.dy } : c)),
    );
  }

  function startDrag(e: React.PointerEvent, c: Circle) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: c.id, dx: e.clientX - c.x, dy: e.clientY - c.y };
  }

  return (
    <div
      className="fixed inset-0 touch-none select-none overflow-hidden bg-white"
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      {circles.map((c) => (
        <div
          key={c.id}
          onPointerDown={(e) => startDrag(e, c)}
          className="absolute cursor-grab rounded-full border-2 border-stone-900 bg-white active:cursor-grabbing"
          style={{ width: SIZE, height: SIZE, left: c.x - SIZE / 2, top: c.y - SIZE / 2 }}
        />
      ))}
    </div>
  );
}
