import { createClient } from "@/lib/supabase/server";
import type { PhaseWithItems } from "./types";

// All of the signed-in person's phases with their goals and events,
// oldest phase first. Row Level Security limits this to their own rows.
export async function getPhases(): Promise<PhaseWithItems[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("phases")
    .select("*, items(*)")
    .order("start_date", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    ...p,
    items: [...(p.items ?? [])].sort(
      (a, b) =>
        Number(b.priority) - Number(a.priority) ||
        (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
        a.created_at.localeCompare(b.created_at),
    ),
  }));
}
