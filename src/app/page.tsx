import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { tablesMissing } from "@/lib/pages";
import { SetupNeeded } from "./SetupNeeded";

// Opening the app goes straight to the board opened last, with the "Open?"
// box showing so switching to another one is a click away.
export default async function Home() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("pages")
    .select("id")
    .eq("kind", "board")
    .is("deleted_at", null)
    .order("opened_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error && tablesMissing(error)) return <SetupNeeded message={error.message} />;
  if (error) throw new Error(error.message);
  // No boards yet: Home, where "New board" starts one.
  redirect(data[0] ? `/board/${data[0].id}?open=1` : "/home");
}
