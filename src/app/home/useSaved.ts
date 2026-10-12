"use client";

import { useEffect, useRef, useState } from "react";

// A value loaded from the database and saved back a moment after each
// change (and straight away when leaving the page). It's loaded again when
// coming back to the tab, unless a change is still waiting to be saved.
// `value` is null until loaded; `failed` when loading or saving went wrong.
export function useSaved<T>(load: () => Promise<T>, save: (value: T) => Promise<void>) {
  const [value, setValue] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fns = useRef({ load, save });
  fns.current = { load, save };

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = pending.current;
    if (v === null) return;
    pending.current = null;
    fns.current.save(v).then(
      () => setFailed(false),
      () => setFailed(true),
    );
  }

  useEffect(() => {
    const reload = () =>
      fns.current.load().then(
        (v) => {
          if (pending.current === null) setValue(v);
        },
        () => setFailed(true),
      );
    void reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
      else flush();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  function change(v: T) {
    setValue(v);
    pending.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  }

  return { value, change, failed };
}
