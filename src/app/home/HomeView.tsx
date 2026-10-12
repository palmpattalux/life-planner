"use client";

import { useMemo } from "react";
import { daysUntil, loadPhase, savePhase, type Phase } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { BoardList, useBoards } from "../BoardList";
import { AccountMenu } from "./AccountMenu";
import { PhaseBox } from "./PhaseBox";
import { TodayBox } from "./TodayBox";
import { useHoverTap } from "./useHoverTap";
import { useSaved } from "./useSaved";

// How long until the milestone ends, for the faint line above the boards.
function countdown(p: Phase | null) {
  if (!p?.end) return null;
  const n = daysUntil(p.end);
  if (n < 0) return "Milestone ended";
  if (n === 0) return "Last day of the milestone";
  return `${n} ${n === 1 ? "day" : "days"} until the milestone ends`;
}

// Home: who's logged in on the left, a menu on the right (trash and Log out),
// today's to-do list and the phase goal floating on the left, and every
// board grouped in the middle, with the days left in the phase goal above.
// (On narrower screens the to-do list and phase goal sit above the boards.)
export function HomeView({ email }: { email?: string }) {
  const boards = useBoards({ withContent: true });
  // A soft tap when hovering things that pop (Home only for now).
  useHoverTap();
  const supabase = useMemo(createClient, []);
  const phase = useSaved<Phase>(
    "milestone",
    () => loadPhase(supabase),
    (p) => savePhase(supabase, p),
  );
  const left = countdown(phase.value);

  return (
    <main className="flex min-h-dvh flex-col xl:h-dvh">
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <span data-account className="truncate font-medium">
          {email}
        </span>
        <AccountMenu boards={boards} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-6 px-5 pb-16 xl:grid xl:grid-cols-[18rem_1fr_18rem] xl:gap-5">
        <aside data-planner className="flex w-full flex-col gap-4 sm:max-w-sm xl:max-w-none xl:overflow-y-auto xl:pb-4">
          <TodayBox />
          <PhaseBox phase={phase.value} onChange={phase.change} />
          {phase.failed && (
            <p className="text-xs text-red-600">
              Couldn&apos;t load or save the milestone. If this keeps happening, the database may need its latest setup
              (supabase/schema.sql).
            </p>
          )}
        </aside>
        {/* The boards, grouped in the middle of the screen with nothing around them. */}
        <div className="flex min-h-0 flex-1 flex-col items-center xl:overflow-y-auto">
          <div className="my-auto flex w-full flex-col items-center">
            {left && (
              <p data-countdown className="mb-1 text-center text-xl font-medium text-stone-900/25 sm:text-2xl">
                {left}
              </p>
            )}
            <div data-home-boards className="flex w-full max-w-3xl flex-col pt-3">
              <BoardList boards={boards} home />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
