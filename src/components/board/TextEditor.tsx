"use client";

import { useEffect, useRef, useState } from "react";
import { INDENT, TEXT_COLORS, TEXT_FILLS, UNCHECKED } from "./constants";
import { ChecklistIcon } from "./icons";
import { BULLET, domToRuns, runsToDom, setListKind, type ListKind, type Run } from "./richText";

// The editor's text from its start up to this point (line breaks as "\n").
function textUpTo(el: HTMLElement, node: Node, offset: number): string {
  const range = document.createRange();
  range.setStart(el, 0);
  range.setEnd(node, offset);
  let text = "";
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
    else if (n.nodeName === "BR") text += "\n";
    else n.childNodes.forEach(walk);
  };
  walk(range.cloneContents());
  return text;
}

// The text typed so far on the caret's line, up to the caret.
function textBeforeCaret(el: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const text = textUpTo(el, sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return text.slice(text.lastIndexOf("\n") + 1);
}

// The place in the editor `n` characters in (line breaks count as one).
function pointAt(el: HTMLElement, n: number): { node: Node; offset: number } {
  let left = n;
  let found: { node: Node; offset: number } | null = null;
  const walk = (node: Node) => {
    if (found) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (left <= len) found = { node, offset: left };
      else left -= len;
    } else if (node.nodeName === "BR") {
      const parent = node.parentNode!;
      const index = Array.prototype.indexOf.call(parent.childNodes, node);
      if (left === 0) found = { node: parent, offset: index };
      else left -= 1;
    } else node.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  return found ?? { node: el, offset: el.childNodes.length };
}

// The text being typed. Enter starts a new line; clicking elsewhere confirms it.
// Tab moves the caret's line right and Shift+Tab moves it back. With `lists`,
// Enter on a checklist line starts the next line with a box, and on a numbered
// line with the next number. Enter on a line holding only the box or number
// ends the list; the same goes for bullet points, which "-" then a space
// starts. With `initialRuns`, a bar shows above the text while something is
// highlighted: bold (or Ctrl+B), colours, background fills, and turning the
// highlighted lines into a numbered list, bullet points or a checklist.
export function TextEditor({
  initial,
  initialRuns,
  style,
  lists = false,
  onConfirm,
}: {
  initial: string;
  initialRuns?: Run[];
  style: React.CSSProperties;
  lists?: boolean;
  onConfirm: (value: string, runs?: Run[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rich = !!initialRuns;
  const [highlight, setHighlight] = useState<{ bold: boolean } | null>(null);

  useEffect(() => {
    const el = ref.current!;
    if (initialRuns) runsToDom(el, initialRuns);
    else el.textContent = initial;
    el.focus({ preventScroll: true });
    // Put the cursor at the end.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // Only on mount: the text is typed into the element directly.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rich) return;
    const el = ref.current!;
    const highlighted = () => {
      const sel = window.getSelection();
      return !!sel && sel.rangeCount > 0 && !sel.isCollapsed && el.contains(sel.getRangeAt(0).commonAncestorContainer);
    };
    // Show the format bar while part of the text is highlighted.
    function onSelectionChange() {
      setHighlight(highlighted() ? { bold: document.queryCommandState("bold") } : null);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [rich]);

  function format(command: "bold" | "foreColor" | "hiliteColor", value?: string) {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    setHighlight({ bold: document.queryCommandState("bold") });
  }

  // Turn the highlighted lines into a list (or back, if they all are one),
  // keeping those lines highlighted.
  function makeList(kind: ListKind) {
    const el = ref.current!;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const lineOf = (node: Node, offset: number) => textUpTo(el, node, offset).split("\n").length - 1;
    const from = lineOf(range.startContainer, range.startOffset);
    const to = lineOf(range.endContainer, range.endOffset);
    const runs = setListKind(domToRuns(el), from, to, kind, UNCHECKED);
    runsToDom(el, runs);
    const lines = runs
      .map((r) => r.text)
      .join("")
      .split("\n");
    const start = lines.slice(0, from).reduce((n, l) => n + l.length + 1, 0);
    const end = lines.slice(0, to + 1).reduce((n, l) => n + l.length + 1, 0) - 1;
    const a = pointAt(el, start);
    const b = pointAt(el, end);
    const kept = document.createRange();
    kept.setStart(a.node, a.offset);
    kept.setEnd(b.node, b.offset);
    sel.removeAllRanges();
    sel.addRange(kept);
  }

  return (
    <div className="relative">
      {highlight && (
        <div
          data-format-bar
          // Keep the highlight: clicking the bar must not take focus from the text.
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-0 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-stone-200 bg-white p-1.5 shadow-lg"
          style={{ bottom: "100%", marginBottom: 8, fontSize: 14, fontWeight: 400, lineHeight: 1 }}
        >
          <button
            aria-label="Bold"
            onClick={() => format("bold")}
            className={`flex size-6 items-center justify-center rounded text-sm font-bold text-stone-900 ${highlight.bold ? "bg-stone-200" : "hover:bg-stone-100"}`}
          >
            B
          </button>
          {TEXT_COLORS.map((color) => (
            <button
              key={color}
              aria-label={`Colour ${color}`}
              onClick={() => format("foreColor", color)}
              className="size-5 rounded-full"
              style={{ background: color }}
            />
          ))}
          <span className="mx-0.5 h-5 w-px bg-stone-200" />
          <button
            aria-label="No fill"
            onClick={() => format("hiliteColor", "transparent")}
            className="size-5 rounded border border-stone-300 bg-[linear-gradient(135deg,transparent_45%,#d6d3d1_45%,#d6d3d1_55%,transparent_55%)]"
          />
          {TEXT_FILLS.map((fill) => (
            <button
              key={fill}
              aria-label={`Fill ${fill}`}
              onClick={() => format("hiliteColor", fill)}
              className="size-5 rounded border border-stone-200"
              style={{ background: fill }}
            />
          ))}
          <span className="mx-0.5 h-5 w-px bg-stone-200" />
          <button
            aria-label="Numbered list"
            onClick={() => makeList("number")}
            className="rounded px-1 text-xs text-stone-900 hover:bg-stone-100"
          >
            1.2.3.
          </button>
          <button
            aria-label="Bullet points"
            onClick={() => makeList("bullet")}
            className="flex size-6 items-center justify-center rounded text-xl leading-none text-stone-900 hover:bg-stone-100"
          >
            {BULLET}
          </button>
          <button
            aria-label="Checklist"
            onClick={() => makeList("check")}
            className="flex size-6 items-center justify-center rounded text-stone-900 hover:bg-stone-100"
          >
            <ChecklistIcon />
          </button>
        </div>
      )}
      <div
        ref={ref}
        data-text-editor
        contentEditable
        suppressContentEditableWarning
        onPointerDown={(e) => e.stopPropagation()}
        onPaste={(e) => {
          // Paste words only, not another page's styling.
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        onKeyDown={(e) => {
          if (rich && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            format("bold");
            return;
          }
          // "-" then a space at the start of a line makes a bullet point.
          if (lists && e.key === " " && textBeforeCaret(e.currentTarget).trimStart() === "-") {
            e.preventDefault();
            document.execCommand("delete");
            document.execCommand("insertText", false, `${BULLET} `);
            return;
          }
          if (e.key === "Tab") {
            e.preventDefault();
            const before = textBeforeCaret(e.currentTarget);
            const sel = window.getSelection()!;
            // Step to the start of the line, add or remove the indent there, then
            // step back to where the caret was.
            const moveCaret = (dir: "backward" | "forward", n: number) => {
              for (let i = 0; i < n; i++) sel.modify("move", dir, "character");
            };
            moveCaret("backward", before.length);
            if (!e.shiftKey) {
              document.execCommand("insertText", false, INDENT);
              moveCaret("forward", before.length);
              return;
            }
            const remove = Math.min(before.match(/^ */)![0].length, INDENT.length);
            for (let i = 0; i < remove; i++) document.execCommand("forwardDelete");
            moveCaret("forward", before.length - remove);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const full = lists ? textBeforeCaret(e.currentTarget) : "";
            const indent = full.match(/^ */)![0];
            const line = full.slice(indent.length);
            const number = line.match(/^(\d+)\. /);
            const marker = /^[☐☑] /.test(line)
              ? `${UNCHECKED} `
              : number
                ? `${Number(number[1]) + 1}. `
                : line.startsWith(`${BULLET} `)
                  ? `${BULLET} `
                  : "";
            if (marker && line === (number ? number[0] : line.slice(0, 2))) {
              // An empty list line: remove its box or number to end the list.
              for (let i = 0; i < line.length; i++) document.execCommand("delete");
              return;
            }
            document.execCommand("insertLineBreak");
            // A list line keeps its indent on the next line.
            if (marker) document.execCommand("insertText", false, indent + marker);
          }
        }}
        onBlur={(e) => {
          if (!rich) return onConfirm(e.currentTarget.innerText);
          const runs = domToRuns(e.currentTarget);
          onConfirm(runs.map((r) => r.text).join(""), runs);
        }}
        className="min-w-[1ch] cursor-text whitespace-pre px-1 outline-none"
        style={{ ...style, userSelect: "text", caretColor: style.color }}
      />
    </div>
  );
}
