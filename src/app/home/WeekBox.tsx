"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TrashIcon } from "@/components/board/icons";
import { createTaskPage, loadEvents, saveEvents, type HomeEvent } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { NoteButton } from "./NoteButton";
import { Popover } from "./Popover";
import { useSaved } from "./useSaved";

const box = "rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// How tall each day is on the timeline, and where the line runs (from the left).
const DAY_H = 52;
const LINE_X = 64;
const DAY_MS = 24 * 60 * 60 * 1000;

// Midnight at the start of this week's Monday (or next week's).
function weekStart(weeksAhead: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weeksAhead * 7);
  return d;
}

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Home's week: Monday to Sunday down a line, with a red dot at the time right
// now. Clicking anywhere on it adds a little event there (a bill, an email to
// check), ready to type; the timeline shows just its words. Hovering one shows
// the arrow to its own page (a note) and the bin to remove it. "Next week"
// switches to the week after.
export function WeekBox() {
  const supabase = useMemo(createClient, []);
  const router = useRouter();
  const events = useSaved<HomeEvent[]>(
    "week-events",
    () => loadEvents(supabase),
    (e) => saveEvents(supabase, e),
  );
  const [ahead, setAhead] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const start = weekStart(ahead ? 1 : 0);
  const list = events.value ?? [];
  // Where a moment sits down the line (days are counted by the calendar, so a
  // clock change doesn't shift them).
  const yOf = (d: Date) => {
    const day = Math.round((midnight(d).getTime() - start.getTime()) / DAY_MS);
    return (day + (d.getTime() - midnight(d).getTime()) / DAY_MS) * DAY_H;
  };
  const shown = list.filter((e) => {
    const y = yOf(new Date(e.at));
    return y >= 0 && y < 7 * DAY_H;
  });

  const set = (next: HomeEvent[]) => events.change(next);

  // A new event at this height on the line, to the nearest half hour.
  function add(y: number) {
    const day = Math.min(6, Math.max(0, Math.floor(y / DAY_H)));
    const minutes = Math.round((((y - day * DAY_H) / DAY_H) * 24 * 60) / 30) * 30;
    const at = new Date(start);
    at.setDate(at.getDate() + day);
    at.setMinutes(Math.min(minutes, 24 * 60 - 30));
    const e: HomeEvent = { id: crypto.randomUUID(), text: "", at: at.toISOString() };
    set([...list, e]);
    setEditing(e.id);
  }

  function finish(id: string, text: string) {
    setEditing(null);
    const words = text.trim();
    set(words ? list.map((e) => (e.id === id ? { ...e, text: words } : e)) : list.filter((e) => e.id !== id));
  }

  async function openPage(e: HomeEvent) {
    if (e.page) return router.push(`/task/${e.page}`);
    setOpening(e.id);
    try {
      const page = await createTaskPage(supabase, e.text);
      set(list.map((x) => (x.id === e.id ? { ...x, page } : x)));
      router.push(`/task/${page}`);
    } catch {
      setOpening(null);
    }
  }

  const time = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const removing = deleting && list.find((e) => e.id === deleting.id);
  const todayY = !ahead ? yOf(now) : null;

  return (
    <section data-week className={box}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{ahead ? "Next week" : "This week"}</h2>
        <button
          type="button"
          data-week-switch
          onClick={() => {
            setEditing(null);
            setAhead((a) => !a);
          }}
          className="rounded-full px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-900"
        >
          {ahead ? "← This week" : "Next week →"}
        </button>
      </div>
      {events.value === null ? (
        <p className="py-1 text-sm text-stone-400">{events.failed ? "Couldn't load your week." : "Loading…"}</p>
      ) : (
        <div className="relative select-none" style={{ height: 7 * DAY_H }}>
          {/* Clicking the line (anywhere but an event) adds an event there. */}
          <div
            data-week-line
            title="Click to add"
            className="absolute inset-0 cursor-copy"
            onClick={(e) => add(e.clientY - e.currentTarget.getBoundingClientRect().top)}
          />
          <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-stone-300" style={{ left: LINE_X }} />
          {DAYS.map((name, i) => {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            const isToday = !ahead && midnight(now).getTime() === d.getTime();
            return (
              <div key={name} className="pointer-events-none absolute left-0" style={{ top: i * DAY_H }}>
                <div className="absolute h-px w-2 bg-stone-300" style={{ left: LINE_X - 4 }} />
                <span
                  className={`absolute -top-1.5 whitespace-nowrap text-xs ${isToday ? "font-semibold text-stone-900" : "text-stone-400"}`}
                >
                  {name} {d.getDate()}
                </span>
              </div>
            );
          })}
          {/* Right now. */}
          {todayY !== null && todayY >= 0 && todayY < 7 * DAY_H && (
            <div
              data-week-now
              title={`Now, ${time(now)}`}
              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500"
              style={{ left: LINE_X + 0.5, top: todayY }}
            />
          )}
          {shown.map((e) => {
            const at = new Date(e.at);
            const y = yOf(at);
            return (
              <div
                key={e.id}
                data-event={e.id}
                className="group pointer-events-none absolute flex items-center gap-1 [&>*]:pointer-events-auto"
                style={{ left: LINE_X - 3.5, top: y, right: 0, transform: "translateY(-50%)" }}
              >
                <span className="size-[7px] shrink-0 rounded-full bg-stone-800" title={time(at)} />
                {editing === e.id ? (
                  <input
                    autoFocus
                    data-event-input
                    defaultValue={e.text}
                    placeholder="Text"
                    onKeyDown={(k) => {
                      if (k.key === "Enter") k.currentTarget.blur();
                      if (k.key === "Escape") {
                        k.currentTarget.value = e.text;
                        k.currentTarget.blur();
                      }
                    }}
                    onBlur={(b) => finish(e.id, b.currentTarget.value)}
                    className="ml-1 min-w-0 flex-1 rounded bg-stone-100 px-1 text-sm outline-none"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditing(e.id)}
                      title={`${time(at)} · click to edit`}
                      className="ml-1 min-w-0 truncate text-left text-sm"
                    >
                      {e.text}
                    </button>
                    <span className="hidden shrink-0 items-center group-focus-within:flex group-hover:flex">
                      <NoteButton
                        task={{ id: e.id, text: e.text, done: false }}
                        opening={opening === e.id}
                        onOpen={() => void openPage(e)}
                      />
                      <button
                        type="button"
                        data-delete-event
                        aria-label={`Remove "${e.text}"`}
                        onPointerDown={(p) => {
                          p.preventDefault();
                          setDeleting({ id: e.id, el: p.currentTarget.closest<HTMLElement>("[data-event]")! });
                        }}
                        className="animate-pop rounded-full p-0.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {events.failed && events.value !== null && (
        <p className="mt-1 text-xs text-red-600">
          Couldn&apos;t save your week. If this keeps happening, the database may need its latest setup
          (supabase/schema.sql).
        </p>
      )}
      {/* Removing an event asks first, right by it. */}
      {deleting && removing && (
        <Popover data-delete-confirm anchor={deleting.el} onClose={() => setDeleting(null)} className="w-60">
          <p className="text-sm text-stone-800">Remove &ldquo;{removing.text}&rdquo;?</p>
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
                set(list.filter((x) => x.id !== removing.id));
              }}
              className="rounded bg-red-600 px-2 py-1 text-sm font-medium text-white hover:bg-red-700"
            >
              Remove
            </button>
          </div>
        </Popover>
      )}
    </section>
  );
}
