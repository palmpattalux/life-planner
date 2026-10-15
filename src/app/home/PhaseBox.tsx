"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MONTHS } from "@/components/board/timeline";
import {
  createTaskPage,
  localDate,
  parseDate,
  setLinkDone,
  today,
  type Phase,
  type PhaseUnit,
  type Task,
} from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { TrashIcon } from "@/components/board/icons";
import { Checklist } from "./Checklist";
import { Popover } from "./Popover";

const UNITS: { unit: PhaseUnit; label: string }[] = [
  { unit: "day", label: "Day" },
  { unit: "week", label: "Week" },
  { unit: "month", label: "Month" },
  { unit: "year", label: "Year" },
];

// The ISO week number of a date (weeks start on Monday).
function weekNumber(d: Date) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(t.getFullYear(), 0, 4);
  return (
    1 +
    Math.round((t.getTime() - firstThursday.getTime()) / 86400000 / 7 - (((firstThursday.getDay() + 6) % 7) - 3) / 7)
  );
}

// "Oct 12 → Nov 30", "W42 → W48", "Oct → Mar 2027", "2026 → 2028".
export function phaseDates(p: Phase): [string, string] | null {
  if (!p.unit || !p.start || !p.end) return null;
  const a = parseDate(p.start);
  const b = parseDate(p.end);
  const thisYear = new Date().getFullYear();
  const sameYear = a.getFullYear() === b.getFullYear();
  switch (p.unit) {
    case "day": {
      const f = (d: Date) =>
        d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: d.getFullYear() === thisYear && sameYear ? undefined : "numeric",
        });
      return [f(a), f(b)];
    }
    case "week":
      return [`W${weekNumber(a)}`, `W${weekNumber(b)}`];
    case "month": {
      const y = (d: Date) => (sameYear && d.getFullYear() === thisYear ? "" : ` ${d.getFullYear()}`);
      return [`${MONTHS[a.getMonth()]}${y(a)}`, `${MONTHS[b.getMonth()]}${y(b)}`];
    }
    case "year":
      return [String(a.getFullYear()), String(b.getFullYear())];
  }
}

