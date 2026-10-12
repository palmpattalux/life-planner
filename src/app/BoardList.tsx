"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TRASH_DAYS, UNTITLED_BOARD } from "@/lib/pages";
import { createClient } from "@/lib/supabase/client";
import type { BoardData } from "@/components/board/model";
import { createBoard } from "./actions";
import { BoardPreview } from "./BoardPreview";

type Project = { id: string; title: string; deleted_at: string | null; content?: BoardData };

const DAY_MS = 24 * 60 * 60 * 1000;
const GAP = 12;
// Below this the boxes stop shrinking and the list scrolls instead.
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

// Every board, as boxes that share out the space they're given (the more
// boards, the smaller each box). Hovering a board shows Remove (to the trash
// for 30 days) and Duplicate. Used by the "Open?" box and the Home page.
// `currentId` is the board open right now, if any; clicking it calls
// `onOpenCurrent` instead of reloading it. `home`: the bare Home look, with
// no dividers, boxes that pop and a blurred picture of each board.
export function BoardList({
  currentId,
  onOpenCurrent,
  home = false,
}: {
  currentId?: string;
  onOpenCurrent?: () => void;
  home?: boolean;
}) {
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
      .select(home ? "id, title, deleted_at, content" : "id, title, deleted_at")
      .eq("kind", "board")
      .is("parent_id", null)
      .order("opened_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    setProjects((data ?? []) as unknown as Project[]);
  }

  useEffect(() => {
    void load();
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
      {/* On Home the padding leaves room for a box's lift and shadow. */}
      <div ref={areaRef} className={`min-h-0 flex-1 overflow-y-auto ${home ? "p-8" : "px-5 pb-5"}`}>
        {projects === null && <p className="text-sm text-stone-400">Loading…</p>}
        {projects !== null && live.length === 0 && <p className="text-sm text-stone-400">No boards yet.</p>}
        {(() => {
          // Inside the padding (p-8 = 32px each side; px-5 pb-5 = 20px).
          const { cols, tw, th } = home
            ? tileLayout(live.length, area.w - 64, area.h - 64)
            : tileLayout(live.length, area.w - 40, area.h - 20);
          return (
            <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${tw}px)`, gap: GAP }}>
              {live.map((p) => (
                <div
                  key={p.id}
                  data-project={p.id}
                  className={
                    home
                      ? "group relative overflow-hidden rounded-2xl bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_20px_rgba(0,0,0,0.12)] active:scale-[0.98]"
                      : `group relative rounded-xl border-2 bg-stone-50 hover:border-stone-400 ${p.id === currentId ? "border-stone-900" : "border-stone-200"}`
                  }
                  style={{ height: th }}
                >
                  <Link
                    href={`/board/${p.id}`}
                    onClick={p.id === currentId ? onOpenCurrent : undefined}
                    className={`relative flex size-full flex-col items-center gap-1 overflow-hidden p-3 text-center ${home ? "justify-end" : "justify-center"}`}
                  >
                    {home && <BoardPreview data={p.content ?? null} />}
                    <span className={`relative font-medium ${home ? "line-clamp-1 text-sm" : "line-clamp-3"}`}>
                      {p.title || UNTITLED_BOARD}
                    </span>
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
        <div className={`max-h-48 overflow-y-auto px-3 py-2 ${home ? "" : "border-t border-stone-200"}`}>
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

      <div className={home ? "flex justify-center p-4" : "border-t border-stone-200 p-4"}>
        <form action={createBoard}>
          <button
            className={
              home
                ? "rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white shadow-[0_4px_14px_rgba(0,0,0,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.25)] active:scale-95"
                : "rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white"
            }
          >
            New board
          </button>
        </form>
      </div>
    </>
  );
}
