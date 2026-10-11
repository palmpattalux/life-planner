"use client";

import { useMemo, useState } from "react";
import { Board } from "@/components/board/Board";
import { EMPTY_BOARD, type BoardData, type Preset } from "@/components/board/model";
import { createClient } from "@/lib/supabase/client";
import { statusText, useAutosave } from "@/lib/useAutosave";
import { OpenPanel, useMarkOpened } from "../../OpenPanel";

// A saved board: the whiteboard, saved as you go, with a way back Home.
export function BoardPage({
  id,
  title: initialTitle,
  showOpen = false,
  initial,
  presets: initialPresets,
}: {
  id: string;
  title: string;
  showOpen?: boolean;
  initial: BoardData;
  presets: Preset[];
}) {
  const { save, status } = useAutosave(id);
  const [title, setTitle] = useState(initialTitle);
  const [presets, setPresets] = useState(initialPresets);
  const supabase = useMemo(createClient, []);
  const [openPanel, setOpenPanel] = useState(showOpen);
  useMarkOpened(id);

  async function savePreset(data: BoardData) {
    // Named Preset 1, Preset 2, ... after the highest number so far.
    const n = Math.max(0, ...presets.map((p) => Number(p.name.match(/^Preset (\d+)$/)?.[1] ?? 0))) + 1;
    const { data: row } = await supabase
      .from("presets")
      .insert({ name: `Preset ${n}`, content: data })
      .select("id, name")
      .single();
    if (row) setPresets((ps) => [...ps, { id: row.id, name: row.name, data }]);
  }

  async function updatePreset(presetId: string, data: BoardData) {
    setPresets((ps) => ps.map((p) => (p.id === presetId ? { ...p, data } : p)));
    await supabase.from("presets").update({ content: data }).eq("id", presetId);
  }

  async function deletePreset(presetId: string) {
    setPresets((ps) => ps.filter((p) => p.id !== presetId));
    await supabase.from("presets").delete().eq("id", presetId);
  }

  return (
    <>
      <Board
        initial={{ ...EMPTY_BOARD, ...initial }}
        onChange={(content) => save({ content })}
        presets={presets}
        onSavePreset={savePreset}
        onUpdatePreset={updatePreset}
        onDeletePreset={deletePreset}
      />
      <div className="fixed left-4 top-4 flex items-center gap-2 rounded-md border border-stone-200 bg-white px-2 py-1 text-sm shadow">
        <button onClick={() => setOpenPanel(true)} className="rounded px-1.5 py-0.5 font-medium hover:bg-stone-100">
          Projects
        </button>
        <input
          value={title}
          placeholder="Untitled board"
          onChange={(e) => {
            setTitle(e.target.value);
            save({ title: e.target.value });
          }}
          className="w-44 rounded px-1.5 py-0.5 outline-none focus:bg-stone-100"
        />
        <span className="text-xs text-stone-400">{statusText[status]}</span>
      </div>
      {openPanel && <OpenPanel currentId={id} onClose={() => setOpenPanel(false)} />}
    </>
  );
}
