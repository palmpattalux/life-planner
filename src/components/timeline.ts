// Turning a line into a timeline: the unit, the start and end the person
// entered, and the evenly spaced ticks between them.

export type TimeUnit = "day" | "week" | "month" | "year";

// start / end are kept in the browser input formats:
// day "2026-10-10", week "2026-W41", month "2026-10", year "2026".
export type Timeline = { unit: TimeUnit; start: string; end: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 60 * 60 * 1000;
// Don't try to draw absurd ranges (e.g. 100 years of days).
export const MAX_TICKS = 5000;

// Monday of ISO week `week` in `year`. Week 1 is the week containing 4 January.
function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY_MS;
  return new Date(monday1 + (week - 1) * 7 * DAY_MS);
}

function isoWeekOf(d: Date): { year: number; week: number } {
  // The Thursday of this week decides which year the week belongs to.
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.round((thursday.getTime() - isoWeekMonday(year, 1).getTime()) / (7 * DAY_MS)) + 1;
  return { year, week };
}

// A comparable number for a start/end value, or null if it isn't valid.
// Days and weeks count days, months count months, years count years.
function toIndex(unit: TimeUnit, value: string): number | null {
  let m: RegExpMatchArray | null;
  switch (unit) {
    case "day":
      if (!(m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return null;
      return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
    case "week":
      if (!(m = value.match(/^(\d{4})-W(\d{1,2})$/))) return null;
      if (+m[2] < 1 || +m[2] > 53) return null;
      return isoWeekMonday(+m[1], +m[2]).getTime() / DAY_MS;
    case "month":
      if (!(m = value.match(/^(\d{4})-(\d{2})$/))) return null;
      if (+m[2] < 1 || +m[2] > 12) return null;
      return +m[1] * 12 + (+m[2] - 1);
    case "year":
      if (!/^\d{1,4}$/.test(value)) return null;
      return +value;
  }
}

function label(unit: TimeUnit, index: number): string {
  switch (unit) {
    case "day": {
      const d = new Date(index * DAY_MS);
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    }
    case "week":
      return `W${isoWeekOf(new Date(index * DAY_MS)).week}`;
    case "month":
      return `${MONTHS[index % 12]} ${Math.floor(index / 12)}`;
    case "year":
      return String(index);
  }
}

// One label per day / week / month / year from start to end, inclusive.
// Returns null when the range is invalid (bad value, end not after start, or
// too many ticks).
export function timelineTicks(t: Timeline): string[] | null {
  const a = toIndex(t.unit, t.start);
  const b = toIndex(t.unit, t.end);
  if (a === null || b === null || b <= a) return null;
  const step = t.unit === "week" ? 7 : 1;
  const count = Math.floor((b - a) / step) + 1;
  if (count > MAX_TICKS) return null;
  return Array.from({ length: count }, (_, i) => label(t.unit, a + i * step));
}

// Today's value in the input format for a unit, as a starting point.
export function todayValue(unit: TimeUnit): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (unit) {
    case "day":
      return d.toISOString().slice(0, 10);
    case "week": {
      const { year, week } = isoWeekOf(d);
      return `${year}-W${pad(week)}`;
    }
    case "month":
      return d.toISOString().slice(0, 7);
    case "year":
      return String(d.getUTCFullYear());
  }
}
