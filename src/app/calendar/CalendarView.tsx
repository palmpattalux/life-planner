"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TrashIcon } from "@/components/board/icons";
import { loadEvents, saveEvents, type HomeEvent } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { Popover } from "../home/Popover";
import { useSaved } from "../home/useSaved";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHOW_TEXT_KEY = "calendar-show-text";

// The icons a date's little event can have.
const ICONS: { id: string; label: string; draw: ReactNode }[] = [
  {
    id: "bell",
    label: "Bell",
    draw: <path d="M4 11.5 V7.5 a4 4 0 0 1 8 0 V11.5 L13 12.5 H3 Z M6.5 14 a1.5 1.5 0 0 0 3 0" />,
  },
  {
    id: "star",
    label: "Star",
    draw: <path d="M8 1.8 L9.9 5.8 L14.2 6.3 L11 9.2 L11.9 13.5 L8 11.3 L4.1 13.5 L5 9.2 L1.8 6.3 L6.1 5.8 Z" />,
  },
  {
    id: "heart",
    label: "Heart",
    draw: (
      <path d="M8 13.5 C3 10 1.5 7.5 2.5 5 C3.5 2.8 6.5 2.6 8 4.8 C9.5 2.6 12.5 2.8 13.5 5 C14.5 7.5 13 10 8 13.5 Z" />
    ),
  },
];

function Icon({ id, size = 14, className = "" }: { id?: string; size?: number; className?: string }) {
  const icon = ICONS.find((i) => i.id === id) ?? ICONS[0];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-label={icon.label}
    >
      {icon.draw}
    </svg>
  );
}

