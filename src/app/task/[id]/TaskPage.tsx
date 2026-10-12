"use client";

import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { addToToday, linkStates, setLinkDone } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { statusText, useAutosave } from "@/lib/useAutosave";

// Checklist lines can be linked to a board text (added there with Link >
// Add to): ticking one ticks the other.
const LinkedTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      link: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute("data-link"),
        renderHTML: (attrs) => (attrs.link ? { "data-link": attrs.link } : {}),
      },
    };
  },
});

// Every linked checklist line's tick, by link.
function linkedTicks(editor: Editor) {
  const ticks = new Map<string, boolean>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === "taskItem" && node.attrs.link) ticks.set(node.attrs.link, node.attrs.checked);
  });
  return ticks;
}

// A phase goal task's page: a title and plain notes (headings, bold,
// italic, underline, strikethrough, highlight, lists, checklists, quotes,
// dividers and links), saved as you go.
export function TaskPage({
  id,
  title: initialTitle,
  content,
  loadedAt,
}: {
  id: string;
  title: string;
  content: unknown;
  loadedAt: string;
}) {
  const supabase = useMemo(createClient, []);
  const { save, status } = useAutosave(id, loadedAt);
  const [title, setTitle] = useState(initialTitle);
  // The linked lines' ticks as last seen, to tell when one is ticked here.
  const ticks = useRef(new Map<string, boolean>());

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Highlight,
      TaskList,
      LinkedTaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Write notes, or type [ ] for a checklist…" }),
    ],
    content: (content as JSONContent)?.type === "doc" ? (content as JSONContent) : "",
    editorProps: { attributes: { class: "note min-h-[50vh] outline-none" } },
    onUpdate: ({ editor }) => {
      save({ content: editor.getJSON() });
      const now = linkedTicks(editor);
      now.forEach((done, link) => {
        if (ticks.current.has(link) && ticks.current.get(link) !== done)
          void setLinkDone(supabase, link, done).catch(() => {});
      });
      ticks.current = now;
    },
  });

  // Tick linked lines to match their board texts when the page opens.
  useEffect(() => {
    if (!editor) return;
    ticks.current = linkedTicks(editor);
    void linkStates(supabase, [...ticks.current.keys()]).then((states) => {
      if (editor.isDestroyed) return;
      const tr = editor.state.tr;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== "taskItem" || !node.attrs.link) return;
        const done = states.get(node.attrs.link);
        if (done !== undefined && done !== node.attrs.checked)
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: done });
      });
      if (!tr.docChanged) return;
      states.forEach((done, link) => ticks.current.set(link, done));
      editor.view.dispatch(tr.setMeta("addToHistory", false));
    });
  }, [editor, supabase]);

  // The checklist line under the mouse (or, on a phone, the one being typed
  // in), with "Add to today's to-do?" beside it.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ li: HTMLElement; top: number } | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  function showFor(li: HTMLElement | null) {
    if (!li || !wrapRef.current) return setHover(null);
    if (hover?.li === li) return;
    setAdded(null);
    setHover({ li, top: li.getBoundingClientRect().top - wrapRef.current.getBoundingClientRect().top });
  }
  useEffect(() => {
    if (!editor) return;
    const onSelect = () => {
      const { node } = editor.view.domAtPos(editor.state.selection.from);
      const el = node instanceof HTMLElement ? node : node.parentElement;
      if (editor.isFocused) showFor(el?.closest<HTMLElement>('ul[data-type="taskList"] > li') ?? null);
    };
    editor.on("selectionUpdate", onSelect);
    return () => {
      editor.off("selectionUpdate", onSelect);
    };
  });

  // Add the hovered checklist line to today's to-do list, linked so ticking
  // either one ticks the other.
  async function addHoveredToToday() {
    if (!editor || !hover || !wrapRef.current) return;
    // (The editor may have redrawn the line since, so find it again by where it is.)
    const wrapTop = wrapRef.current.getBoundingClientRect().top;
    const li = [...wrapRef.current.querySelectorAll<HTMLElement>('ul[data-type="taskList"] > li')]
      .reverse()
      .find((el) => Math.abs(el.getBoundingClientRect().top - wrapTop - hover.top) < 2);
    // The checklist line whose element is the hovered one.
    let pos = -1;
    editor.state.doc.descendants((node, at) => {
      if (pos === -1 && node.type.name === "taskItem" && editor.view.nodeDOM(at) === li) pos = at;
    });
    const item = pos === -1 ? null : editor.state.doc.nodeAt(pos);
    if (!item) return;
    const text = item.firstChild?.textContent.trim() ?? "";
    if (!text) return;
    let link: string = item.attrs.link;
    if (!link) {
      link = crypto.randomUUID();
      ticks.current.set(link, item.attrs.checked);
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...item.attrs, link }));
    }
    try {
      await addToToday(supabase, { text, link, done: item.attrs.checked });
      setAdded("Added to today's to-do");
    } catch {
      setAdded("Couldn't add it. Try again.");
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 pb-24">
      <div className="sticky top-0 z-10 -mx-5 bg-background/95 px-5 pb-2 pt-4 backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/home" className="rounded px-1.5 py-0.5 font-medium hover:bg-stone-200/60">
            Home
          </Link>
          <span
            className={`text-xs ${status === "error" || status === "conflict" ? "font-medium text-red-600" : "text-stone-400"}`}
          >
            {statusText[status]}
          </span>
        </div>
        {editor && <Toolbar editor={editor} />}
      </div>
      <input
        data-task-title
        value={title}
        placeholder="Untitled task"
        onChange={(e) => {
          setTitle(e.target.value);
          save({ title: e.target.value });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            editor?.commands.focus("start");
          }
        }}
        className="mt-6 w-full bg-transparent text-3xl font-bold outline-none placeholder:text-stone-300"
      />
      <div
        ref={wrapRef}
        className="relative mt-4"
        onMouseMove={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("[data-add-today-pop]")) return;
          showFor(t.closest<HTMLElement>('ul[data-type="taskList"] > li'));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <EditorContent editor={editor} />
        {hover && (
          <button
            key={hover.top}
            type="button"
            data-add-today-pop
            // On press, so the line being typed in keeps its caret.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void addHoveredToToday()}
            className="animate-pop absolute right-0 rounded-full bg-stone-900 px-3 py-1 text-xs font-medium whitespace-nowrap text-white shadow-md transition hover:scale-105 active:scale-95"
            style={{ top: hover.top }}
          >
            {added ?? "Add to today's to-do?"}
          </button>
        )}
      </div>
    </main>
  );
}

