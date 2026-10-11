import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { tablesMissing } from "@/lib/pages";
import { createPage } from "./actions";
import { SetupNeeded } from "./SetupNeeded";

// Opening the app goes straight to the board opened last, with the "Open?"
// box showing so switching to another one is a click away. With no boards
// yet, it offers to start one. (The app is for boards; notes are an extra.)
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
  if (data[0]) redirect(`/board/${data[0].id}?open=1`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-stone-500">No boards yet.</p>
      <div className="flex gap-2">
        <form action={createPage.bind(null, "board", null)}>
          <button className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">New board</button>
        </form>
      </div>
    </main>
  );
}
