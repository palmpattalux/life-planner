"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Patch = { title?: string; content?: unknown };
// "conflict": the page was saved from somewhere else (another tab or device)
// after this copy was loaded, so saving now would wipe out that newer work.
export type SaveStatus = "saved" | "saving" | "error" | "conflict";

const DELAY_MS = 600;
const RETRY_MS = 5000;

// Saves changes to one page a moment after they stop, and straight away when
// leaving the page.
//
// `loadedAt` is the page's updated_at when it was loaded. A save only goes
// through if the page hasn't been saved since (from another tab, an older
// copy of the page, another device); otherwise nothing is overwritten and the
// status says to reload. A save that changes nothing (for example when the
// login has run out) shows as failed rather than "Saved".
export function useAutosave(pageId: string, loadedAt: string) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const pending = useRef<Patch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The page's updated_at as of this copy's last successful save.
  const lastSaved = useRef(loadedAt);
  const conflict = useRef(false);
  const inFlight = useRef(0);

  // Saves run one after another, so an older save can never land after a
  // newer one and undo it.
  const queue = useRef<Promise<void>>(Promise.resolve());

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!patch || conflict.current) return;
    pending.current = null;
    setStatus("saving");
    inFlight.current++;
    queue.current = queue.current.then(async () => {
      let next: SaveStatus;
      try {
        const updatedAt = new Date().toISOString();
        const { data, error } = await createClient()
          .from("pages")
          .update({ ...patch, updated_at: updatedAt })
          .eq("id", pageId)
          .eq("updated_at", lastSaved.current)
          .select("updated_at");
        if (error) next = "error";
        else if (data.length === 1) {
          lastSaved.current = data[0].updated_at;
          next = "saved";
        } else {
          next = await whyNothingSaved();
        }
      } catch {
        next = "error";
      }
      inFlight.current--;
      if (next === "conflict") conflict.current = true;
      if (next === "error") {
        // Keep the changes and try again shortly.
        pending.current = { ...patch, ...pending.current };
        if (!timer.current) timer.current = setTimeout(flush, RETRY_MS);
      }
      if (!pending.current || next !== "saved") setStatus(next);
    });
  }

  // Nothing was updated: either the page was saved from elsewhere since this
  // copy loaded (a conflict), or this browser can't reach it (logged out).
  async function whyNothingSaved(): Promise<SaveStatus> {
    const { data } = await createClient().from("pages").select("updated_at").eq("id", pageId).maybeSingle();
    return data && data.updated_at !== lastSaved.current ? "conflict" : "error";
  }

  function save(patch: Patch) {
    pending.current = { ...pending.current, ...patch };
    if (conflict.current) return;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, DELAY_MS);
  }

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      const unsaved = !!pending.current || inFlight.current > 0;
      flush();
      // Ask before closing while changes are still on their way.
      if (unsaved) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      flush();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { save, status };
}

export const statusText: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  error: "Couldn't save",
  conflict: "Changed in another tab: reload to see the latest",
};
