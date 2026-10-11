"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { BoardList } from "./BoardList";

// The "Open?" box on the right third of the screen, showing every board, so
// it's one click to switch away from the one that opened by itself. Clicking
// anywhere else or the x closes it.
export function OpenPanel({ currentId, onClose }: { currentId: string; onClose: () => void }) {
  useEffect(() => {
    // Opened by itself (from the address): drop "?open=1" so a reload doesn't reopen it.
    if (new URLSearchParams(location.search).has("open")) history.replaceState(null, "", location.pathname);
  }, []);

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
        <BoardList currentId={currentId} onOpenCurrent={onClose} />
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
