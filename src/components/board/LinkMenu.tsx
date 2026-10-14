"use client";

import { useState } from "react";
import { ChainIcon } from "./icons";

// Where a text on the board can be added as a task.
// "priority": Home's Priority tasks, with a deadline (from a timeline's
// "Priority task").
export type AddTarget =
  { kind: "today" } | { kind: "phase" } | { kind: "page"; id: string } | { kind: "priority"; deadline: string };
export type TaskPage = { id: string; title: string };

// The text box's "Link". Hovering it shows "Add to"; hovering that pops up
// "Today's to-do list" and "Phase goal". Clicking one adds the text there as
// a task. Hovering "Phase goal" lists the phase goal's task pages: clicking
// one adds the text to that page as a task. On a phone, tapping opens each
// step instead of hovering (the arrow beside "Phase goal" opens its pages).
export function LinkMenu({
  onAdd,
  taskPages,
}: {
  onAdd: (to: AddTarget) => Promise<void>;
  taskPages: () => Promise<TaskPage[]>;
}) {
  // 1: "Add to" shows; 2: its two choices; 3: the phase goal's pages too.
  const [level, setLevel] = useState(0);
  const [pages, setPages] = useState<TaskPage[] | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const open = (n: number) => {
    setLevel((l) => Math.max(l, n));
    if (n === 3 && pages === null)
      void taskPages()
        .then(setPages)
        .catch(() => setPages([]));
  };
  async function add(to: AddTarget, label: string) {
    try {
      await onAdd(to);
      setDone(`Added to ${label}`);
    } catch {
      setDone("Couldn't add it. Try again.");
    }
    setLevel(0);
    setTimeout(() => setDone(null), 1600);
  }

  const row = "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm whitespace-nowrap";
  // The space between the boxes is padding, so moving across it keeps them open.
  const flyout = "absolute left-full top-0 z-10 pl-1";
  const box = "rounded-lg border border-stone-200 bg-white p-1 shadow-lg";
  const choice =
    "animate-pop w-full whitespace-nowrap rounded-md bg-stone-900 px-3 py-1.5 text-left text-sm font-medium text-white shadow-md transition hover:scale-105 active:scale-95";
  return (
    <div data-link-menu className="relative" onMouseLeave={() => setLevel(0)}>
      <button
        aria-label="Link"
        onMouseEnter={() => open(1)}
        onClick={() => (level ? setLevel(0) : open(1))}
        className={`${row} ${level ? "bg-stone-100" : "hover:bg-stone-100"}`}
      >
        <ChainIcon />
        {done}
      </button>
      {level >= 1 && (
        <div className={flyout}>
          <div className={`${box} relative`}>
            <button
              data-add-to
              onMouseEnter={() => open(2)}
              onClick={() => open(2)}
              className={`${row} ${level >= 2 ? "bg-stone-100" : "hover:bg-stone-100"}`}
            >
              Add to
              <span className="ml-auto pl-3 text-stone-400">›</span>
            </button>
            {level >= 2 && (
              <div className={flyout}>
                <div className={`${box} flex w-48 flex-col gap-1`}>
                  <button
                    data-add-today
                    onMouseEnter={() => setLevel(2)}
                    onClick={() => add({ kind: "today" }, "today's to-do")}
                    className={choice}
                  >
                    Today&apos;s to-do
                  </button>
                  <div className="relative flex gap-1" onMouseEnter={() => open(3)}>
                    <button
                      data-add-phase
                      onClick={() => add({ kind: "phase" }, "milestone")}
                      className={choice}
                      style={{ animationDelay: "60ms" }}
                    >
                      Milestone
                    </button>
                    <button
                      aria-label="Milestone pages"
                      onClick={() => open(3)}
                      className="animate-pop rounded-md px-2 text-stone-500 hover:bg-stone-100"
                      style={{ animationDelay: "60ms" }}
                    >
                      ›
                    </button>
                    {level >= 3 && (
                      <div className={`${flyout} -top-1`}>
                        <div data-task-pages className={`${box} w-52`}>
                          <div className="px-2 py-1 text-xs text-stone-400">Add to a milestone page</div>
                          {pages === null && <div className="px-2 py-1 text-sm text-stone-400">Loading…</div>}
                          {pages?.length === 0 && (
                            <div className="px-2 py-1 text-sm text-stone-400">
                              No pages yet. Open a milestone task&apos;s arrow on Home to make one.
                            </div>
                          )}
                          {pages?.map((p) => (
                            <button
                              key={p.id}
                              data-task-page={p.id}
                              onClick={() => add({ kind: "page", id: p.id }, `"${p.title}"`)}
                              className="animate-pop w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-stone-100"
                            >
                              {p.title || "Untitled task"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
