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
// words.
export function Checklist({
  tasks,
  onChange,
  onCheck,
  arrow,
  extra,
  placeholder = "Add a task",
  focusRequest = 0,
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

  const update = (id: string, patch: Partial<Task>) =>
    onChange(latest.current.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  return (
    <div
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
        <div key={t.id} data-task={t.id} className="group flex items-center gap-2 py-0.5">
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
