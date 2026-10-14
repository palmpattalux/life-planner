"use client";

import { useEffect, useState } from "react";
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

// The settings in Home's menu and the board's side menu: the theme (Light or
// Dark) and the board's shortcut keys (press a key box, then the new key).
export function Settings({ rowClass = "px-3" }: { rowClass?: string }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [showKeys, setShowKeys] = useState(false);
  const [keys, setKeys] = useState<Shortcuts>(DEFAULT_SHORTCUTS);
  // The action whose key box is waiting for a key.
  const [listening, setListening] = useState<Action | null>(null);
  useEffect(() => {
    setThemeState(getTheme());
    setKeys(getShortcuts());
  }, []);

  function changeKeys(next: Shortcuts) {
    setKeys(next);
    saveShortcuts(next);
  }

  return (
    <>
      <div data-theme-picker className={`flex items-center justify-between gap-2 py-1.5 ${rowClass}`}>
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
        className={`flex w-full items-center justify-between py-1.5 text-left hover:bg-stone-100 ${rowClass}`}
      >
        Shortcuts <span className="text-stone-400">{showKeys ? "▾" : "▸"}</span>
      </button>
      {showKeys && (
        <div className={`border-y border-stone-100 py-1.5 ${rowClass}`}>
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
                  // Not a board shortcut while picking the key.
                  e.stopPropagation();
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
            Reset to T, V, B, N, M, F
          </button>
        </div>
      )}
    </>
  );
}
