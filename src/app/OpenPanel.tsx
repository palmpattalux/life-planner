"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TRASH_DAYS, untitled, type PageKind } from "@/lib/pages";
import { createClient } from "@/lib/supabase/client";
import { createPage } from "./actions";

type Project = { id: string; kind: PageKind; title: string; deleted_at: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;

// The "Open?" box on the right third of the screen: every project, so it's
// one click to switch away from the one that opened by itself. Hovering a
// project shows Remove (to the trash for 30 days) and Duplicate. Clicking
// anywhere else or the x closes it.
export function OpenPanel({ currentId, onClose }: { currentId: string; onClose: () => void }) {
  const supabase = useMemo(createClient, []);
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [showTrash, setShowTrash] = useState(false);

  async function load() {
    // Anything in the trash longer than 30 days is deleted for good.
    await supabase
      .from("pages")
      .delete()
      .lt("deleted_at", new Date(Date.now() - TRASH_DAYS * DAY_MS).toISOString());
    const { data } = await supabase
      .from("pages")
      .select("id, kind, title, deleted_at")
      .is("parent_id", null)
      .order("opened_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    setProjects((data ?? []) as Project[]);
  }

  useEffect(() => {
    void load();
    // Opened by itself (from the address): drop "?open=1" so a reload doesn't reopen it.
    if (new URLSearchParams(location.search).has("open")) history.replaceState(null, "", location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(p: Project) {
    await supabase.from("pages").update({ deleted_at: new Date().toISOString() }).eq("id", p.id);
    // Removing the open project moves on to the next most recent one.
    if (p.id === currentId) router.push("/");
    else void load();
  }

  async function restore(p: Project) {
    await supabase.from("pages").update({ deleted_at: null }).eq("id", p.id);
    void load();
  }

  async function duplicate(p: Project) {
    const { data } = await supabase.from("pages").select("content").eq("id", p.id).single();
    if (!data) return;
    await supabase
      .from("pages")
      .insert({ kind: p.kind, title: `${p.title || untitled(p.kind)} copy`, content: data.content });
    void load();
  }

  const live = projects?.filter((p) => !p.deleted_at) ?? [];
  const trash = projects?.filter((p) => p.deleted_at) ?? [];
  const daysLeft = (p: Project) =>
    Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - new Date(p.deleted_at!).getTime()) / DAY_MS));

  return (
    <>
      {/* Clicking anywhere else closes the box. */}
      <div data-open-backdrop className="fixed inset-0 z-20" onPointerDown={onClose} />
      <aside
        data-open-panel
        className="fixed bottom-0 right-0 top-0 z-30 flex w-1/3 min-w-72 flex-col border-l border-stone-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2 className="text-xl font-semibold">Open?</h2>
          <button aria-label="Close" onClick={onClose} className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          {projects === null && <p className="px-2 text-sm text-stone-400">Loading…</p>}
          {live.map((p) => (
            <div key={p.id} data-project={p.id} className="group flex items-center gap-2 rounded-md hover:bg-stone-100">
              <Link
                href={`/${p.kind}/${p.id}`}
                onClick={p.id === currentId ? onClose : undefined}
                className="min-w-0 flex-1 truncate px-2 py-2"
              >
                <span className="mr-2 text-xs uppercase tracking-wide text-stone-400">{p.kind}</span>
                {p.title || untitled(p.kind)}
                {p.id === currentId && <span className="ml-2 text-xs text-stone-400">open now</span>}
              </Link>
              <div className="hidden shrink-0 gap-1 pr-2 group-hover:flex">
                <button onClick={() => remove(p)} className="rounded px-2 py-1 text-xs hover:bg-white">
                  Remove
                </button>
                <button onClick={() => duplicate(p)} className="rounded px-2 py-1 text-xs hover:bg-white">
                  Duplicate
                </button>
              </div>
            </div>
          ))}

          {trash.length > 0 && (
            <div className="mt-4 border-t border-stone-200 pt-3">
              <button
                onClick={() => setShowTrash((t) => !t)}
                className="px-2 py-1 text-sm text-stone-500 hover:text-stone-900"
              >
                Trash ({trash.length}) {showTrash ? "▾" : "▸"}
              </button>
              {showTrash &&
                trash.map((p) => (
                  <div key={p.id} data-trashed={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-stone-500">{p.title || untitled(p.kind)}</span>
                    <span className="shrink-0 text-xs text-stone-400">{daysLeft(p)} days left</span>
                    <button
                      onClick={() => restore(p)}
                      className="shrink-0 rounded px-2 py-1 text-xs hover:bg-stone-100"
                    >
                      Restore
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-stone-200 p-4">
          <form action={createPage.bind(null, "board", null)}>
            <button className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">New board</button>
          </form>
          <form action={createPage.bind(null, "note", null)}>
            <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium">New note</button>
          </form>
        </div>
      </aside>
    </>
  );
}

// Marks a page as just opened, so it's the one that opens next time.
export function useMarkOpened(id: string) {
  useEffect(() => {
    // (Supabase only sends a query once something waits for its answer.)
    void createClient()
      .from("pages")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", id)
      .then(() => {});
  }, [id]);
}
