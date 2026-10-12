// Turning a line into a timeline: the unit, the beginning and end the person
// picked, and the evenly spaced ticks between them.

export type TimeUnit = "day" | "week" | "month" | "year";

// start / end are whole numbers kept as text: day 0-31, week 1-4,
// month 1-12 (Jan-Dec), year e.g. "2026".
// startSub / endSub: a phase made between the smaller steps that show when a
// timeline is stretched (see subSteps): which step inside `start` / `end`.
export type Timeline = { unit: TimeUnit; start: string; end: string; startSub?: number; endSub?: number };

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The numbers each unit allows.
export const LIMITS: Record<TimeUnit, { min: number; max: number }> = {
  day: { min: 0, max: 31 },
  week: { min: 1, max: 4 },
  month: { min: 1, max: 12 },
  year: { min: 1, max: 9999 },
};

// Don't try to draw absurd ranges (e.g. thousands of years).
export const MAX_TICKS = 5000;

function toNumber(unit: TimeUnit, value: string): number | null {
  if (!/^\d{1,4}$/.test(value)) return null;
  const n = Number(value);
  const { min, max } = LIMITS[unit];
  return n >= min && n <= max ? n : null;
}

function label(unit: TimeUnit, n: number): string {
  switch (unit) {
    case "day":
    case "year":
      return String(n);
    case "week":
      return `W${n}`;
    case "month":
      return MONTHS[n - 1];
  }
}

// One label per day / week / month / year from beginning to end, inclusive.
// Months may wrap round the year (Nov to Feb). Returns null when the range is
// invalid (bad value, end not after beginning, or too many ticks).
export function timelineTicks(t: Timeline): string[] | null {
  const a = toNumber(t.unit, t.start);
  const b = toNumber(t.unit, t.end);
  if (a === null || b === null || a === b) return null;
  if (t.unit === "month") {
    const count = ((b - a + 12) % 12) + 1;
    return Array.from({ length: count }, (_, i) => label("month", ((a - 1 + i) % 12) + 1));
  }
  if (b < a || b - a + 1 > MAX_TICKS) return null;
  return Array.from({ length: b - a + 1 }, (_, i) => label(t.unit, a + i));
}

// The start / end value of the i-th tick of a valid timeline (for making a
// phase from part of it).
export function tickValue(t: Timeline, i: number): string {
  const a = Number(t.start);
  if (t.unit === "month") return String(((a - 1 + i) % 12) + 1);
  return String(a + i);
}

// Stretched far enough, the space between two ticks fills with the smaller
// steps they're made of: months in a year, dates in a month, days in a week,
// hours in a day. These are the labels of the steps inside the tick with
// this value; the first (0) is the tick itself.
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function subSteps(unit: TimeUnit, value: string): string[] {
  switch (unit) {
    case "year":
      return MONTHS;
    case "month":
      return Array.from({ length: DAYS_IN_MONTH[Number(value) - 1] ?? 31 }, (_, i) => String(i + 1));
    case "week":
      return WEEKDAYS;
    case "day":
      return Array.from({ length: 24 }, (_, i) => `${i}:00`);
  }
}

// A tick's value with one of its smaller steps, written out in full
// ("Oct 20", "Mar 2026", "W2 Wed", "5 14:00").
function fullLabel(unit: TimeUnit, value: string, sub: number): string {
  const step = subSteps(unit, value)[sub] ?? "";
  switch (unit) {
    case "year":
      return `${step} ${value}`;
    case "month":
      return `${MONTHS[Number(value) - 1]} ${step}`;
    case "week":
      return `W${value} ${step}`;
    case "day":
      return `${value} ${step}`;
  }
}

// The labels to draw for a timeline. A phase made between smaller steps
// (it has startSub / endSub) shows just its two ends written out in full.
export function timelineLabels(t: Timeline): string[] | null {
  if (t.startSub === undefined && t.endSub === undefined) return timelineTicks(t);
  return [fullLabel(t.unit, t.start, t.startSub ?? 0), fullLabel(t.unit, t.end, t.endSub ?? 0)];
}
