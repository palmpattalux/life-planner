"use client";

import { useEffect, useRef, useState } from "react";
import { INK, TEXT_COLORS } from "./constants";
import { LinkButton } from "./icons";
import { LIMITS, MONTHS, timelineTicks, type Timeline, type TimeUnit } from "./timeline";

const UNITS: { unit: TimeUnit; label: string }[] = [
  { unit: "day", label: "Day" },
  { unit: "week", label: "Week" },
  { unit: "month", label: "Month" },
  { unit: "year", label: "Year" },
];

// The box that pops up beside a clicked line.
// "Time" -> pick a unit -> pick a beginning and end -> the line becomes a
// timeline. Day (0-31), week (1-4) and year use two number slots: type a
// number or scroll over the slot; Enter moves on to the end slot, then
// finishes. Month shows the months to pick from, once for the beginning and
// once for the end.
// "Angle" adds a bend point to the line. "Text" types text in the middle of
// the line. A plain line (not a timeline) also has colours to pick from.
// The chain icon is for links later on.
export function LineMenu({
  time,
  color,
  onDone,
  onAngle,
  onText,
  onColor,
}: {
  time?: Timeline;
  color?: string;
  onDone: (time: Timeline) => void;
  onAngle: () => void;
  onText: () => void;
  onColor: (color: string) => void;
}) {
  const [step, setStep] = useState<"menu" | "unit" | "range" | "monthStart" | "monthEnd">("menu");
  const [unit, setUnit] = useState<TimeUnit>(time?.unit ?? "day");
  const [start, setStart] = useState(time?.start ?? "");
  const [end, setEnd] = useState(time?.end ?? "");
  const endRef = useRef<HTMLInputElement>(null);
  const valid = timelineTicks({ unit, start, end }) !== null;

  function pickUnit(u: TimeUnit) {
    setStart(u === time?.unit ? time.start : "");
    setEnd(u === time?.unit ? time.end : "");
    setUnit(u);
    setStep(u === "month" ? "monthStart" : "range");
  }

  const item = "w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100";
  const back = (
    <button
      type="button"
      onClick={() => setStep("unit")}
      className="rounded px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
    >
      Back
    </button>
  );

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
          <button className={item} onClick={onText}>
            Text
          </button>
          {!time && (
            <div className="flex gap-1.5 px-2 py-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={`Colour ${c}`}
                  onClick={() => onColor(c)}
                  className={`size-5 rounded-full ${(color ?? INK) === c ? "ring-2 ring-stone-400 ring-offset-1" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
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
          <div className="flex items-end gap-1.5">
            <NumberSlot
              name="start"
              label="Beginning"
              unit={unit}
              value={start}
              onChange={setStart}
              autoFocus
              onEnter={() => endRef.current?.focus()}
            />
            <span className="pb-1.5 text-stone-400">→</span>
            <NumberSlot
              name="end"
              label="End"
              unit={unit}
              value={end}
              onChange={setEnd}
              inputRef={endRef}
              onEnter={() => valid && onDone({ unit, start, end })}
            />
          </div>
          <div className="flex gap-2">
            {back}
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

      {(step === "monthStart" || step === "monthEnd") && (
        <div className="space-y-1.5 p-1">
          <div className="text-xs text-stone-500">{step === "monthStart" ? "Beginning" : "End"}</div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((m, i) => {
              const value = String(i + 1);
              const chosen = step === "monthStart" ? start === value : end === value;
              return (
                <button
                  key={m}
                  data-month={m}
                  disabled={step === "monthEnd" && value === start}
                  onClick={() => {
                    if (step === "monthStart") {
                      setStart(value);
                      setStep("monthEnd");
                    } else {
                      onDone({ unit, start, end: value });
                    }
                  }}
                  className={`rounded px-2 py-1 text-sm disabled:opacity-30 ${
                    chosen ? "bg-stone-900 text-white" : "hover:bg-stone-100"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
          {step === "monthStart" ? (
            back
          ) : (
            <button
              type="button"
              onClick={() => setStep("monthStart")}
              className="rounded px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
            >
              Back
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// A number box for the beginning or end. Type a number, or scroll over it
// (mouse wheel or trackpad) to count up and down within the unit's limits.
function NumberSlot({
  name,
  label,
  unit,
  value,
  onChange,
  onEnter,
  autoFocus,
  inputRef,
}: {
  name: string;
  label: string;
  unit: TimeUnit;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  useEffect(() => {
    const el = ref.current!;
    if (autoFocus) el.focus({ preventScroll: true });
    // Trackpads send lots of small scroll steps; count once per this much.
    const STEP = 40;
    let pending = 0;
    function onWheel(e: WheelEvent) {
      // Keep the board from zooming or moving while scrolling the number.
      e.preventDefault();
      e.stopPropagation();
      pending += e.deltaY;
      if (Math.abs(pending) < STEP) return;
      const steps = -Math.trunc(pending / STEP);
      pending %= STEP;
      const { min, max } = LIMITS[unit];
      const { value, onChange } = latest.current;
      const from = value === "" ? (unit === "year" ? new Date().getFullYear() : min) - steps : Number(value);
      onChange(String(Math.min(max, Math.max(min, from + steps))));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // Set up once per slot; reads the current value through a ref.
  }, [unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const { min, max } = LIMITS[unit];
  return (
    <label className="block flex-1 text-xs text-stone-500">
      {label}
      <input
        ref={ref}
        name={name}
        inputMode="numeric"
        placeholder={unit === "year" ? String(new Date().getFullYear()) : `${min}-${max}`}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
      />
    </label>
  );
}