// The formatting buttons along the top.
function Toolbar({ editor }: { editor: Editor }) {
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
      bullet: e.isActive("bulletList"),
      number: e.isActive("orderedList"),
      check: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const buttons: [string, string, boolean, () => void, string?][] = [
    ["H1", "Heading", on.h1, () => chain().toggleHeading({ level: 1 }).run(), "font-bold"],
    ["H2", "Subheading", on.h2, () => chain().toggleHeading({ level: 2 }).run(), "font-semibold"],
    ["B", "Bold", on.bold, () => chain().toggleBold().run(), "font-bold"],
    ["I", "Italic", on.italic, () => chain().toggleItalic().run(), "italic"],
    ["U", "Underline", on.underline, () => chain().toggleUnderline().run(), "underline"],
    ["S", "Strikethrough", on.strike, () => chain().toggleStrike().run(), "line-through"],
    ["Highlight", "Highlight", on.highlight, () => chain().toggleHighlight().run(), "bg-yellow-200 px-1"],
    ["•", "Bullet points", on.bullet, () => chain().toggleBulletList().run()],
    ["1.", "Numbered list", on.number, () => chain().toggleOrderedList().run()],
    ["☑", "Checklist", on.check, () => chain().toggleTaskList().run()],
    ["❝", "Quote", on.quote, () => chain().toggleBlockquote().run()],
    ["—", "Divider", false, () => chain().setHorizontalRule().run()],
    [
      "Link",
      "Link",
      on.link,
      () => {
        if (on.link) return chain().unsetLink().run();
        const url = window.prompt("Link to (web address)");
        if (url)
          chain()
            .setLink({ href: /^[a-z]+:/i.test(url) ? url : `https://${url}` })
            .run();
      },
      "underline",
    ],
  ];
  return (
    <div data-note-toolbar className="mt-2 flex flex-wrap items-center gap-0.5">
      {buttons.map(([label, name, active, run, style]) => (
        <button
          key={name}
          type="button"
          aria-label={name}
          title={name}
          aria-pressed={active}
          onMouseDown={(e) => e.preventDefault()}
          onClick={run}
          className={`min-w-8 rounded px-2 py-1 text-sm ${active ? "bg-stone-900 text-white" : "hover:bg-stone-200/60"}`}
        >
          <span className={active ? undefined : style}>{label}</span>
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-stone-300" />
      <button
        type="button"
        aria-label="Undo"
        title="Undo"
        disabled={!on.undo}
        onClick={() => chain().undo().run()}
        className="rounded px-2 py-1 text-sm hover:bg-stone-200/60 disabled:opacity-30"
      >
        ↶
      </button>
      <button
        type="button"
        aria-label="Redo"
        title="Redo"
        disabled={!on.redo}
        onClick={() => chain().redo().run()}
        className="rounded px-2 py-1 text-sm hover:bg-stone-200/60 disabled:opacity-30"
      >
        ↷
      </button>
    </div>
  );
}
