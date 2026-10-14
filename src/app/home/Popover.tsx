"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const EDGE = 8;

// A small box that pops up just under (or above, if there's no room) the
// thing it belongs to (`anchor`), always fully on the screen. It sits above
// everything, so it can reach past the box it was opened from. Clicking
// anywhere else, or Escape, calls onClose.
export function Popover({
  anchor,
  onClose,
  children,
  ...rest
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    function place() {
      const el = ref.current;
      if (!el || !anchor) return;
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const below = a.bottom + 6;
      const top = below + h <= H - EDGE ? below : Math.max(EDGE, a.top - 6 - h);
      const left = Math.min(Math.max(a.left, EDGE), W - w - EDGE);
      setAt({ left, top });
    }
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  useEffect(() => {
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor?.contains(t)) close.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close.current();
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      {...rest}
      className={`fixed z-50 rounded-lg border border-stone-200 bg-white p-2 shadow-lg ${rest.className ?? ""}`}
      style={{ left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? undefined : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
