import { savePhase } from "@/app/actions";
import { today } from "@/lib/dates";
import type { Phase } from "@/lib/types";

export function PhaseForm({ phase }: { phase?: Phase }) {
  return (
    <form action={savePhase} className="space-y-3">
      {phase && <input type="hidden" name="id" value={phase.id} />}
      <input
        name="title"
        required
        defaultValue={phase?.title}
        placeholder="Phase name, e.g. Build my career"
        className="input"
      />
      <textarea
        name="focus"
        rows={2}
        defaultValue={phase?.focus ?? ""}
        placeholder="What matters most in this phase? (one or two sentences)"
        className="input"
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-stone-500">
          Starts
          <input
            name="start_date"
            type="date"
            required
            defaultValue={phase?.start_date ?? today()}
            className="input mt-1"
          />
        </label>
        <label className="text-sm text-stone-500">
          Ends (optional)
          <input
            name="end_date"
            type="date"
            defaultValue={phase?.end_date ?? ""}
            className="input mt-1"
          />
        </label>
      </div>
      <button className="btn-primary w-full">{phase ? "Save phase" : "Add phase"}</button>
    </form>
  );
}
