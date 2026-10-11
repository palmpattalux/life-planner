"use client";

import { useState } from "react";
import { LinkButton } from "./icons";
import { timelineTicks, todayValue, type Timeline, type TimeUnit } from "./timeline";

const UNITS: { unit: TimeUnit; label: string }[] = [
  { unit: "day", label: "Day" },
  { unit: "week", label: "Week" },
  { unit: "month", label: "Month" },
  { unit: "year", label: "Year" },
];

const INPUT_TYPE: Record<TimeUnit, string> = {
  day: "date",
  week: "week",
  month: "month",
  year: "number",
};

// Shown where a browser has no picker for that input type.
const PLACEHOLDER: Record<TimeUnit, string> = {
  day: "2026-10-10",
  week: "2026-W41",
  month: "2026-10",
  year: "2026",
};

// The box that pops up beside a clicked line.
// "Time" -> pick a unit -> enter beginning and end -> Done turns the line into
// a timeline. "Angle" adds a bend point to the line. The chain icon is for
// links later on.
export function LineMenu({
  time,
  onDone,
  onAngle,
}: {
  time?: Timeline;
  onDone: (time: Timeline) => void;
  onAngle: () => void;
}) {
  const [step, setStep] = useState<"menu" | "unit" | "range">("menu");
  const [unit, setUnit] = useState<TimeUnit>(time?.unit ?? "day");
  const [start, setStart] = useState(time?.start ?? "");
  const [end, setEnd] = useState(time?.end ?? "");
  const valid = timelineTicks({ unit, start, end }) !== null;

  function pickUnit(u: TimeUnit) {
    if (u !== unit || !start) {
      setStart(u === time?.unit ? time.start : todayValue(u));
      setEnd(u === time?.unit ? time.end : "");
    }
    setUnit(u);
    setStep("range");
  }

  const item = "w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100";

  return (
    <div
      data-menu="line"
      onPointerDown={(e) => e.stopPropagation()}
      className="w-52 rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
    >
      {step === "menu" && (
        <>
          <button className={item} onClick={() => setStep("unit")}>
            Time
          </button>
          <button className={`${item} flex items-center gap-2`} onClick={onAngle} aria-label="Angle">
            {/* Angle icon: two strokes meeting at a corner. */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 14 L8 3 L14 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Angle
          </button>
          <LinkButton />
        </>
      )}

      {step === "unit" &&
        UNITS.map(({ unit: u, label }) => (
          <button key={u} className={item} onClick={() => pickUnit(u)}>
            {label}
          </button>
        ))}

      {step === "range" && (
        <form
          className="space-y-2 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onDone({ unit, start, end });
          }}
        >
          <label className="block text-xs text-stone-500">
            Beginning
            <input
              name="start"
              type={INPUT_TYPE[unit]}
              placeholder={PLACEHOLDER[unit]}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
            />
          </label>
          <label className="block text-xs text-stone-500">
            End
            <input
              name="end"
              type={INPUT_TYPE[unit]}
              placeholder={PLACEHOLDER[unit]}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("unit")}
              className="rounded px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={!valid}
              className="flex-1 rounded bg-stone-900 px-2 py-1 text-sm font-medium text-white disabled:opacity-30"
            >
              Done
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
