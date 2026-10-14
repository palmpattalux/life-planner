"use client";

import { useState } from "react";
import { Settings } from "@/components/Settings";
import type { Preset } from "./model";

export const SIDE_MENU_W = 256;

// The menu on the right of the board, opened and closed with "m" (or the key chosen in Home's menu).
// "Preset" drops down every saved preset, each with Use, Edit and Delete.
// "Settings" has the theme and the shortcut keys, as in Home's menu.
export function SideMenu({
  presets,
  onUse,
  onEdit,
  onDelete,
}: {
  presets: Preset[];
  onUse: (p: Preset) => void;
  onEdit: (p: Preset) => void;
  onDelete: (p: Preset) => void;
}) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      data-side-menu
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute bottom-0 right-0 top-0 overflow-y-auto border-l border-stone-200 bg-white p-3 shadow-lg"
      style={{ width: SIDE_MENU_W }}
    >
      <button
        onClick={() => setPresetsOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm font-medium hover:bg-stone-100"
      >
        Preset
        <span className="text-stone-400">{presetsOpen ? "▾" : "▸"}</span>
      </button>
      {presetsOpen && (
        <div className="mt-1 flex flex-col gap-1">
          {presets.length === 0 && (
            <p className="px-2 py-1 text-sm text-stone-400">
              No presets yet. Select some things and press Save preset.
            </p>
          )}
          {presets.map((p) => (
            <div key={p.id} data-preset={p.id} className="rounded border border-stone-100 px-2 py-1.5">
              <div className="text-sm">{p.name}</div>
              <div className="mt-1 flex gap-1">
                {(
                  [
                    ["Use", onUse],
                    ["Edit", onEdit],
                    ["Delete", onDelete],
                  ] as const
                ).map(([label, act]) => (
                  <button
                    key={label}
                    onClick={() => act(p)}
                    className="rounded px-2 py-0.5 text-xs text-stone-700 hover:bg-stone-100"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        data-settings
        onClick={() => setSettingsOpen((o) => !o)}
        className="mt-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm font-medium hover:bg-stone-100"
      >
        Settings
        <span className="text-stone-400">{settingsOpen ? "▾" : "▸"}</span>
      </button>
      {settingsOpen && (
        <div className="mt-1 text-sm">
          <Settings rowClass="px-2" />
        </div>
      )}
    </div>
  );
}
