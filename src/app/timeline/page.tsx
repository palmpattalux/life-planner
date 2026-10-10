import { deletePhase } from "@/app/actions";
import { ItemForm } from "@/components/ItemForm";
import { ItemRow } from "@/components/ItemRow";
import { Nav } from "@/components/Nav";
import { PhaseForm } from "@/components/PhaseForm";
import { getPhases } from "@/lib/data";
import { findCurrentPhase, phaseRange, today } from "@/lib/dates";

// The whole board: every phase of life on one vertical line, past to future.
export default async function TimelinePage() {
  const phases = await getPhases();
  const current = findCurrentPhase(phases);
  const on = today();

  return (
    <>
      <Nav active="timeline" />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Your timeline</h1>
        <p className="mt-1 text-stone-500">Past at the top, future at the bottom.</p>

        <ol className="relative mt-8 border-l-2 border-stone-200 pl-6">
          {phases.map((phase) => {
            const isNow = phase.id === current?.id;
            const isPast = !!phase.end_date && phase.end_date < on;
            return (
              <li
                key={phase.id}
                id={isNow ? "now" : phase.id}
                className="relative mb-8 scroll-mt-20"
              >
                <span
                  className={`absolute -left-[33px] top-6 size-4 rounded-full border-2 ${
                    isNow
                      ? "border-amber-500 bg-amber-400 ring-4 ring-amber-100"
                      : isPast
                        ? "border-stone-300 bg-stone-300"
                        : "border-stone-400 bg-background"
                  }`}
                />
                <div
                  className={`card ${isNow ? "border-amber-300 ring-1 ring-amber-200" : ""} ${
                    isPast ? "opacity-70" : ""
                  }`}
                >
                  {isNow && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                      You are here
                    </p>
                  )}
                  <h2 className="text-lg font-semibold">{phase.title}</h2>
                  <p className="text-sm text-stone-500">{phaseRange(phase)}</p>
                  {phase.focus && <p className="mt-2 text-stone-700">{phase.focus}</p>}

                  {phase.items.length > 0 && (
                    <ul className="mt-3 divide-y divide-stone-100">
                      {phase.items.map((item) => (
                        <ItemRow key={item.id} item={item} />
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    <details className="w-full" open={isNow && phase.items.length === 0}>
                      <summary className="btn-link cursor-pointer list-none">
                        + Add goal or event
                      </summary>
                      <div className="mt-2 rounded-xl bg-stone-50 p-3">
                        <ItemForm phaseId={phase.id} />
                      </div>
                    </details>
                    <details className="w-full">
                      <summary className="btn-link cursor-pointer list-none">Edit phase</summary>
                      <div className="mt-2 rounded-xl bg-stone-50 p-3">
                        <PhaseForm phase={phase} />
                        <form action={deletePhase} className="mt-2 text-right">
                          <input type="hidden" name="id" value={phase.id} />
                          <button className="text-sm text-red-600 hover:underline">
                            Delete phase and everything in it
                          </button>
                        </form>
                      </div>
                    </details>
                  </div>
                </div>
              </li>
            );
          })}

          <li className="relative">
            <span className="absolute -left-[33px] top-6 size-4 rounded-full border-2 border-dashed border-stone-400 bg-background" />
            <details className="card" open={phases.length === 0}>
              <summary className="cursor-pointer list-none font-medium">+ Add a phase</summary>
              <div className="mt-3">
                <PhaseForm />
              </div>
            </details>
          </li>
        </ol>
      </main>
    </>
  );
}
