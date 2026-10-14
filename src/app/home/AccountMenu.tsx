"use client";

import { useState } from "react";
import {
  ACTIONS,
  DEFAULT_SHORTCUTS,
  getShortcuts,
  saveShortcuts,
  withKey,
  type Action,
  type Shortcuts,
} from "@/lib/shortcuts";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { signOut } from "../actions";
import { TrashList, type Boards } from "../BoardList";

// The menu at the top right of Home: the theme (Light or Dark), the board's
// shortcut keys (press a key box, then the new key), the trash
// (restore a board, or Empty trash to delete them all for good) and Log out. Clicking anywhere else
// closes it.
export function AccountMenu({ boards }: { boards: Boards }) {
  const [open, setOpen] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [theme, setThemeState] = useState<Theme>("light");
  const [showKeys, setShowKeys] = useState(false);
  const [keys, setKeys] = useState<Shortcuts>(DEFAULT_SHORTCUTS);
  // The action whose key box is waiting for a key.
  const [listening, setListening] = useState<Action | null>(null);

  function changeKeys(next: Shortcuts) {
    setKeys(next);
    saveShortcuts(next);
  }
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
        onClick={() => {
          setThemeState(getTheme());
          setKeys(getShortcuts());
          setOpen((o) => !o);
        }}
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
            <div data-theme-picker className="flex items-center justify-between gap-2 px-3 py-1.5">
              Theme
              <div className="flex rounded-md bg-stone-100 p-0.5">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    data-theme-choice={t}
                    aria-pressed={theme === t}
                    onClick={() => {
                      setTheme(t);
                      setThemeState(t);
                    }}
                    className={`rounded px-2.5 py-0.5 ${theme === t ? "bg-white font-medium shadow-sm" : "text-stone-500 hover:text-stone-900"}`}
                  >
                    {t === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
            </div>
            <button
              data-shortcuts
              onClick={() => setShowKeys((k) => !k)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-stone-100"
            >
              Shortcuts <span className="text-stone-400">{showKeys ? "▾" : "▸"}</span>
            </button>
            {showKeys && (
              <div className="border-y border-stone-100 px-3 py-1.5">
                {ACTIONS.map(({ action, label }) => (
                  <div key={action} className="flex items-center justify-between py-0.5">
                    <span className="text-stone-600">{label}</span>
                    <button
                      data-shortcut={action}
                      onClick={() => setListening(listening === action ? null : action)}
                      onBlur={() => setListening(null)}
                      onKeyDown={(e) => {
                        if (listening !== action) return;
                        e.preventDefault();
                        if (e.key === "Escape") return setListening(null);
                        // One letter or number.
                        if (!/^[a-z0-9]$/i.test(e.key)) return;
                        changeKeys(withKey(keys, action, e.key.toLowerCase()));
                        setListening(null);
                      }}
                      className={`min-w-14 rounded-md border px-2 py-0.5 text-center font-mono text-xs uppercase ${listening === action ? "border-stone-900 text-stone-400" : "border-stone-300 hover:bg-stone-100"}`}
                    >
                      {listening === action ? "press" : keys[action]}
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => changeKeys(DEFAULT_SHORTCUTS)}
                  className="mt-1 text-xs text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline"
                >
                  Reset to T, V, B, N, M
                </button>
              </div>
            )}
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
