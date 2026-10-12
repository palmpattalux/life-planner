"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { itemCount, mergeInto, mightBeSlow } from "@/components/board/merge";
import { EMPTY_BOARD, type BoardData } from "@/components/board/model";
import { UNTITLED_BOARD } from "@/lib/pages";
import { createClient } from "@/lib/supabase/client";

type Target = { id: string; title: string };
type Ready = { target: Target; merged: BoardData; loadedAt: string; slow: boolean };

// Merging into another board: pick which board, see what will happen (with a
// warning when the result may be slow), then merge and open that board.
// "all": everything on the source board moves over and the source board goes
// to the trash (restorable for 30 days). "select": only the things picked on
// the board move over, and `onMerged` takes them off the source board.
export function MergeDialog({
  source,
  mode,
  getContent,
  onMerged,
  onClose,
}: {
  source: Target;
  mode: "all" | "select";
  getContent: () => Promise<BoardData | null>;
  onMerged?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const supabase = useMemo(createClient, []);
  const router = useRouter();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from("pages")
      .select("id, title")
      .eq("kind", "board")
      .is("parent_id", null)
      .is("deleted_at", null)
      .neq("id", source.id)
      .order("opened_at", { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (error) setError("Couldn't load your boards. Check your connection and try again.");
        setTargets((data ?? []) as Target[]);
      });
  }, [supabase, source.id]);

  // Work out the merged board, so the warning can say whether it may be slow.
  async function choose(target: Target) {
    setBusy(true);
    setError(null);
    try {
      const content = await getContent();
      if (!content || itemCount({ ...EMPTY_BOARD, ...content }) === 0) {
        setError(mode === "all" ? "There's nothing on this board to merge." : "Nothing is selected.");
        return;
      }
      const { data, error } = await supabase.from("pages").select("content, updated_at").eq("id", target.id).single();
      if (error || !data) throw new Error();
      const merged = mergeInto(data.content as BoardData, content);
      setReady({ target, merged, loadedAt: data.updated_at, slow: mightBeSlow(merged) });
    } catch {
      setError("Couldn't get the boards ready to merge. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function merge() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    // Only save if the board hasn't changed since it was read, so nothing on
    // it is lost.
    const { data, error } = await supabase
      .from("pages")
      .update({ content: ready.merged, updated_at: new Date().toISOString() })
      .eq("id", ready.target.id)
      .eq("updated_at", ready.loadedAt)
      .select("id");
    if (error || data.length !== 1) {
      setBusy(false);
      setReady(null);
      setError(
        error
          ? "Couldn't merge. Nothing was changed. Try again."
          : "That board was just changed somewhere else. Nothing was changed: pick it again to merge.",
      );
      return;
    }
    // The things are safely in the other board now; take them off this one.
    if (mode === "all") {
      await supabase.from("pages").update({ deleted_at: new Date().toISOString() }).eq("id", source.id);
    } else await onMerged?.();
    router.push(`/board/${ready.target.id}`);
  }

  const name = (t: Target) => t.title || UNTITLED_BOARD;
  const what = mode === "all" ? `everything on "${name(source)}"` : "the selected things";

  return (
    <div
      data-merge-dialog
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/20 p-4"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        {!ready ? (
          <>
            <h2 className="text-lg font-semibold">Merge into which board?</h2>
            <p className="mt-1 text-sm text-stone-500">
              Moves {what} into the board you pick
              {mode === "all" ? `, then puts "${name(source)}" in the trash (restorable for 30 days).` : "."}
            </p>
            <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
              {targets === null && <p className="text-sm text-stone-400">Loading…</p>}
              {targets?.length === 0 && <p className="text-sm text-stone-400">There are no other boards yet.</p>}
              {targets?.map((t) => (
                <button
                  key={t.id}
                  data-merge-target={t.id}
                  disabled={busy}
                  onClick={() => choose(t)}
                  className="w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100 disabled:opacity-50"
                >
                  {name(t)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Merge into &ldquo;{name(ready.target)}&rdquo;?</h2>
            <p className="mt-1 text-sm text-stone-500">
              {mode === "all"
                ? `Everything on "${name(source)}" moves to the right of what's already there, and "${name(source)}" goes to the trash.`
                : "The selected things move to the right of what's already there and come off this board."}
            </p>
            {ready.slow && (
              <p data-merge-warning className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Board might be slow after this merge: the file is getting huge ({itemCount(ready.merged)} things).
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                disabled={busy}
                onClick={() => setReady(null)}
                className="rounded-full px-4 py-1.5 text-sm hover:bg-stone-100"
              >
                Back
              </button>
              <button
                data-merge-confirm
                disabled={busy}
                onClick={merge}
                className="rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white shadow-md transition active:scale-95 disabled:opacity-50"
              >
                {busy ? "Merging…" : ready.slow ? "Merge anyway" : "Merge"}
              </button>
            </div>
          </>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {!ready && (
          <div className="mt-4 flex justify-end">
            <button disabled={busy} onClick={onClose} className="rounded-full px-4 py-1.5 text-sm hover:bg-stone-100">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
