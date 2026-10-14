"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckMark } from "@/components/board/icons";
import { INK } from "@/components/board/constants";
import {
  keepsForever,
  loadDay,
  loadPastDays,
  loadToday,
  parseDate,
  saveDay,
  setLinkDone,
  today,
  tomorrow,
  type Day,
} from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { Checklist } from "./Checklist";
import { useSaved } from "./useSaved";

const box = "rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]";

// Today's to-do list. A new, empty list starts every day; each day's list is
// kept with its date (see Past to-dos) for 30 days. The Tomorrow switch shows
// tomorrow's list instead, to write ahead (the box glows like sunlight); at
// midnight it becomes today's.
export function TodayBox({ email }: { email?: string }) {
  const supabase = useMemo(createClient, []);
  const { value, change, failed, refresh } = useSaved<Day>(
    "today",
    async () => ({ day: today(), items: await loadToday(supabase) }),
    (d) => saveDay(supabase, d.day, d.items),
  );
  const next = useSaved<Day>(
    "tomorrow",
    async () => ({ day: tomorrow(), items: await loadDay(supabase, tomorrow()) }),
    (d) => saveDay(supabase, d.day, d.items),
  );
  const [ahead, setAhead] = useState(false);
  const shown = ahead ? next : { value, change, failed };
  const [focus, setFocus] = useState(0);
  // At midnight (this device's time zone) today's list is saved under its
  // date, so it's in Past to-dos, and a new empty list starts.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(async () => {
        await refresh();
        await next.refresh();
        if (showPastRef.current) void loadPastDays(supabase).then(setPast, () => {});
        schedule();
      }, midnight.getTime() - now.getTime());
    };
    schedule();
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [past, setPast] = useState<Day[] | null>(null);
  const [showPast, setShowPast] = useState(false);
  // Past days opened to show their lists, and whether only undone tasks show.
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [undone, setUndone] = useState(false);
  const showPastRef = useRef(showPast);
  showPastRef.current = showPast;

  function togglePast() {
    setShowPast((s) => !s);
    if (!showPast)
      void loadPastDays(supabase)
        .then(setPast)
        .catch(() => setPast([]));
  }

  return (
    <section
      data-today
      data-tomorrow-on={ahead || undefined}
      className={`${box} group cursor-text transition-shadow duration-500 ${ahead ? "bg-gradient-to-br from-amber-50 to-orange-50" : ""}`}
      // Tomorrow: a warm glow, like sunlight.
      style={ahead ? { boxShadow: "0 0 0 1.5px rgba(251,191,36,0.6), 0 0 30px 8px rgba(251,146,60,0.4)" } : undefined}
      // Clicking anywhere in the box starts typing.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button, input")) setFocus((n) => n + 1);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="whitespace-nowrap font-semibold">{ahead ? "Tomorrow's to-do" : "Today's to-do"}</h2>
        <div className="flex items-center gap-1.5">
          {/* Switch to tomorrow's list and back. */}
          <button
            type="button"
            role="switch"
            data-tomorrow
            aria-checked={ahead}
            onClick={() => setAhead((a) => !a)}
            className={`flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-0.5 text-[11px] transition ${ahead ? "text-orange-700" : "text-stone-500 hover:text-stone-800"}`}
          >
            Tomorrow
            <span
              className={`relative h-4 w-7 rounded-full transition-colors ${ahead ? "bg-orange-400" : "bg-stone-300"}`}
            >
              <span
                className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-all ${ahead ? "left-3.5" : "left-0.5"}`}
              />
            </span>
          </button>
          {/* Past to-dos (each day's list, kept 30 days, or forever for some accounts). */}
          <button
            type="button"
            data-view-past
            aria-label="Past to-dos"
            title="Past to-dos"
            aria-pressed={showPast}
            onClick={togglePast}
            className={`rounded-md p-1 transition ${showPast ? "bg-stone-900 text-white" : "text-stone-400 hover:bg-stone-100 hover:text-stone-800"}`}
          >
            <ArchiveIcon />
          </button>
        </div>
      </div>
      {/* Only while the pointer is over the box (or typing in it, on a phone). */}
      <p className="h-0 overflow-hidden text-xs text-stone-400 opacity-0 transition-all group-focus-within:h-4 group-focus-within:opacity-100 group-hover:h-4 group-hover:opacity-100">
        {ahead ? "This becomes today's to-do at midnight" : "This automatically resets every day"}
      </p>
      <div className="mb-2" />
      {shown.value === null ? (
        <p className="py-1 text-sm text-stone-400">{shown.failed ? "Couldn't load your list." : "Loading…"}</p>
      ) : (
        <Checklist
          key={ahead ? "tomorrow" : "today"}
          tasks={shown.value.items}
          onChange={(items) => shown.change({ ...shown.value!, items })}
          onCheck={(t, done) => t.link && void setLinkDone(supabase, t.link, done).catch(() => {})}
          focusRequest={focus}
        />
      )}
      {shown.failed && shown.value !== null && (
        <p className="mt-1 text-xs text-red-600">Couldn&apos;t save. Check your connection.</p>
      )}
      {showPast && (
        <div data-past-days className="mt-2 max-h-64 space-y-1 overflow-y-auto border-t border-stone-100 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Past to-dos</div>
            {/* Every task left unticked, with its day. */}
            <button
              type="button"
              data-show-undone
              aria-pressed={undone}
              onClick={() => setUndone((u) => !u)}
              className={`rounded-md px-2 py-0.5 text-xs transition ${undone ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"}`}
            >
              Undone
            </button>
          </div>
          {past === null && <p className="text-sm text-stone-400">Loading…</p>}
          {past?.length === 0 && (
            <p className="text-sm text-stone-400">
              No past days yet{keepsForever(email) ? "." : " (they're kept 30 days)."}
            </p>
          )}
          {past && undone && (
            <div data-undone-list>
              {past.flatMap((d) =>
                d.items
                  .filter((t) => t.text.trim() && !t.done)
                  .map((t) => (
                    <div key={`${d.day}-${t.id}`} className="flex items-center gap-2 py-0.5 text-sm">
                      <span className="size-3.5 shrink-0 rounded-[3px] border-[1.5px] border-stone-400" />
                      <span className="min-w-0 flex-1 truncate text-stone-600">{t.text}</span>
                      <span className="shrink-0 text-xs text-stone-400">{dayLabel(d.day)}</span>
                    </div>
                  )),
              )}
              {past.every((d) => d.items.every((t) => t.done || !t.text.trim())) && (
                <p className="text-sm text-stone-400">Nothing left undone.</p>
              )}
            </div>
          )}
          {/* Each day; tap one to see its list. */}
          {!undone &&
            past?.map((d) => {
              const open = openDays.has(d.day);
              return (
                <div key={d.day}>
                  <button
                    type="button"
                    data-past-day={d.day}
                    aria-expanded={open}
                    onClick={() =>
                      setOpenDays((s) => {
                        const next = new Set(s);
                        if (open) next.delete(d.day);
                        else next.add(d.day);
                        return next;
                      })
                    }
                    className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                  >
                    {dayLabel(d.day)}
                    <span className="text-stone-400">{open ? "▾" : "▸"}</span>
                  </button>
                  {open &&
                    d.items
                      .filter((t) => t.text.trim())
                      .map((t) => (
                        <div key={t.id} className="flex items-center gap-2 py-0.5 pl-1 text-sm">
                          <span className="relative size-3.5 shrink-0 rounded-[3px] border-[1.5px] border-stone-400">
                            {t.done && <CheckMark color={INK} />}
                          </span>
                          <span className={t.done ? "text-stone-400 line-through" : "text-stone-600"}>{t.text}</span>
                        </div>
                      ))}
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}

// "Mon, Oct 12".
const dayLabel = (day: string) =>
  parseDate(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

function ArchiveIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <rect x="1.5" y="2.5" width="13" height="3.5" rx="0.8" />
      <path d="M2.8 6 V12.7 a0.8 0.8 0 0 0 0.8 0.8 H12.4 a0.8 0.8 0 0 0 0.8 -0.8 V6" />
      <path d="M6.3 8.7 H9.7" />
    </svg>
  );
}
