"use client";

import type { Task } from "@/lib/planner";

// The arrow after a hovered task that opens its own page (a note), with
// "Note" over it while it's hovered. Pressed, not clicked: before the line
// loses focus (which hides the arrow on a phone).
export function NoteButton({ task, opening, onOpen }: { task: Task; opening: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-task-arrow
      aria-label={`Open "${task.text}"`}
      onPointerDown={(e) => {
        e.preventDefault();
        onOpen();
      }}
      data-pop
      className="group/note relative animate-pop rounded-full px-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
    >
      {opening ? "…" : "→"}
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-stone-900 px-1.5 py-0.5 text-[11px] text-white opacity-0 transition-opacity group-hover/note:opacity-100">
        Note
      </span>
    </button>
  );
}
