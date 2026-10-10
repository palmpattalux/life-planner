import Link from "next/link";
import { Nav } from "@/components/Nav";
import { ItemRow } from "@/components/ItemRow";
import { PhaseForm } from "@/components/PhaseForm";
import { getPhases } from "@/lib/data";
import { findCurrentPhase, phaseRange, today } from "@/lib/dates";

// The quick look: open the app, see the phase you're in and what to do now.
export default async function NowPage() {
  const phases = await getPhases();
  const current = findCurrentPhase(phases);
  const next = phases.find((p) => p.start_date > today());

  if (!current) {
    return (
      <>
        <Nav active="now" />
        <main className="mx-auto max-w-2xl px-4 py-8">
          <h1 className="text-2xl font-semibold">What phase of life are you in?</h1>
          <p className="mt-1 text-stone-500">
            Name it once. After that, this screen tells you what to focus on.
          </p>
          <div className="card mt-6">
            <PhaseForm />
          </div>
          {phases.length > 0 && (
            <p className="mt-4 text-sm text-stone-500">
              None of your phases covers today.{" "}
              <Link href="/timeline" className="underline">
                Open the timeline
              </Link>{" "}
              to adjust the dates.
            </p>
          )}
        </main>
      </>
    );
  }

  const goals = current.items.filter((i) => i.kind === "goal");
  const openGoals = goals.filter((i) => !i.done);
  const focus = openGoals.slice(0, 3);
  const upcoming = current.items
    .filter((i) => i.kind === "event" && !i.done && (!i.date || i.date >= today()))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))
    .slice(0, 3);

  return (
    <>
      <Nav active="now" />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <section>
          <p className="text-sm font-medium uppercase tracking-wider text-amber-600">
            You are here
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{current.title}</h1>
          <p className="text-sm text-stone-500">{phaseRange(current)}</p>
          {current.focus && (
            <blockquote className="mt-4 border-l-4 border-amber-400 pl-4 text-lg text-stone-700">
              {current.focus}
            </blockquote>
          )}
        </section>

        <section className="card">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Focus on these</h2>
            {goals.length > 0 && (
              <span className="text-sm text-stone-500">
                {goals.length - openGoals.length} of {goals.length} goals done
              </span>
            )}
          </div>
          {focus.length > 0 ? (
            <ul className="mt-2 divide-y divide-stone-100">
              {focus.map((item) => (
                <ItemRow key={item.id} item={item} editable={false} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-stone-500">
              {goals.length > 0 ? "All goals done. Nice work." : "No goals yet."}{" "}
              <Link href="/timeline#now" className="underline">
                Add one
              </Link>
            </p>
          )}
        </section>

        {upcoming.length > 0 && (
          <section className="card">
            <h2 className="font-semibold">Coming up</h2>
            <ul className="mt-2 divide-y divide-stone-100">
              {upcoming.map((item) => (
                <ItemRow key={item.id} item={item} editable={false} />
              ))}
            </ul>
          </section>
        )}

        <div className="flex items-center justify-between text-sm text-stone-500">
          <span>{next ? `Next phase: ${next.title}` : ""}</span>
          <Link href="/timeline#now" className="btn-secondary">
            Open timeline
          </Link>
        </div>
      </main>
    </>
  );
}
