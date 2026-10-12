"use client";

import { useMemo, useState } from "react";
import { CheckMark } from "@/components/board/icons";
import { INK } from "@/components/board/constants";
import { loadPastDays, loadToday, parseDate, saveDay, setLinkDone, today, type Day } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { Checklist } from "./Checklist";
import { useSaved } from "./useSaved";

const box = "rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]";

// Today's to-do list. A new, empty list starts every day; each day's list is
// kept with its date (see "View past to-do days") for 30 days.
export function TodayBox() {
  const supabase = useMemo(createClient, []);
  const { value, change, failed } = useSaved<Day>(
    async () => ({ day: today(), items: await loadToday(supabase) }),
    (d) => saveDay(supabase, d.day, d.items),
  );
  const [focus, setFocus] = useState(0);
  const [past, setPast] = useState<Day[] | null>(null);
  const [showPast, setShowPast] = useState(false);

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
      className={`${box} cursor-text`}
      // Clicking anywhere in the box starts typing.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button, input")) setFocus((n) => n + 1);
      }}
    >
      <h2 className="font-semibold">Today&apos;s to-do list</h2>
      <p className="mb-2 text-xs text-stone-400">This automatically resets every day</p>
      {value === null ? (
        <p className="py-1 text-sm text-stone-400">{failed ? "Couldn't load your list." : "Loading…"}</p>
      ) : (
        <Checklist
          tasks={value.items}
          onChange={(items) => change({ ...value, items })}
          onCheck={(t, done) => t.link && void setLinkDone(supabase, t.link, done).catch(() => {})}
          focusRequest={focus}
        />
      )}
      {failed && value !== null && (
        <p className="mt-1 text-xs text-red-600">Couldn&apos;t save. Check your connection.</p>
      )}
      <button
        type="button"
        data-view-past
        onClick={togglePast}
        className="mt-2 text-xs text-stone-400 underline-offset-2 hover:text-stone-700 hover:underline"
      >
        {showPast ? "Hide past to-do days" : "View past to-do days"}
      </button>
      {showPast && (
        <div data-past-days className="mt-2 max-h-64 space-y-3 overflow-y-auto border-t border-stone-100 pt-2">
          {past === null && <p className="text-sm text-stone-400">Loading…</p>}
          {past?.length === 0 && (
            <p className="text-sm text-stone-400">No past days yet (they&apos;re kept 30 days).</p>
          )}
          {past?.map((d) => (
            <div key={d.day}>
              <div className="text-xs font-medium text-stone-500">
                {parseDate(d.day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </div>
              {d.items
                .filter((t) => t.text.trim())
                .map((t) => (
                  <div key={t.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <span className="relative size-3.5 shrink-0 rounded-[3px] border-[1.5px] border-stone-400">
                      {t.done && <CheckMark color={INK} />}
                    </span>
                    <span className={t.done ? "text-stone-400 line-through" : "text-stone-600"}>{t.text}</span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
