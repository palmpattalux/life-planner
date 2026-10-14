"use client";

import { useEffect, useMemo, useState } from "react";
import { PriorityPicker } from "@/components/board/PriorityPicker";
import { TrashIcon } from "@/components/board/icons";
import { removeLinkedBoardTexts, setLinkDone, type Task } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { Checklist } from "./Checklist";
import { Popover } from "./Popover";

const box = "rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]";

// Priority tasks: a list like Today's to-do, with a clock after each task.
// Pressing the clock shows the task's deadline (Edit picks a new one); the time left shows on the
// right of Home (see Deadlines). Tasks made with a board timeline's
// "Priority task" show up here with their deadline. Hovering a task shows a
// trash icon that deletes it for good (and a priority task's board text),
// after asking right beside the task.
export function PriorityBox({ tasks, onChange }: { tasks: Task[] | null; onChange: (tasks: Task[]) => void }) {
  const supabase = useMemo(createClient, []);
  const [focus, setFocus] = useState(0);
  // The task whose deadline (or delete question) is showing, and what it
  // shows beside.
  const [asking, setAsking] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; el: HTMLElement } | null>(null);
  const askingTask = asking && tasks?.find((t) => t.id === asking.id);
  const deletingTask = deleting && tasks?.find((t) => t.id === deleting.id);

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
                setDeleting({ id: t.id, el: e.currentTarget.closest<HTMLElement>("[data-task]")! });
              }}
              className="animate-pop rounded-full p-0.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
            >
              <TrashIcon />
            </button>
          )}
          extra={(t) => (
            <button
              type="button"
              data-deadline-clock
              aria-label={t.deadline ? `Deadline ${new Date(t.deadline).toLocaleDateString()}` : "Set a deadline"}
              onClick={(e) => setAsking(asking?.id === t.id ? null : { id: t.id, el: e.currentTarget })}
              className={`rounded-full p-0.5 hover:bg-stone-100 ${t.deadline ? "text-stone-800" : "text-stone-400 hover:text-stone-800"}`}
            >
              <ClockIcon />
            </button>
          )}
        />
      )}
      {tasks && askingTask && (
        <DeadlineMenu
          key={askingTask.id}
          anchor={asking.el}
          value={askingTask.deadline}
          onClose={(deadline) => {
            setAsking(null);
            if (deadline !== undefined)
              onChange(tasks.map((x) => (x.id === askingTask.id ? { ...x, deadline: deadline ?? undefined } : x)));
          }}
        />
      )}
      {/* Deleting for good asks first, right by the task. */}
      {tasks && deletingTask && (
        <Popover data-delete-confirm anchor={deleting.el} onClose={() => setDeleting(null)} className="w-60">
          <p className="text-sm text-stone-800">Delete &ldquo;{deletingTask.text}&rdquo; for good?</p>
          {deletingTask.link && <p className="mt-0.5 text-xs text-stone-500">It&apos;s removed from its board too.</p>}
          <div className="mt-2 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="rounded px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="button"
              data-confirm-delete
              onClick={() => {
                setDeleting(null);
                onChange(tasks.filter((x) => x.id !== deletingTask.id));
                if (deletingTask.link) void removeLinkedBoardTexts(supabase, deletingTask.link).catch(() => {});
              }}
              className="rounded bg-red-600 px-2 py-1 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </Popover>
      )}
    </section>
  );
}

// A task's deadline: its date, with Edit to pick a new one a step at a time
// (year, month, day) as on a board, and Remove. Clicking anywhere else
// leaves it as it was. onClose gets the new deadline, null to remove it, or
// undefined for no change.
function DeadlineMenu({
  anchor,
  value,
  onClose,
}: {
  anchor: HTMLElement;
  value?: string;
  onClose: (deadline: string | null | undefined) => void;
}) {
  const [editing, setEditing] = useState(!value);
  const now = new Date().getFullYear();
  return (
    <Popover data-deadline-menu anchor={anchor} onClose={() => onClose(undefined)} className={editing ? "p-1" : ""}>
      {editing ? (
        <PriorityPicker
          dateOnly
          years={Array.from({ length: 12 }, (_, i) => now + i)}
          error={null}
          onBack={() => (value ? setEditing(false) : onClose(undefined))}
          onDone={(d) => onClose(d.toISOString())}
        />
      ) : (
        <div className="flex items-center gap-3">
          <span data-deadline-date className="text-sm text-stone-800">
            {new Date(value!).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              data-deadline-edit
              onClick={() => setEditing(true)}
              className="rounded border border-stone-300 px-2 py-0.5 text-xs text-stone-700 hover:bg-stone-100"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onClose(null)}
              className="rounded px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-100"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </Popover>
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

// The time left until each priority task's deadline (not ticked ones), down
// the right of Home, soonest first: the time left above the task. They lift
// a little and glow (with a soft tap) when hovered. Kept up to the
// minute.
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
    <div data-deadlines className="flex flex-col items-start gap-2 p-1">
      {due.map((t) => {
        const ms = new Date(t.deadline!).getTime() - now;
        // Past the deadline, or less than a day to go: a warmer colour.
        const tone = ms <= 0 ? "text-red-500" : ms < 86_400_000 ? "text-amber-600" : "text-stone-500";
        return (
          <div
            key={t.id}
            data-deadline-countdown
            data-pop
            className="w-full rounded-xl px-3 py-2 text-left transition duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_0_18px_4px_rgba(251,191,36,0.35)]"
          >
            <p className={`text-[11px] font-medium ${tone}`}>{timeLeft(ms)}</p>
            <p className="truncate text-sm text-stone-800">{t.text}</p>
          </div>
        );
      })}
    </div>
  );
}

// "3 days left", "5 hours left", "12 minutes left", or "Past deadline".
function timeLeft(ms: number) {
  if (ms <= 0) return "Past deadline";
  const minutes = Math.ceil(ms / 60_000);
  const n = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"} left`;
  if (minutes < 60) return n(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return n(hours, "hour");
  return n(Math.floor(hours / 24), "day");
}
