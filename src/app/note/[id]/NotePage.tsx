"use client";

import Link from "next/link";
import { useState } from "react";
import { untitled, type PageKind } from "@/lib/pages";
import { statusText, useAutosave } from "@/lib/useAutosave";
import { createPage } from "../../actions";
import { OpenPanel, useMarkOpened } from "../../OpenPanel";

// A note: a title, the note itself, and pages inside it. Saved as you type.
export function NotePage({
  id,
  parentId,
  showOpen = false,
  title: initialTitle,
  body: initialBody,
  pages,
}: {
  id: string;
  parentId: string | null;
  showOpen?: boolean;
  title: string;
  body: string;
  pages: { id: string; kind: PageKind; title: string }[];
}) {
  const { save, status } = useAutosave(id);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [openPanel, setOpenPanel] = useState(showOpen);
  useMarkOpened(id);

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="flex items-center justify-between text-sm">
        <div className="flex gap-3">
          <button onClick={() => setOpenPanel(true)} className="font-medium text-stone-700 hover:text-stone-900">
            Projects
          </button>
          {parentId && (
            <Link href={`/note/${parentId}`} className="text-stone-500 hover:text-stone-900">
              ← Back
            </Link>
          )}
        </div>
        <span className="text-xs text-stone-400">{statusText[status]}</span>
      </div>

      <input
        value={title}
        placeholder="Untitled note"
        onChange={(e) => {
          setTitle(e.target.value);
          save({ title: e.target.value });
        }}
        className="mt-6 w-full text-3xl font-semibold outline-none placeholder:text-stone-300"
      />

      <textarea
        value={body}
        placeholder="Write something…"
        onChange={(e) => {
          setBody(e.target.value);
          save({ content: { body: e.target.value } });
        }}
        className="mt-4 min-h-[40vh] w-full resize-none leading-relaxed outline-none placeholder:text-stone-300"
      />

      <div className="mt-8 border-t border-stone-200 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-stone-500">Pages</h2>
          <form action={createPage.bind(null, "note", id)}>
            <button className="rounded px-2 py-1 text-sm hover:bg-stone-100">+ Add page</button>
          </form>
        </div>
        <div className="mt-2 flex flex-col">
          {pages.map((p) => (
            <Link key={p.id} href={`/${p.kind}/${p.id}`} className="rounded px-2 py-1.5 hover:bg-stone-100">
              📄 {p.title || untitled(p.kind)}
            </Link>
          ))}
        </div>
      </div>
      {openPanel && <OpenPanel currentId={id} onClose={() => setOpenPanel(false)} />}
    </main>
  );
}
