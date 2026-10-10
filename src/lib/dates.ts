import type { Phase } from "./types";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function phaseRange(p: Phase): string {
  return `${formatDate(p.start_date)} – ${p.end_date ? formatDate(p.end_date) : "ongoing"}`;
}

// The phase you are in today: it has started and has not ended yet.
// If several overlap, the most recently started one wins.
export function isCurrent(p: Phase, on = today()): boolean {
  return p.start_date <= on && (!p.end_date || p.end_date >= on);
}

export function findCurrentPhase<T extends Phase>(phases: T[]): T | undefined {
  const on = today();
  return [...phases]
    .filter((p) => isCurrent(p, on))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
}
