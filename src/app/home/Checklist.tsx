"use client";

import { useEffect, useRef, useState } from "react";
import { CheckMark } from "@/components/board/icons";
import { INK } from "@/components/board/constants";
import { newTask, type Task } from "@/lib/planner";

// A list of tasks, each a checkbox and its words. Clicking the empty part of
// the list starts a new line with a checkbox, ready to type. Enter starts the
// next line (also with a checkbox); Enter on an empty line, or clicking
// elsewhere, finishes. Backspace on an empty line removes it.
// `arrow`: something to show just after a task's words while it's hovered
// (or, on a phone, pressed). `extra`: something always shown after a task's
// words. `reorder`: each task gets a handle on its left (shown on hover) to
// drag it up or down the list.
export function Checklist({
  tasks,
  onChange,
  onCheck,
  arrow,
  extra,
  placeholder = "Add a task",
  focusRequest = 0,
  reorder = false,
}: {
  tasks: Task[];
  onChange: (tasks: Task[]) => void;
  // A linked task was ticked or unticked.
  onCheck?: (task: Task, done: boolean) => void;
  arrow?: (task: Task) => React.ReactNode;
  extra?: (task: Task) => React.ReactNode;
  placeholder?: string;
  // Changing this number starts typing (a new line if the list is empty).
  focusRequest?: number;
  reorder?: boolean;
}) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [focusId, setFocusId] = useState<string | null>(null);
  const latest = useRef(tasks);
  latest.current = tasks;

  // Put the caret in a line once it's on the page.
  useEffect(() => {
    if (!focusId) return;
    const el = inputs.current.get(focusId);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      setFocusId(null);
    }
  }, [focusId, tasks]);

  function startTyping() {
    const list = latest.current;
    const last = list[list.length - 1];
    if (last && !last.text.trim()) return setFocusId(last.id);
    const t = newTask();
    onChange([...list, t]);
    setFocusId(t.id);
  }

  useEffect(() => {
    if (focusRequest) startTyping();
  }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // The task being dragged by its handle: it moves to wherever the pointer is
  // over the list as it goes.
  const listRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragTo = (clientY: number) => {
    const list = latest.current;
    const from = list.findIndex((t) => t.id === draggingRef.current);
    if (from === -1 || !listRef.current) return;
    const rows = [...listRef.current.querySelectorAll<HTMLElement>("[data-task]")];
    let to = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return clientY < b.top + b.height / 2;
    });
    if (to === -1) to = rows.length - 1;
    else if (to > from) to -= 1;
    if (to === from) return;
    const next = [...list];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const dragToRef = useRef(dragTo);
  dragToRef.current = dragTo;
  // Followed on the whole window: the row moves in the page as it's
  // dragged, which would otherwise lose the pointer.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => dragToRef.current(e.clientY);
    const up = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);

  const update = (id: string, patch: Partial<Task>) =>
    onChange(latest.current.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  return (
    <div
      ref={listRef}
      data-checklist
      className="min-h-8 cursor-text"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        e.stopPropagation();
        startTyping();
      }}
    >
      {tasks.length === 0 && (
        <button type="button" onClick={startTyping} className="w-full py-1 text-left text-sm text-stone-400">
          {placeholder}
        </button>
      )}
      {tasks.map((t, i) => (
        <div
          key={t.id}
          data-task={t.id}
          className={`group group/task relative flex items-center gap-2 py-0.5 ${dragging === t.id ? "opacity-60" : ""}`}
        >
          {reorder && t.text.trim() && (
            <span
              data-drag-handle
              aria-label="Drag to move"
              title="Drag to move"
              onPointerDown={(e) => {
                e.preventDefault();
                setDragging(t.id);
              }}
              className={`absolute -left-4 flex h-5 w-3 cursor-grab touch-none items-center justify-center text-stone-400 active:cursor-grabbing group-hover/task:opacity-100 [@media(hover:none)]:opacity-50 ${dragging === t.id ? "opacity-100" : "opacity-0"}`}
            >
              <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                {[2, 6, 10].map((y) => (
                  <g key={y}>
                    <circle cx="2" cy={y} r="1.1" />
                    <circle cx="6" cy={y} r="1.1" />
                  </g>
                ))}
              </svg>
            </span>
          )}
          <button
            type="button"
            role="checkbox"
            aria-checked={t.done}
            aria-label={t.done ? "Untick" : "Tick"}
            onClick={() => {
              update(t.id, { done: !t.done });
              if (t.link) onCheck?.(t, !t.done);
            }}
            className="relative size-4 shrink-0 rounded-[3px] border-[1.5px] border-stone-800"
          >
            {t.done && <CheckMark color={INK} />}
          </button>
          {/* The input is as wide as its words, so the arrow sits right after them. */}
          <span className="inline-grid min-w-0 max-w-full">
            <span className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre text-sm">
              {t.text || " "}
            </span>
            <input
              ref={(el) => {
                if (el) inputs.current.set(t.id, el);
                else inputs.current.delete(t.id);
              }}
              value={t.text}
              size={1}
              onChange={(e) => update(t.id, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!t.text.trim()) return e.currentTarget.blur();
                  const next = newTask();
                  const list = [...latest.current];
                  list.splice(i + 1, 0, next);
                  onChange(list);
                  setFocusId(next.id);
                } else if (e.key === "Backspace" && !t.text) {
                  e.preventDefault();
                  onChange(latest.current.filter((x) => x.id !== t.id));
                  if (i > 0) setFocusId(latest.current[i - 1].id);
                } else if (e.key === "ArrowUp" && i > 0) {
                  e.preventDefault();
                  setFocusId(latest.current[i - 1].id);
                } else if (e.key === "ArrowDown" && i < latest.current.length - 1) {
                  e.preventDefault();
                  setFocusId(latest.current[i + 1].id);
                }
              }}
              // An empty line left behind is removed.
              onBlur={() => {
                if (!t.text.trim()) onChange(latest.current.filter((x) => x.id !== t.id));
              }}
              className={`col-start-1 row-start-1 w-full min-w-4 bg-transparent text-sm outline-none ${t.done ? "text-stone-400 line-through" : ""}`}
            />
          </span>
          {extra && t.text.trim() && <span className="inline-flex shrink-0">{extra(t)}</span>}
          {arrow && t.text.trim() && (
            <span className="hidden shrink-0 group-focus-within:inline-flex group-hover:inline-flex">{arrow(t)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
