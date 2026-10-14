"use client";

import { useState } from "react";
import { MONTHS } from "./timeline";

// A timeline's "Priority task": pick the deadline a step at a time (the year,
// then the month, then the day; each choice moves on to the next), then type
// the task. Skip leaves the rest of the date at its first (January, the 1st);
// Back goes a step back. Clicking anywhere else cancels.
export function PriorityPicker({
  years,
  error,
  onDone,
  onBack,
}: {
  years: number[];
  error: string | null;
  // Whether this deadline can go on the timeline (shown as `error` if not).
  onDone: (deadline: Date, task: string) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<"year" | "month" | "day" | "task">("year");
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null); // 0-11
  const [day, setDay] = useState<number | null>(null);
  const [task, setTask] = useState("");
  const thisYear = new Date().getFullYear();
  const deadline = () => new Date(year ?? thisYear, month ?? 0, day ?? 1);
  const days = new Date(year ?? thisYear, (month ?? 0) + 1, 0).getDate();

  const cell = "rounded px-2 py-1 text-sm hover:bg-stone-100";
  const chosen = [year, month !== null ? MONTHS[month] : null, day].filter((x) => x !== null).join(" ");
  const back = () => {
    if (step === "year") return onBack();
    if (step === "month") setYear(null);
    if (step === "day") setMonth(null);
    if (step === "task") setDay(null);
    setStep(step === "month" ? "year" : step === "day" ? "month" : "day");
  };

  return (
    <div data-priority-picker className="w-56 space-y-1.5 p-1">
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>{step === "task" ? "Task" : `Pick the ${step}`}</span>
        <span className="font-medium text-stone-700">{chosen}</span>
      </div>

      {step === "year" && (
        <div className="grid max-h-48 grid-cols-3 gap-1 overflow-y-auto">
          {years.map((y) => (
            <button
              key={y}
              data-year={y}
              onClick={() => {
                setYear(y);
                setStep("month");
              }}
              className={cell}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {step === "month" && (
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              data-month={m}
              onClick={() => {
                setMonth(i);
                setStep("day");
              }}
              className={cell}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {step === "day" && (
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: days }, (_, i) => (
            <button
              key={i}
              data-day={i + 1}
              onClick={() => {
                setDay(i + 1);
                setStep("task");
              }}
              className="rounded py-1 text-xs hover:bg-stone-100"
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {step === "task" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (task.trim()) onDone(deadline(), task.trim());
          }}
        >
          <input
            data-priority-task
            autoFocus
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Type the task, then Enter"
            className="w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
          />
        </form>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-1">
        <button
          type="button"
          data-picker-back
          onClick={back}
          className="rounded px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
        >
          Back
        </button>
        {step !== "task" && (
          <button
            type="button"
            data-picker-skip
            onClick={() => setStep("task")}
            className="rounded px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
          >
            Skip
          </button>
        )}
        {step === "task" && (
          <button
            type="button"
            disabled={!task.trim()}
            onClick={() => onDone(deadline(), task.trim())}
            className="ml-auto rounded bg-stone-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-30"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
