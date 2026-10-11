// Turning a line into a timeline: the unit, the beginning and end the person
// picked, and the evenly spaced ticks between them.

export type TimeUnit = "day" | "week" | "month" | "year";

// start / end are whole numbers kept as text: day 0-31, week 1-4,
// month 1-12 (Jan-Dec), year e.g. "2026".
export type Timeline = { unit: TimeUnit; start: string; end: string };

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
