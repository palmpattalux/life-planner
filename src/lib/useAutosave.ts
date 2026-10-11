"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Patch = { title?: string; content?: unknown };
export type SaveStatus = "saved" | "saving" | "error";

const DELAY_MS = 600;

// Saves changes to one page a moment after they stop, and straight away when
// leaving the page.
export function useAutosave(pageId: string) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const pending = useRef<Patch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Saves run one after another, so an older save can never land after a
  // newer one and undo it.
  const queue = useRef<Promise<void>>(Promise.resolve());

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    setStatus("saving");
    queue.current = queue.current.then(async () => {
      const { error } = await createClient()
        .from("pages")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", pageId);
      // Newer changes may have come in while saving; they have their own save.
      if (!pending.current) setStatus(error ? "error" : "saved");
    });
  }

  function save(patch: Patch) {
    pending.current = { ...pending.current, ...patch };
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, DELAY_MS);
  }

  useEffect(() => {
    const onLeave = () => flush();
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
};
