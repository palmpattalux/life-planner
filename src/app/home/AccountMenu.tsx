"use client";

import { useState } from "react";
import { signOut } from "../actions";
import { TrashList, type Boards } from "../BoardList";

// The menu at the top right of Home: the trash (restore a board, or Empty
// trash to delete them all for good) and Log out. Clicking anywhere else
// closes it.
export function AccountMenu({ boards }: { boards: Boards }) {
  const [open, setOpen] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const { trash } = boards;

  function emptyTrash() {
    const n = trash.length;
    if (!window.confirm(`Delete ${n} board${n === 1 ? "" : "s"} in the trash for good? This can't be undone.`)) return;
    void boards.emptyTrash();
  }

  return (
    <div className="relative">
      <button
        aria-label="Menu"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md px-2.5 py-1 text-lg leading-none hover:bg-stone-100"
      >
        ☰
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onPointerDown={() => setOpen(false)} />
          <div
            data-account-menu
            className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border border-stone-200 bg-white py-1 text-sm shadow-lg"
          >
            <button
              onClick={() => setShowTrash((t) => !t)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-stone-100"
            >
              Trash ({trash.length}) <span className="text-stone-400">{showTrash ? "▾" : "▸"}</span>
            </button>
            {showTrash && (
              <div className="max-h-64 overflow-y-auto border-y border-stone-100 px-1 py-1">
                {trash.length === 0 ? (
                  <p className="px-2 py-1.5 text-stone-400">The trash is empty.</p>
                ) : (
                  <>
                    <TrashList boards={boards} />
                    <button
                      onClick={emptyTrash}
                      className="mt-1 w-full rounded px-2 py-1.5 text-left font-medium text-red-600 hover:bg-red-50"
                    >
                      Empty trash
                    </button>
                  </>
                )}
              </div>
            )}
            <form action={signOut}>
              <button className="w-full px-3 py-1.5 text-left hover:bg-stone-100">Log out</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
