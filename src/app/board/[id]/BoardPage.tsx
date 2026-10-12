"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Board, type BoardApi, type Planner } from "@/components/board/Board";
import { fullBoard, type BoardData, type Preset } from "@/components/board/model";
import {
  addPhaseTask,
  addTaskToPage,
  addToToday,
  linkStates,
  phaseTaskPages,
  setLinkDone,
  uploadPicture,
} from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { statusText, useAutosave } from "@/lib/useAutosave";
import { MergeDialog } from "../../MergeDialog";
import { OpenPanel, useMarkOpened } from "../../OpenPanel";

// A saved board: the whiteboard, saved as you go, with a way back Home.
export function BoardPage({
  id,
  title: initialTitle,
  showOpen = false,
  isNew = false,
  mergeMode = false,
  loadedAt,
  initial,
  presets: initialPresets,
}: {
  id: string;
  title: string;
  showOpen?: boolean;
  // Just made: the cursor starts in the name box, ready to type.
  isNew?: boolean;
  // Opened from Merge's "Select?": pick what to merge, then Continue.
  mergeMode?: boolean;
  loadedAt: string;
  initial: BoardData;
  presets: Preset[];
}) {
  const { save, saveNow, status } = useAutosave(id, loadedAt);
  const board = useRef<BoardApi>(null);
  const [selecting, setSelecting] = useState(mergeMode);
  const [selectedCount, setSelectedCount] = useState(0);
  const [pickTarget, setPickTarget] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [presets, setPresets] = useState(initialPresets);
  const supabase = useMemo(createClient, []);
  const [openPanel, setOpenPanel] = useState(showOpen);
  useMarkOpened(id);
  useEffect(() => {
    // Drop "?new=1" so a reload doesn't count as new.
    if (isNew || mergeMode) history.replaceState(null, "", location.pathname);
  }, [isNew, mergeMode]);

  // Texts added as tasks on Home: tick them to match their tasks when the
  // board opens and whenever this tab is come back to.
  const linksRef = useRef<string[]>([]);
  useEffect(() => {
    linksRef.current = fullBoard(initial).texts.flatMap((t) => (t.link ? [t.link] : []));
    async function sync() {
      const states = await linkStates(supabase, linksRef.current);
      states.forEach((done, link) => board.current?.setLinkDone(link, done));
    }
    void sync();
    const onVisible = () => document.visibilityState === "visible" && void sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const planner: Planner = {
    add: async (to, task) => {
      if (!linksRef.current.includes(task.link)) linksRef.current.push(task.link);
      if (to.kind === "today") await addToToday(supabase, task);
      else if (to.kind === "phase") await addPhaseTask(supabase, task);
      else await addTaskToPage(supabase, to.id, task);
    },
    taskPages: () => phaseTaskPages(supabase),
    onCheck: (link, done) => void setLinkDone(supabase, link, done).catch(() => {}),
  };

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
        initial={fullBoard(initial)}
        onChange={(content) => save({ content })}
        presets={presets}
        onSavePreset={savePreset}
        onUpdatePreset={updatePreset}
        onDeletePreset={deletePreset}
        api={board}
        onSelectionChange={setSelectedCount}
        planner={planner}
        onUploadPicture={(file) => uploadPicture(supabase, file)}
      />
      {selecting && (
        <>
          {/* Choosing what to merge: a coloured edge round the screen and a bar at the top. */}
          <div
            data-merge-select
            className="pointer-events-none fixed inset-0 z-10 shadow-[inset_0_0_0_4px_rgba(59,130,246,0.6)]"
          />
          <div className="fixed left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-stone-900 py-1.5 pl-4 pr-1.5 text-sm text-white shadow-lg">
            <span>
              {selectedCount ? `${selectedCount} selected to merge` : "Select what to merge, then press Continue"}
            </span>
            <button onClick={() => setSelecting(false)} className="rounded-full px-3 py-1 hover:bg-white/10">
              Cancel
            </button>
            <button
              data-merge-continue
              disabled={selectedCount === 0}
              onClick={() => setPickTarget(true)}
              className="rounded-full bg-white px-3 py-1 font-medium text-stone-900 disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </>
      )}
      {pickTarget && (
        <MergeDialog
          source={{ id, title }}
          mode="select"
          getContent={async () => board.current?.selected() ?? null}
          onMerged={async () => {
            // Save this board without the moved things before leaving it.
            const rest = board.current?.removeSelected();
            if (rest) await saveNow({ content: rest });
          }}
          onClose={() => setPickTarget(false)}
        />
      )}
      <div className="fixed left-4 top-4 flex items-center gap-2 rounded-md border border-stone-200 bg-white px-2 py-1 text-sm shadow">
        <Link href="/home" className="rounded px-1.5 py-0.5 font-medium hover:bg-stone-100">
          Home
        </Link>
        <input
          value={title}
          placeholder="Untitled board"
          autoFocus={isNew}
          onChange={(e) => {
            setTitle(e.target.value);
            save({ title: e.target.value });
          }}
          // Enter finishes the name and goes back to the board.
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-44 rounded px-1.5 py-0.5 outline-none focus:bg-stone-100"
        />
        <span
          className={`text-xs ${status === "error" || status === "conflict" ? "font-medium text-red-600" : "text-stone-400"}`}
        >
          {statusText[status]}
        </span>
      </div>
      {openPanel && <OpenPanel currentId={id} onClose={() => setOpenPanel(false)} />}
    </>
  );
}
