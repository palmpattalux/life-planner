"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TrashIcon } from "@/components/board/icons";
import { localDate, removeLinkedBoardTexts, setLinkDone, type Task } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { Checklist } from "./Checklist";

const box = "rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]";

// Priority tasks: a list like Today's to-do, with a clock after each task.
// Pressing the clock asks for the task's deadline; the time left shows on the
// right of Home (see Deadlines). Tasks made with a board timeline's
// "Priority task" show up here with their deadline. Hovering a task shows a
// trash icon that deletes it for good (and a priority task's board text).
export function PriorityBox({ tasks, onChange }: { tasks: Task[] | null; onChange: (tasks: Task[]) => void }) {
  const supabase = useMemo(createClient, []);
  const [focus, setFocus] = useState(0);
  const [asking, setAsking] = useState<string | null>(null);

  return (
    <section
      data-priority
      className={`${box} cursor-text`}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button, input, form")) setFocus((n) => n + 1);
      }}
    >
      <h2 className="mb-2 font-semibold">Priority tasks</h2>
      {tasks === null ? (
        <p className="py-1 text-sm text-stone-400">Loading…</p>
      ) : (
        <Checklist
          tasks={tasks}
          onChange={onChange}
          onCheck={(t, done) => t.link && void setLinkDone(supabase, t.link, done).catch(() => {})}
          focusRequest={focus}
          arrow={(t) => (
            <button
              type="button"
              data-delete-priority
              aria-label={`Delete "${t.text}"`}
              // On press, before the line loses focus (which hides it on a phone).
              onPointerDown={(e) => {
                e.preventDefault();
                const where = t.link ? " It's removed from its board too." : "";
                if (!window.confirm(`Delete "${t.text}" for good?${where}`)) return;
                onChange(tasks.filter((x) => x.id !== t.id));
                if (t.link) void removeLinkedBoardTexts(supabase, t.link).catch(() => {});
              }}
              className="animate-pop rounded-full p-0.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
            >
              <TrashIcon />
            </button>
          )}
          extra={(t) => (
            <span className="relative">
              <button
                type="button"
                data-deadline-clock
                aria-label={t.deadline ? `Deadline ${new Date(t.deadline).toLocaleString()}` : "Set a deadline"}
                title={t.deadline ? new Date(t.deadline).toLocaleString() : "Set a deadline"}
                onClick={() => setAsking(asking === t.id ? null : t.id)}
                className={`rounded-full p-0.5 hover:bg-stone-100 ${t.deadline ? "text-stone-800" : "text-stone-400 hover:text-stone-800"}`}
              >
                <ClockIcon />
              </button>
              {asking === t.id && (
                <DeadlineMenu
                  value={t.deadline}
                  onClose={(deadline) => {
                    setAsking(null);
                    if (deadline !== undefined)
                      onChange(tasks.map((x) => (x.id === t.id ? { ...x, deadline: deadline ?? undefined } : x)));
                  }}
                />
              )}
            </span>
          )}
        />
      )}
    </section>
  );
}

// "2026-10-20T17:00" for a datetime-local box, in this device's time zone.
function forInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${localDate(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Asking for a deadline. Set (or Enter) keeps it, Remove takes it off;
// clicking anywhere else leaves it as it was. onClose gets the new deadline,
// null to remove it, or undefined for no change.
function DeadlineMenu({ value, onClose }: { value?: string; onClose: (deadline: string | null | undefined) => void }) {
  const ref = useRef<HTMLFormElement>(null);
  const [input, setInput] = useState(forInput(value));
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose(undefined);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const at = new Date(input);
  return (
    <form
      ref={ref}
      data-deadline-menu
      onSubmit={(e) => {
        e.preventDefault();
        if (input && !isNaN(at.getTime())) onClose(at.toISOString());
      }}
      onKeyDown={(e) => e.key === "Escape" && onClose(undefined)}
      className="absolute left-0 top-full z-20 mt-1 w-56 space-y-2 rounded-lg border border-stone-200 bg-white p-2 shadow-lg"
    >
      <label className="block text-xs text-stone-500">
        Deadline
        <input
          type="datetime-local"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
        />
      </label>
      <div className="flex gap-1">
        <button
          disabled={!input || isNaN(at.getTime())}
          className="flex-1 rounded bg-stone-900 px-2 py-1 text-sm font-medium text-white disabled:opacity-30"
        >
          Set
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onClose(null)}
            className="rounded px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.5 V8 L10.5 9.5" />
    </svg>
  );
}

// The time left until each priority task's deadline (not ticked ones), faint
// like the milestone's countdown but smaller. Kept up to the minute.
export function Deadlines({ tasks }: { tasks: Task[] | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const due = (tasks ?? [])
    .filter((t) => t.deadline && !t.done && t.text.trim())
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
  if (due.length === 0) return null;
  return (
    <div data-deadlines className="flex flex-col gap-1 text-center">
      {due.map((t) => (
        <p key={t.id} data-deadline-countdown className="text-[10px] font-medium text-stone-900/25">
          {timeLeft(new Date(t.deadline!).getTime() - now)} {t.text}
        </p>
      ))}
    </div>
  );
}

// "3 days until", "5 hours until", "12 minutes until", or "Past deadline:".
function timeLeft(ms: number) {
  if (ms <= 0) return "Past deadline:";
  const minutes = Math.ceil(ms / 60_000);
  const n = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"} until`;
  if (minutes < 60) return n(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return n(hours, "hour");
  return n(Math.floor(hours / 24), "day");
}
