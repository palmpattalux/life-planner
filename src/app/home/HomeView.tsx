"use client";

import { useMemo } from "react";
import { daysUntil, loadPhase, loadPriority, savePhase, savePriority, type Phase, type Task } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { BoardList, useBoards, type Project } from "../BoardList";
import { AccountMenu } from "./AccountMenu";
import { PhaseBox } from "./PhaseBox";
import { Deadlines, PriorityBox } from "./PriorityBox";
import { TodayBox } from "./TodayBox";
import { useHoverTap } from "./useHoverTap";
import { useSaved } from "./useSaved";

// How long until the milestone ends, for the faint line above the boards.
function countdown(p: Phase | null) {
  if (!p?.end) return null;
  const n = daysUntil(p.end);
  if (n < 0) return "Milestone ended";
  if (n === 0) return "Last day of the milestone";
  return `${n} ${n === 1 ? "day" : "days"} until milestone`;
}

// Home: who's logged in on the left, a menu on the right (trash and Log out),
// today's to-do list, the milestone and priority tasks on the left, and every
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
  const priority = useSaved<Task[]>(
    "priority",
    () => loadPriority(supabase),
    (tasks) => savePriority(supabase, tasks),
  );
  const left = countdown(phase.value);

  // For each board: its priority tasks and the texts linked to milestone
  // tasks, counting only the ones not done yet.
  function attention(p: Project) {
    const open = (tasks: Task[] | undefined) => new Set(tasks?.filter((t) => !t.done && t.link).map((t) => t.link));
    const priorityOpen = open(priority.value ?? undefined);
    const milestoneOpen = open(phase.value?.tasks);
    const texts = p.content?.texts ?? [];
    return {
      priority: texts.filter((t) => t.deadline && t.link && priorityOpen.has(t.link)).length,
      milestone: texts.filter((t) => t.link && milestoneOpen.has(t.link)).length,
    };
  }

  return (
    <main className="flex min-h-dvh flex-col xl:h-dvh">
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <span data-account className="truncate font-medium">
          {email}
        </span>
        <AccountMenu boards={boards} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-6 px-5 pb-16 xl:grid xl:grid-cols-[18rem_1fr_18rem] xl:gap-5">
        {/* Padded (and pulled back out) so the to-do box's Tomorrow glow isn't cut off. */}
        <aside
          data-planner
          className="flex w-full flex-col gap-4 sm:max-w-sm xl:-mx-4 xl:-mt-4 xl:w-auto xl:max-w-none xl:overflow-y-auto xl:overflow-x-hidden xl:p-4"
        >
          <TodayBox email={email} />
          <PhaseBox phase={phase.value} onChange={phase.change} />
          {phase.failed && (
            <p className="text-xs text-red-600">
              Couldn&apos;t load or save the milestone. If this keeps happening, the database may need its latest setup
              (supabase/schema.sql).
            </p>
          )}
          <PriorityBox tasks={priority.value} onChange={priority.change} />
          {priority.failed && (
            <p className="text-xs text-red-600">
              Couldn&apos;t load or save the priority tasks. If this keeps happening, the database may need its latest
              setup (supabase/schema.sql).
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
              <BoardList boards={boards} home attention={attention} />
            </div>
          </div>
        </div>
        {/* The time left until each priority task's deadline. */}
        <aside className="xl:overflow-y-auto xl:pt-16">
          <Deadlines tasks={priority.value} />
        </aside>
      </div>
    </main>
  );
}