// The phase goal: its dates on top (click to pick them) and its tasks
// underneath. Hovering a task (or pressing it on a phone) shows an arrow
// after it that opens the task's own page (made the first time), and a trash
// icon that deletes the task (asking first).
export function PhaseBox({ phase, onChange }: { phase: Phase | null; onChange: (p: Phase) => void }) {
  const supabase = useMemo(createClient, []);
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [focus, setFocus] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  // The task whose delete question is showing, and its line.
  const [deleting, setDeleting] = useState<{ id: string; el: HTMLElement } | null>(null);
  const deletingTask = deleting && phase?.tasks.find((t) => t.id === deleting.id);
  // When the date menu last closed (pressing the dates closes it; that same
  // press shouldn't open it again).
  const closedAt = useRef(0);
  const dates = phase && phaseDates(phase);

  async function openPage(t: Task) {
    if (!phase) return;
    if (t.page) return router.push(`/task/${t.page}`);
    setOpening(t.id);
    try {
      const page = await createTaskPage(supabase, t.text);
      onChange({ ...phase, tasks: phase.tasks.map((x) => (x.id === t.id ? { ...x, page } : x)) });
      router.push(`/task/${page}`);
    } catch {
      setOpening(null);
    }
  }

  return (
    <section data-phase className="relative rounded-2xl bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      <button
        type="button"
        data-phase-dates
        disabled={!phase}
        onClick={() => Date.now() - closedAt.current > 300 && setPicking(true)}
        className="w-full rounded-t-2xl border-b border-stone-100 px-4 py-3 text-left transition hover:bg-stone-50"
      >
        <span className="font-semibold">Milestone</span>{" "}
        {dates ? (
          <span className="text-sm text-stone-600">
            {dates[0]} → {dates[1]}
          </span>
        ) : (
          <span className="text-sm text-stone-400">[begin date] → [end date]</span>
        )}
      </button>
      {picking && phase && (
        <DateMenu
          phase={phase}
          onClose={(range) => {
            setPicking(false);
            closedAt.current = Date.now();
            if (!range) return;
            onChange({ ...phase, ...range });
            // Dates set: on to writing the first task.
            setFocus((n) => n + 1);
          }}
        />
      )}
      <div
        className="cursor-text px-4 pb-4 pt-2"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("button, input")) setFocus((n) => n + 1);
        }}
      >
        {phase === null ? (
          <p className="py-1 text-sm text-stone-400">Loading…</p>
        ) : (
          <Checklist
            tasks={phase.tasks}
            onChange={(tasks) => onChange({ ...phase, tasks })}
            onCheck={(t, done) => t.link && void setLinkDone(supabase, t.link, done).catch(() => {})}
            focusRequest={focus}
            arrow={(t) => (
              <>
                <button
                  type="button"
                  data-task-arrow
                  aria-label={`Open "${t.text}"`}
                  // On press, before the line loses focus (which hides the arrow on a phone).
                  onPointerDown={(e) => {
                    e.preventDefault();
                    void openPage(t);
                  }}
                  data-pop
                  className="group/note relative animate-pop rounded-full px-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                >
                  {opening === t.id ? "…" : "→"}
                  {/* "Note" over the arrow while it's hovered. */}
                  <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-stone-900 px-1.5 py-0.5 text-[11px] text-white opacity-0 transition-opacity group-hover/note:opacity-100">
                    Note
                  </span>
                </button>
                <button
                  type="button"
                  data-delete-milestone
                  aria-label={`Delete "${t.text}"`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDeleting({ id: t.id, el: e.currentTarget.closest<HTMLElement>("[data-task]")! });
                  }}
                  className="animate-pop rounded-full p-0.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
                >
                  <TrashIcon />
                </button>
              </>
            )}
          />
        )}
      </div>
      {/* Deleting a task asks first, right by it. */}
      {phase && deletingTask && (
        <Popover data-delete-confirm anchor={deleting.el} onClose={() => setDeleting(null)} className="w-60">
          <p className="text-sm text-stone-800">Delete &ldquo;{deletingTask.text}&rdquo;?</p>
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
                onChange({ ...phase, tasks: phase.tasks.filter((x) => x.id !== deletingTask.id) });
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

type Range = { unit: PhaseUnit; start: string; end: string };

// Picking the phase's dates, like a line's timeline: Day, Week, Month or
// Year, then its beginning and end. Enter or clicking anywhere else sets
// them (if the end isn't before the beginning).
function DateMenu({ phase, onClose }: { phase: Phase; onClose: (range: Range | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [unit, setUnit] = useState<PhaseUnit | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // Month: which year the month boxes show, and whether picking the end.
  const [year, setYear] = useState(new Date().getFullYear());
  const [pickingEnd, setPickingEnd] = useState(false);

  function pickUnit(u: PhaseUnit) {
    const same = u === phase.unit && phase.start && phase.end;
    setUnit(u);
    setPickingEnd(false);
    if (u === "year") {
      setStart(same ? phase.start!.slice(0, 4) : String(new Date().getFullYear()));
      setEnd(same ? phase.end!.slice(0, 4) : "");
    } else if (u === "month") {
      setStart(same ? phase.start!.slice(0, 7) : "");
      setEnd(same ? phase.end!.slice(0, 7) : "");
    } else {
      setStart(same ? phase.start! : today());
      setEnd(same ? phase.end! : "");
    }
  }

  // The beginning and end as dates, or null if they don't make a phase yet.
  function range(s = start, e = end): Range | null {
    if (!unit || !s || !e) return null;
    let a: Date;
    let b: Date;
    if (unit === "year") {
      if (!/^\d{4}$/.test(s) || !/^\d{4}$/.test(e)) return null;
      a = new Date(Number(s), 0, 1);
      b = new Date(Number(e), 11, 31);
    } else if (unit === "month") {
      const [ys, ms] = s.split("-").map(Number);
      const [ye, me] = e.split("-").map(Number);
      a = new Date(ys, ms - 1, 1);
      b = new Date(ye, me, 0);
    } else {
      a = parseDate(s);
      b = parseDate(e);
      if (unit === "week") {
        // Whole weeks, Monday to Sunday.
        a.setDate(a.getDate() - ((a.getDay() + 6) % 7));
        b.setDate(b.getDate() + (6 - ((b.getDay() + 6) % 7)));
      }
    }
    if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return null;
    return { unit, start: localDate(a), end: localDate(b) };
  }
  const latest = useRef(range);
  latest.current = range;

  // Clicking anywhere else sets the dates.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose(latest.current());
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const item = "w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100";
  const field = "mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-900";
  const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
  return (
    <div
      ref={ref}
      data-phase-menu
      onKeyDown={(e) => {
        if (e.key === "Enter" && unit) {
          e.preventDefault();
          onClose(range());
        }
        if (e.key === "Escape") onClose(null);
      }}
      className="absolute left-4 top-full z-20 -mt-1 w-60 rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
    >
      {!unit &&
        UNITS.map(({ unit: u, label }) => (
          <button key={u} type="button" className={item} onClick={() => pickUnit(u)}>
            {label}
          </button>
        ))}
      {(unit === "day" || unit === "week") && (
        <div className="space-y-2 p-1">
          <div className="flex items-end gap-1.5">
            <label className="block flex-1 text-xs text-stone-500">
              {unit === "week" ? "Week of" : "Beginning"}
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} />
            </label>
            <span className="pb-1.5 text-stone-400">→</span>
            <label className="block flex-1 text-xs text-stone-500">
              {unit === "week" ? "Week of" : "End"}
              <input
                type="date"
                autoFocus
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
                className={field}
              />
            </label>
          </div>
        </div>
      )}
      {unit === "month" && (
        <div className="space-y-1.5 p-1">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>{pickingEnd ? "End" : "Beginning"}</span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous year"
                onClick={() => setYear((y) => y - 1)}
                className="rounded px-1.5 hover:bg-stone-100"
              >
                ‹
              </button>
              <span className="font-medium text-stone-700">{year}</span>
              <button
                type="button"
                aria-label="Next year"
                onClick={() => setYear((y) => y + 1)}
                className="rounded px-1.5 hover:bg-stone-100"
              >
                ›
              </button>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((m, i) => {
              const value = ym(year, i);
              const chosen = value === start || value === end;
              return (
                <button
                  key={m}
                  type="button"
                  data-month={m}
                  disabled={pickingEnd && value < start}
                  onClick={() => {
                    if (!pickingEnd) {
                      setStart(value);
                      setPickingEnd(true);
                    } else onClose(range(start, value));
                  }}
                  className={`rounded px-2 py-1 text-sm disabled:opacity-30 ${chosen ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {unit === "year" && (
        <div className="flex items-end gap-1.5 p-1">
          <label className="block flex-1 text-xs text-stone-500">
            Beginning
            <input
              inputMode="numeric"
              value={start}
              onChange={(e) => setStart(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className={field}
            />
          </label>
          <span className="pb-1.5 text-stone-400">→</span>
          <label className="block flex-1 text-xs text-stone-500">
            End
            <input
              inputMode="numeric"
              autoFocus
              placeholder={start}
              value={end}
              onChange={(e) => setEnd(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className={field}
            />
          </label>
        </div>
      )}
      {unit && (
        <div className="flex items-center justify-between px-1 pb-1">
          <button
            type="button"
            onClick={() => setUnit(null)}
            className="rounded px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
          >
            Back
          </button>
          <span className="text-xs text-stone-400">Enter or click away to set</span>
        </div>
      )}
    </div>
  );
}
