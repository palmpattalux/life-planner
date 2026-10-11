"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TRASH_DAYS, UNTITLED_BOARD } from "@/lib/pages";
import { createClient } from "@/lib/supabase/client";
import { createBoard } from "./actions";

type Project = { id: string; title: string; deleted_at: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const GAP = 12;
// Below this the boxes stop shrinking and the box scrolls instead.
const MIN_TILE = 96;

// How to lay out n boxes so together they fill a w by h area: the number of
// columns that keeps the boxes closest to square, and each box's size.
function tileLayout(n: number, w: number, h: number) {
  if (w <= 0 || h <= 0) return { cols: 1, tw: 0, th: 0 };
  let best = { cols: 1, tw: 0, th: 0 };
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.max(1, Math.ceil(n / cols));
    const tw = (w - (cols - 1) * GAP) / cols;
    const th = (h - (rows - 1) * GAP) / rows;
    if (Math.min(tw, th) > Math.min(best.tw, best.th)) best = { cols, tw, th };
  }
  if (Math.min(best.tw, best.th) >= MIN_TILE) return best;
  // Too many to fit: smallest boxes, as many across as fit, and scroll.
  const cols = Math.max(1, Math.floor((w + GAP) / (MIN_TILE + GAP)));
  const tw = (w - (cols - 1) * GAP) / cols;
  return { cols, tw, th: tw };
}

// The "Open?" box on the right third of the screen: every board, as boxes that
// share out its space (the more boards, the smaller each box), so it's one
// click to switch away from the one that opened by itself. Hovering a board
// shows Remove (to the trash for 30 days) and Duplicate. Clicking anywhere
// else or the x closes it.
export function OpenPanel({ currentId, onClose }: { currentId: string; onClose: () => void }) {
  const supabase = useMemo(createClient, []);
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  // The space the board boxes fill.
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current!;
    const observer = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  async function load() {
    // Anything in the trash longer than 30 days is deleted for good.
    await supabase
      .from("pages")
      .delete()
      .lt("deleted_at", new Date(Date.now() - TRASH_DAYS * DAY_MS).toISOString());
    const { data } = await supabase
      .from("pages")
      .select("id, title, deleted_at")
      .eq("kind", "board")
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
      .insert({ kind: "board", title: `${p.title || UNTITLED_BOARD} copy`, content: data.content });
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

        <div ref={areaRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {projects === null && <p className="text-sm text-stone-400">Loading…</p>}
          {projects !== null && live.length === 0 && <p className="text-sm text-stone-400">No boards yet.</p>}
          {(() => {
            // Inside the padding (px-5 pb-5 = 20px each side).
            const { cols, tw, th } = tileLayout(live.length, area.w - 40, area.h - 20);
            return (
              <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${tw}px)`, gap: GAP }}>
                {live.map((p) => (
                  <div
                    key={p.id}
                    data-project={p.id}
                    className={`group relative rounded-xl border-2 bg-stone-50 hover:border-stone-400 ${p.id === currentId ? "border-stone-900" : "border-stone-200"}`}
                    style={{ height: th }}
                  >
                    <Link
                      href={`/board/${p.id}`}
                      onClick={p.id === currentId ? onClose : undefined}
                      className="flex size-full flex-col items-center justify-center gap-1 overflow-hidden p-3 text-center"
                    >
                      <span className="line-clamp-3 font-medium">{p.title || UNTITLED_BOARD}</span>
                      {p.id === currentId && <span className="text-xs text-stone-400">open now</span>}
                    </Link>
                    <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                      <button
                        onClick={() => remove(p)}
                        className="rounded bg-white px-2 py-1 text-xs shadow-sm hover:bg-stone-100"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => duplicate(p)}
                        className="rounded bg-white px-2 py-1 text-xs shadow-sm hover:bg-stone-100"
                      >
                        Duplicate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {trash.length > 0 && (
          <div className="max-h-48 overflow-y-auto border-t border-stone-200 px-3 py-2">
            <button
              onClick={() => setShowTrash((t) => !t)}
              className="px-2 py-1 text-sm text-stone-500 hover:text-stone-900"
            >
              Trash ({trash.length}) {showTrash ? "▾" : "▸"}
            </button>
            {showTrash &&
              trash.map((p) => (
                <div key={p.id} data-trashed={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-stone-500">{p.title || UNTITLED_BOARD}</span>
                  <span className="shrink-0 text-xs text-stone-400">{daysLeft(p)} days left</span>
                  <button onClick={() => restore(p)} className="shrink-0 rounded px-2 py-1 text-xs hover:bg-stone-100">
                    Restore
                  </button>
                </div>
              ))}
          </div>
        )}

        <div className="border-t border-stone-200 p-4">
          <form action={createBoard}>
            <button className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">New board</button>
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
