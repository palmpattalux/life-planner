import { deleteItem, toggleItem } from "@/app/actions";
import { formatDate } from "@/lib/dates";
import type { Item } from "@/lib/types";
import { ItemForm } from "./ItemForm";

export function ItemRow({ item, editable = true }: { item: Item; editable?: boolean }) {
  return (
    <li className="group py-2">
      <div className="flex items-start gap-3">
        <form action={toggleItem} className="pt-0.5">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="done" value={String(item.done)} />
          <button
            aria-label={item.done ? "Mark as not done" : "Mark as done"}
            className={`flex size-5 items-center justify-center border-2 text-xs ${
              item.kind === "goal" ? "rounded-md" : "rounded-full"
            } ${
              item.done
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-stone-300 hover:border-stone-500"
            }`}
          >
            {item.done && "✓"}
          </button>
        </form>

        <div className="min-w-0 flex-1">
          <p className={item.done ? "text-stone-400 line-through" : ""}>
            {item.priority && !item.done && <span className="mr-1 text-amber-500">★</span>}
            {item.title}
          </p>
          <p className="text-xs text-stone-500">
            {item.kind === "event" ? "Event" : "Goal"}
            {item.date && ` · ${formatDate(item.date)}`}
          </p>
          {item.notes && <p className="mt-1 text-sm text-stone-600">{item.notes}</p>}
        </div>
      </div>

      {editable && (
        <details className="ml-8 mt-1">
          <summary className="btn-link cursor-pointer list-none">Edit</summary>
          <div className="mt-2 rounded-xl bg-stone-50 p-3">
            <ItemForm phaseId={item.phase_id} item={item} />
            <form action={deleteItem} className="mt-2 text-right">
              <input type="hidden" name="id" value={item.id} />
              <button className="text-sm text-red-600 hover:underline">Delete</button>
            </form>
          </div>
        </details>
      )}
    </li>
  );
}
