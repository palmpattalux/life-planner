import { saveItem } from "@/app/actions";
import type { Item } from "@/lib/types";

export function ItemForm({ phaseId, item }: { phaseId: string; item?: Item }) {
  return (
    <form action={saveItem} className="space-y-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="phase_id" value={phaseId} />
      <div className="flex gap-2">
        <select name="kind" defaultValue={item?.kind ?? "goal"} className="input w-28 shrink-0">
          <option value="goal">Goal</option>
          <option value="event">Event</option>
        </select>
        <input
          name="title"
          required
          defaultValue={item?.title}
          placeholder="What is it?"
          className="input"
        />
      </div>
      <textarea
        name="notes"
        rows={2}
        defaultValue={item?.notes ?? ""}
        placeholder="Notes (optional)"
        className="input"
      />
      <div className="flex items-center gap-3">
        <input
          name="date"
          type="date"
          defaultValue={item?.date ?? ""}
          aria-label="Date (optional)"
          className="input w-auto"
        />
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input
            name="priority"
            type="checkbox"
            defaultChecked={item?.priority}
            className="size-4 accent-amber-500"
          />
          Top priority
        </label>
      </div>
      <button className="btn-primary w-full">{item ? "Save" : "Add"}</button>
    </form>
  );
}
