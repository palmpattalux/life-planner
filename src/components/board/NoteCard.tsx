"use client";

import { useRef } from "react";

// A page: a note on the board (N tapped, not held).
export function PageIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      fill="white"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M3.5 1.5 H10 L13 4.5 V14.5 H3.5 Z" />
      <path d="M10 1.5 V4.5 H13" fill="none" />
      <path d="M5.5 7.5 H11 M5.5 9.75 H11 M5.5 12 H9" fill="none" />
    </svg>
  );
}

// A note's few lines, shown by its page icon: just the words with an Edit
// button, or a box to write them in. It stays the same size on screen
// whatever the zoom (`scale` is the board's).
export function NoteCard({
  note,
  scale,
  editing,
  onEdit,
  onDone,
  onPointerEnter,
  onPointerLeave,
}: {
  note: string;
  scale: number;
  editing: boolean;
  onEdit?: () => void;
  onDone: (note: string) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  return (
    <div
      data-note-card
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="w-60 cursor-auto rounded-lg border border-stone-200 bg-white p-2 text-left text-sm font-normal text-stone-800 shadow-lg"
      style={{ transform: `scale(${1 / scale})`, transformOrigin: "top left", lineHeight: 1.4 }}
    >
      {editing ? (
        <>
          <textarea
            ref={box}
            autoFocus
            data-note-input
            defaultValue={note}
            placeholder="Write a note…"
            rows={5}
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            onBlur={(e) => onDone(e.currentTarget.value.trimEnd())}
            className="block w-full resize-none rounded bg-stone-100 p-1.5 outline-none"
          />
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={() => box.current?.blur()}
              className="rounded px-2 py-0.5 text-sm font-medium hover:bg-stone-100"
            >
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words">
            {note || <span className="text-stone-400">Empty note</span>}
          </p>
          {onEdit && (
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                data-note-edit
                onClick={onEdit}
                className="rounded px-2 py-0.5 text-sm font-medium hover:bg-stone-100"
              >
                Edit
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
