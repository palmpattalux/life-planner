"use client";

import { useEffect, useRef, useState } from "react";
import { INDENT, TEXT_COLORS, UNCHECKED } from "./constants";
import { domToRuns, runsToDom, scaleSelection, type Run } from "./richText";

// The text typed so far on the caret's line, up to the caret.
function textBeforeCaret(el: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const range = document.createRange();
  range.setStart(el, 0);
  range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  let text = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    else if (node.nodeName === "BR") text += "\n";
    else node.childNodes.forEach(walk);
  };
  walk(range.cloneContents());
  return text.slice(text.lastIndexOf("\n") + 1);
}

// The text being typed. Enter starts a new line; clicking elsewhere confirms it.
// Tab moves the caret's line right and Shift+Tab moves it back. With `lists`,
// Enter on a checklist line starts the next line with a box, and on a numbered
// line with the next number. Enter on a line holding only the box or number
// ends the list. With `initialRuns`, highlighted words can get their own size
// (scroll wheel / trackpad), boldness (Ctrl+B or the B button) and colour from
// a bar that shows above the text while something is highlighted.
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
    // Show the B / colour bar while part of the text is highlighted.
    function onSelectionChange() {
      setHighlight(highlighted() ? { bold: document.queryCommandState("bold") } : null);
    }
    // Scroll wheel / trackpad over highlighted words resizes just those words.
    function onWheel(e: WheelEvent) {
      if (!highlighted()) return;
      e.preventDefault();
      e.stopPropagation();
      scaleSelection(el, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
    }
    document.addEventListener("selectionchange", onSelectionChange);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      el.removeEventListener("wheel", onWheel);
    };
  }, [rich]);

  function format(command: "bold" | "foreColor", value?: string) {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    setHighlight({ bold: document.queryCommandState("bold") });
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
            const marker = /^[☐☑] /.test(line) ? `${UNCHECKED} ` : number ? `${Number(number[1]) + 1}. ` : "";
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
        className="min-w-[1ch] cursor-text whitespace-pre bg-white px-1 outline-none"
        style={{ ...style, userSelect: "text", caretColor: style.color }}
      />
    </div>
  );
}