// "YYYY-MM-DD" for a date, in local time.
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// A month of dates, Monday to Sunday. Tapping a date lets you put a few words
// on it (a bill, a birthday) with an icon. "Show text" on: each date shows its
// words; off: just the icons, so you can see something's coming up.
export function CalendarView() {
  const supabase = useMemo(createClient, []);
  const events = useSaved<HomeEvent[]>(
    "week-events",
    () => loadEvents(supabase),
    (e) => saveEvents(supabase, e),
  );
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [showText, setShowText] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(SHOW_TEXT_KEY) === "off") setShowText(false);
    } catch {}
  }, []);
  function toggleText() {
    setShowText((on) => {
      try {
        localStorage.setItem(SHOW_TEXT_KEY, on ? "off" : "on");
      } catch {}
      return !on;
    });
  }
  const [open, setOpen] = useState<{ day: string; el: HTMLElement } | null>(null);

  const list = events.value ?? [];
  const set = (next: HomeEvent[]) => events.change(next);
  const today = dayKey(new Date());

  // From the Monday on or before the 1st to the Sunday on or after the last day.
  const first = new Date(month);
  first.setDate(1 - ((month.getDay() + 6) % 7));
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells: Date[] = [];
  for (let d = new Date(first); d <= last || cells.length % 7; d.setDate(d.getDate() + 1)) cells.push(new Date(d));

  const onDay = (day: string) => list.filter((e) => e.day === day);
  const step = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-5 pb-16 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/home" className="rounded px-1.5 py-0.5 text-sm font-medium hover:bg-stone-200/60">
          Home
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Last month"
            onClick={() => step(-1)}
            className="rounded px-2 py-0.5 text-stone-500 hover:bg-stone-200/60"
          >
            ‹
          </button>
          <h1 data-calendar-month className="w-40 text-center text-lg font-semibold">
            {month.toLocaleDateString([], { month: "long", year: "numeric" })}
          </h1>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => step(1)}
            className="rounded px-2 py-0.5 text-stone-500 hover:bg-stone-200/60"
          >
            ›
          </button>
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-stone-600">
          Show text
          <button
            type="button"
            role="switch"
            aria-checked={showText}
            data-show-text
            onClick={toggleText}
            className={`relative h-5 w-9 rounded-full transition-colors ${showText ? "bg-stone-800" : "bg-stone-300"}`}
          >
            <span
              className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${showText ? "left-[18px]" : "left-0.5"}`}
            />
          </button>
        </label>
      </div>

      {events.value === null ? (
        <p className="mt-6 text-sm text-stone-400">{events.failed ? "Couldn't load your calendar." : "Loading…"}</p>
      ) : (
        <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-2xl bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
          {DAYS.map((d) => (
            <div key={d} className="border-b border-stone-100 py-2 text-center text-xs font-medium text-stone-400">
              {d}
            </div>
          ))}
          {cells.map((d) => {
            const key = dayKey(d);
            const marks = onDay(key);
            const inMonth = d.getMonth() === month.getMonth();
            return (
              <button
                key={key}
                type="button"
                data-day={key}
                onClick={(e) => setOpen({ day: key, el: e.currentTarget })}
                className={`flex min-h-24 min-w-0 flex-col items-stretch gap-0.5 border-b border-r border-stone-100 p-1.5 text-left hover:bg-stone-50 ${inMonth ? "" : "text-stone-300"} ${open?.day === key ? "bg-stone-50" : ""}`}
              >
                <span
                  className={`self-start text-xs ${key === today ? "flex size-5 items-center justify-center rounded-full bg-red-500 font-semibold text-white" : ""}`}
                >
                  {d.getDate()}
                </span>
                {showText ? (
                  marks.map((m) => (
                    <span key={m.id} data-mark={m.id} className="flex min-w-0 items-center gap-1 text-xs">
                      <Icon id={m.icon} className="text-stone-500" />
                      <span className="truncate">{m.text}</span>
                    </span>
                  ))
                ) : (
                  <span className="flex flex-wrap gap-0.5">
                    {marks.map((m) => (
                      <span key={m.id} data-mark={m.id} title={m.text}>
                        <Icon id={m.icon} size={18} className="text-stone-700" />
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {events.failed && events.value !== null && (
        <p className="mt-2 text-xs text-red-600">
          Couldn&apos;t save your calendar. If this keeps happening, the database may need its latest setup
          (supabase/schema.sql).
        </p>
      )}

      {open && events.value !== null && (
        <Popover data-day-menu anchor={open.el} onClose={() => setOpen(null)} className="w-64">
          <DayMenu
            day={open.day}
            marks={onDay(open.day)}
            onAdd={(text, icon) => set([...list, { id: crypto.randomUUID(), text, day: open.day, icon }])}
            onRemove={(id) => set(list.filter((e) => e.id !== id))}
          />
        </Popover>
      )}
    </main>
  );
}

// A date's events (each with a bin to remove it) and a box to add one.
function DayMenu({
  day,
  marks,
  onAdd,
  onRemove,
}: {
  day: string;
  marks: HomeEvent[];
  onAdd: (text: string, icon: string) => void;
  onRemove: (id: string) => void;
}) {
  const [icon, setIcon] = useState(ICONS[0].id);
  const input = useRef<HTMLInputElement>(null);
  const [y, m, d] = day.split("-").map(Number);
  function add() {
    const text = input.current?.value.trim();
    if (!text) return;
    onAdd(text, icon);
    input.current!.value = "";
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-stone-500">
        {new Date(y, m - 1, d).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
      </p>
      {marks.map((e) => (
        <div key={e.id} className="flex items-center gap-1.5 text-sm">
          <Icon id={e.icon} className="text-stone-500" />
          <span className="min-w-0 flex-1 truncate">{e.text}</span>
          <button
            type="button"
            data-remove-mark
            aria-label={`Remove "${e.text}"`}
            onClick={() => onRemove(e.id)}
            className="rounded-full p-0.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        {ICONS.map((i) => (
          <button
            key={i.id}
            type="button"
            data-icon={i.id}
            aria-label={i.label}
            aria-pressed={icon === i.id}
            onClick={() => setIcon(i.id)}
            className={`rounded p-1 ${icon === i.id ? "bg-stone-200 text-stone-900" : "text-stone-500 hover:bg-stone-100"}`}
          >
            <Icon id={i.id} />
          </button>
        ))}
      </div>
      <input
        ref={input}
        autoFocus
        data-day-input
        placeholder="Text"
        onKeyDown={(k) => {
          if (k.key === "Enter") add();
        }}
        className="w-full rounded bg-stone-100 px-2 py-1 text-sm outline-none"
      />
    </div>
  );
}
