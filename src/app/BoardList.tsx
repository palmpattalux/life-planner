"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TRASH_DAYS, UNTITLED_BOARD } from "@/lib/pages";
import { createClient } from "@/lib/supabase/client";
import type { BoardData } from "@/components/board/model";
import { createBoard } from "./actions";
import { BoardPreview } from "./BoardPreview";
import { Popover } from "./home/Popover";
import { MergeDialog } from "./MergeDialog";
import { TornPaper } from "./TornPaper";

export type Project = { id: string; title: string; deleted_at: string | null; hidden?: boolean; content?: BoardData };

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

// Every board (and the trash), loaded once and shared by the boxes and
// anything else showing them, like the trash in Home's menu.
export function useBoards({ withContent = false, currentId }: { withContent?: boolean; currentId?: string } = {}) {
  const supabase = useMemo(createClient, []);
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);

  async function load() {
    // Anything in the trash longer than 30 days is deleted for good.
    await supabase
      .from("pages")
      .delete()
      .lt("deleted_at", new Date(Date.now() - TRASH_DAYS * DAY_MS).toISOString());
    const query = (columns: string) =>
      supabase
        .from("pages")
        .select(withContent ? `${columns}, content` : columns)
        .eq("kind", "board")
        .is("parent_id", null)
        .order("opened_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });
    let { data, error } = await query("id, title, deleted_at, hidden");
    // Before the database has the "hidden" column, nothing is hidden.
    if (error) ({ data, error } = await query("id, title, deleted_at"));
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

  // Hide a board from Home's main list, or show it again (it goes back to
  // where it was, since the order doesn't change).
  // If it couldn't be saved, it goes back and `hideError` says so.
  const [hideError, setHideError] = useState(false);
  async function setHidden(p: Project, hidden: boolean) {
    const flip = (h: boolean) => setProjects((ps) => ps?.map((x) => (x.id === p.id ? { ...x, hidden: h } : x)) ?? ps);
    flip(hidden);
    const { data, error } = await supabase.from("pages").update({ hidden }).eq("id", p.id).select("id");
    setHideError(!!error || data?.length !== 1);
    if (error || data?.length !== 1) flip(!hidden);
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

  // Delete everything in the trash for good.
  async function emptyTrash() {
    await supabase.from("pages").delete().eq("kind", "board").not("deleted_at", "is", null);
    void load();
  }

  return {
    projects,
    live: projects?.filter((p) => !p.deleted_at) ?? [],
    trash: projects?.filter((p) => p.deleted_at) ?? [],
    remove,
    restore,
    setHidden,
    hideError,
    duplicate,
    emptyTrash,
  };
}
export type Boards = ReturnType<typeof useBoards>;

export const daysLeft = (p: Project) =>
  Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - new Date(p.deleted_at!).getTime()) / DAY_MS));

