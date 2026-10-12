"use client";

import { useEffect, useRef, useState } from "react";

// A value loaded from the database and saved back a moment after each
// change, and straight away when leaving the page. Every change is also kept
// in this browser (under `backupKey`) until the database has it, so closing
// the tab before the save finishes loses nothing: it's saved next time.
// It's loaded again when coming back to the tab, unless a change is still
// waiting to be saved. `value` is null until loaded; `failed` when loading
// or saving went wrong.
export function useSaved<T>(backupKey: string, load: () => Promise<T>, save: (value: T) => Promise<void>) {
  const [value, setValue] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fns = useRef({ load, save });
  fns.current = { load, save };
  const key = `unsaved:${backupKey}`;

  const backup = {
    read: (): T | null => {
      try {
        const s = localStorage.getItem(key);
        return s ? (JSON.parse(s) as T) : null;
      } catch {
        return null;
      }
    },
    write: (v: T | null) => {
      try {
        if (v === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(v));
      } catch {}
    },
  };

  // Save what's waiting; resolves once the database has it (or it failed).
  function flush(): Promise<void> {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = pending.current;
    if (v === null) return Promise.resolve();
    pending.current = null;
    return fns.current.save(v).then(
      () => {
        // Only forget the backup if nothing newer came in meanwhile.
        if (pending.current === null) backup.write(null);
        setFailed(false);
      },
      () => {
        // Try again shortly (the backup still has it).
        pending.current ??= v;
        timer.current ??= setTimeout(flush, 5000);
        setFailed(true);
      },
    );
  }

  async function reload() {
    // A change left unsaved last time (the tab closed first) goes in now.
    const left = backup.read();
    if (left !== null && pending.current === null) {
      pending.current = left;
      await flush();
    }
    try {
      const v = await fns.current.load();
      if (pending.current === null) setValue(v);
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    void reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
      else void flush();
    };
    const onLeave = () => void flush();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onLeave);
      void flush();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function change(v: T) {
    setValue(v);
    pending.current = v;
    backup.write(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  }

  // Save what's waiting, then load afresh (for example at midnight).
  async function refresh() {
    await flush();
    await reload();
  }

  return { value, change, failed, refresh };
}
