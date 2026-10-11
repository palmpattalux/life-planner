import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { untitled, type PageRow } from "@/lib/pages";
import { createPage } from "./actions";
import { SetupNeeded } from "./SetupNeeded";

// Home: every saved board and note, newest first.
export default async function Home() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("pages")
    .select("id, kind, title, updated_at")
    .is("parent_id", null)
    .order("updated_at", { ascending: false });
  if (error) return <SetupNeeded message={error.message} />;
  const pages = (data ?? []) as Pick<PageRow, "id" | "kind" | "title" | "updated_at">[];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Home</h1>
        <div className="flex gap-2">
          <form action={createPage.bind(null, "board", null)}>
            <button className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">New board</button>
          </form>
          <form action={createPage.bind(null, "note", null)}>
            <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium">New note</button>
          </form>
        </div>
      </div>

      {pages.length === 0 ? (
        <p className="mt-10 text-stone-500">Nothing saved yet. Start a new board or note.</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {pages.map((p) => (
            <Link
              key={p.id}
              href={`/${p.kind}/${p.id}`}
              className="rounded-lg border border-stone-200 p-4 hover:border-stone-400"
            >
              <div className="text-xs uppercase tracking-wide text-stone-400">{p.kind}</div>
              <div className="mt-1 font-medium">{p.title || untitled(p.kind)}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