// The boards in the trash, each with its days left and Restore.
export function TrashList({ boards }: { boards: Boards }) {
  return boards.trash.map((p) => (
    <div key={p.id} data-trashed={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate text-stone-500">{p.title || UNTITLED_BOARD}</span>
      <span className="shrink-0 text-xs text-stone-400">{daysLeft(p)} days left</span>
      <button onClick={() => boards.restore(p)} className="shrink-0 rounded px-2 py-1 text-xs hover:bg-stone-100">
        Restore
      </button>
    </div>
  ));
}

// Every board, as boxes that share out the space they're given (the more
// boards, the smaller each box). Hovering a board shows Remove (to the trash
// for 30 days) and Duplicate. Used by the "Open?" box and the Home page.
// `currentId` is the board open right now, if any; clicking it calls
// `onOpenCurrent` instead of reloading it. `home`: the bare Home look, with
// no dividers, boxes that pop, a blurred picture of each board, its name on
// torn paper in the top right corner, and no trash (that's in Home's menu).
export function BoardList({
  boards,
  currentId,
  onOpenCurrent,
  home = false,
}: {
  boards: Boards;
  currentId?: string;
  onOpenCurrent?: () => void;
  home?: boolean;
}) {
  const { projects, live: all, trash, remove, duplicate, setHidden } = boards;
  // On Home, hidden boards leave the main list for the section under the eye button.
  const live = home ? all.filter((p) => !p.hidden) : all;
  const hidden = home ? all.filter((p) => p.hidden) : [];
  const [showHidden, setShowHidden] = useState(false);
  const router = useRouter();
  const supabase = useMemo(createClient, []);
  // Merge: the board whose "All? / Select?" choice is showing, and the board
  // being merged whole (picking where to).
  const [mergeChoice, setMergeChoice] = useState<string | null>(null);
  const [mergeAll, setMergeAll] = useState<Project | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  // The Home board whose Remove is being confirmed, and its Remove button.
  const [removing, setRemoving] = useState<{ p: Project; el: HTMLElement } | null>(null);
  // The space the board boxes fill.
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current!;
    const observer = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const button = "rounded bg-white px-2 py-1 text-xs shadow-sm hover:bg-stone-100";
  return (
    <>
      {/* On Home the padding leaves room for a box's lift and shadow. */}
      <div
        ref={areaRef}
        className={`overflow-y-auto ${home ? "h-[min(60vh,560px)] flex-none p-8" : "min-h-0 flex-1 px-5 pb-5"}`}
      >
        {projects === null && <p className="text-sm text-stone-400">Loading…</p>}
        {projects !== null && live.length === 0 && (
          <p className="text-sm text-stone-400">{hidden.length ? "Every board is hidden." : "No boards yet."}</p>
        )}
        {(() => {
          // Inside the padding (p-8 = 32px each side; px-5 pb-5 = 20px).
          const { cols, tw, th } = home
            ? tileLayout(live.length, area.w - 64, area.h - 64)
            : tileLayout(live.length, area.w - 40, area.h - 20);
          return (
            <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${tw}px)`, gap: GAP }}>
              {live.map((p) =>
                home ? (
                  <div
                    key={p.id}
                    data-project={p.id}
                    data-pop
                    className="group relative overflow-hidden rounded-2xl bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_20px_rgba(0,0,0,0.12)] active:scale-[0.98]"
                    style={{ height: th }}
                  >
                    <Link href={`/board/${p.id}`} className="absolute inset-0">
                      <BoardPreview data={p.content ?? null} />
                      {/* The name, on a torn scrap of paper in the top right corner. */}
                      <TornPaper seed={p.id}>{p.title || UNTITLED_BOARD}</TornPaper>
                    </Link>
                    <EyeButton hidden={false} onClick={() => setHidden(p, true)} />
                    <div
                      className={`absolute bottom-2 right-2 gap-1 group-hover:flex ${mergeChoice === p.id || removing?.p.id === p.id ? "flex" : "hidden"}`}
                    >
                      <button
                        data-remove
                        onClick={(e) => setRemoving({ p, el: e.currentTarget })}
                        className={`${button} ${removing?.p.id === p.id ? "bg-stone-200" : ""}`}
                      >
                        Remove
                      </button>
                      <button onClick={() => duplicate(p)} className={button}>
                        Duplicate
                      </button>
                      <button
                        onClick={() => setMergeChoice((m) => (m === p.id ? null : p.id))}
                        className={`${button} ${mergeChoice === p.id ? "bg-stone-200" : ""}`}
                      >
                        Merge
                      </button>
                    </div>
                    {mergeChoice === p.id && (
                      // Merge the whole board, or pick parts of it first.
                      <div
                        data-merge-choice
                        className="absolute bottom-11 right-2 flex gap-1 rounded-lg bg-white p-1 shadow-lg"
                      >
                        <button
                          onClick={() => {
                            setMergeChoice(null);
                            setMergeAll(p);
                          }}
                          className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
                        >
                          All?
                        </button>
                        <button
                          onClick={() => router.push(`/board/${p.id}?merge=1`)}
                          className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
                        >
                          Select?
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    key={p.id}
                    data-project={p.id}
                    className={`group relative rounded-xl border-2 bg-stone-50 hover:border-stone-400 ${p.id === currentId ? "border-stone-900" : "border-stone-200"}`}
                    style={{ height: th }}
                  >
                    <Link
                      href={`/board/${p.id}`}
                      onClick={p.id === currentId ? onOpenCurrent : undefined}
                      className="relative flex size-full flex-col items-center justify-center gap-1 overflow-hidden p-3 text-center"
                    >
                      <span className="line-clamp-3 font-medium">{p.title || UNTITLED_BOARD}</span>
                      {p.id === currentId && <span className="text-xs text-stone-400">open now</span>}
                    </Link>
                    <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                      <button onClick={() => remove(p)} className={button}>
                        Remove
                      </button>
                      <button onClick={() => duplicate(p)} className={button}>
                        Duplicate
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          );
        })()}
      </div>

      {!home && trash.length > 0 && (
        <div className="max-h-48 overflow-y-auto border-t border-stone-200 px-3 py-2">
          <button
            onClick={() => setShowTrash((t) => !t)}
            className="px-2 py-1 text-sm text-stone-500 hover:text-stone-900"
          >
            Trash ({trash.length}) {showTrash ? "▾" : "▸"}
          </button>
          {showTrash && <TrashList boards={boards} />}
        </div>
      )}

      <div className={home ? "relative flex justify-center p-4" : "border-t border-stone-200 p-4"}>
        {home && hidden.length > 0 && (
          // Below the rightmost board: shows (or hides) the hidden boards.
          <button
            data-show-hidden
            aria-label={showHidden ? "Close hidden boards" : `Show hidden boards (${hidden.length})`}
            title={showHidden ? "Close hidden boards" : "Hidden boards"}
            onClick={() => setShowHidden((s) => !s)}
            data-pop
            className={`absolute right-8 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition hover:-translate-y-[calc(50%+2px)] active:scale-95 ${showHidden ? "bg-stone-900 text-white" : "bg-white text-stone-600"}`}
          >
            <EyeIcon />
            {hidden.length}
          </button>
        )}
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
      {home && boards.hideError && (
        <p data-hide-error className="px-8 pb-2 text-center text-xs text-red-600">
          Couldn&apos;t save hiding that board. The database may need its latest setup (supabase/schema.sql).
        </p>
      )}
      {home && showHidden && hidden.length > 0 && (
        <div data-hidden-boards className="px-8 pb-4">
          <div className="mb-2 text-xs text-stone-400">Hidden boards</div>
          <div className="flex flex-wrap gap-3">
            {hidden.map((p) => (
              <div
                key={p.id}
                data-hidden-project={p.id}
                data-pop
                className="group relative h-24 w-36 overflow-hidden rounded-xl bg-white opacity-80 shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:opacity-100"
              >
                <Link href={`/board/${p.id}`} className="absolute inset-0">
                  <BoardPreview data={p.content ?? null} />
                  <TornPaper seed={p.id}>{p.title || UNTITLED_BOARD}</TornPaper>
                </Link>
                <EyeButton hidden onClick={() => setHidden(p, false)} />
              </div>
            ))}
          </div>
        </div>
      )}
      {removing && (
        <RemoveConfirm {...removing} onClose={() => setRemoving(null)} onRemove={() => remove(removing.p)} />
      )}
      {mergeAll && (
        <MergeDialog
          source={mergeAll}
          mode="all"
          getContent={async () => {
            const { data } = await supabase.from("pages").select("content").eq("id", mergeAll.id).single();
            return (data?.content as BoardData) ?? null;
          }}
          onClose={() => setMergeAll(null)}
        />
      )}
    </>
  );
}

// Nothing on it yet.
const isNew = (p: Project) => !p.content || Object.values(p.content).every((things) => !things?.length);

// Removing a board from Home asks "Are you sure?" right by its Remove button.
// A board with anything on it also needs its exact name typed first, so the
// wrong one can't go by accident.
function RemoveConfirm({
  p,
  el,
  onClose,
  onRemove,
}: {
  p: Project;
  el: HTMLElement;
  onClose: () => void;
  onRemove: () => void;
}) {
  const name = p.title || UNTITLED_BOARD;
  const needName = !isNew(p);
  const [typed, setTyped] = useState("");
  const ok = !needName || typed === name;
  const go = () => {
    if (!ok) return;
    onClose();
    onRemove();
  };
  return (
    <Popover data-remove-confirm anchor={el} onClose={onClose} className="w-64">
      <p className="text-sm text-stone-800">Are you sure you want to remove &ldquo;{name}&rdquo;?</p>
      {needName && (
        <>
          <p className="mt-2 text-xs text-stone-500">Type the board&apos;s name to remove it.</p>
          <input
            data-remove-name
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder={name}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm outline-none focus:border-stone-500"
          />
        </>
      )}
      <div className="mt-2 flex justify-end gap-1">
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-stone-600 hover:bg-stone-100">
          Cancel
        </button>
        <button
          type="button"
          data-confirm-remove
          disabled={!ok}
          onClick={go}
          className="rounded bg-red-600 px-2 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Remove
        </button>
      </div>
    </Popover>
  );
}

// An eye, crossed out when `off`.
function EyeIcon({ off = false }: { off?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M1.5 8 C3.5 4.5 5.7 3.2 8 3.2 C10.3 3.2 12.5 4.5 14.5 8 C12.5 11.5 10.3 12.8 8 12.8 C5.7 12.8 3.5 11.5 1.5 8 Z" />
      <circle cx="8" cy="8" r="2.2" />
      {off && <path d="M2.5 13.5 L13.5 2.5" />}
    </svg>
  );
}

// The little eye in a board box's top left corner, shown on hover: hides the
// board (or, for a hidden one, puts it back in its spot).
function EyeButton({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  return (
    <button
      data-eye={hidden ? "show" : "hide"}
      aria-label={hidden ? "Show this board again" : "Hide this board"}
      title={hidden ? "Show again" : "Hide"}
      onClick={onClick}
      className="absolute left-2 top-2 hidden size-7 items-center justify-center rounded-full bg-white text-stone-600 shadow-sm hover:bg-stone-100 hover:text-stone-900 group-hover:flex"
    >
      <EyeIcon />
    </button>
  );
}
