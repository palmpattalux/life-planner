// Text where parts can have their own size, boldness and colour.
// A text is stored as runs: pieces of text that share one style. Joined
// together, the runs' text is the whole text. A run's `scale` multiplies the
// text's own font size, so resizing the whole text keeps the parts in step.

export type Run = {
  text: string;
  scale?: number;
  bold?: boolean; // left out: as bold as the whole text
  color?: string; // left out: the whole text's colour
};

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 8;

function sameStyle(a: Run, b: Run) {
  return a.scale === b.scale && a.bold === b.bold && a.color === b.color;
}

export function isPlain(runs: Run[]) {
  return runs.every(
    (r) =>
      r.scale === undefined && r.bold === undefined && r.color === undefined,
  );
}

// Join neighbouring runs with the same style and drop empty ones.
export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

// The runs covering characters `from` to `to` of the joined text.
export function sliceRuns(runs: Run[], from: number, to = Infinity): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const r of runs) {
    const start = Math.max(from, at);
    const end = Math.min(to, at + r.text.length);
    if (end > start)
      out.push({ ...r, text: r.text.slice(start - at, end - at) });
    at += r.text.length;
  }
  return out;
}

// Runs split into lines at each line break.
export function runLines(runs: Run[]): Run[][] {
  const lines: Run[][] = [[]];
  for (const r of runs) {
    r.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...r, text: part });
    });
  }
  return lines;
}

// Fill the editor with the runs: one span per styled run, <br> for new lines.
export function runsToDom(el: HTMLElement, runs: Run[]) {
  el.textContent = "";
  for (const r of runs) {
    const target: HTMLElement =
      r.scale === undefined && r.bold === undefined && r.color === undefined
        ? el
        : el.appendChild(document.createElement("span"));
    if (r.scale !== undefined) target.style.fontSize = `${r.scale}em`;
    if (r.bold !== undefined) target.style.fontWeight = r.bold ? "700" : "400";
    if (r.color !== undefined) target.style.color = r.color;
    r.text.split("\n").forEach((part, i) => {
      if (i > 0) target.appendChild(document.createElement("br"));
      if (part) target.appendChild(document.createTextNode(part));
    });
  }
}

// How much bigger than the editor's own font size a node's text is.
export function scaleOf(node: Node, el: HTMLElement) {
  let scale = 1;
  for (let n = node.parentElement; n && n !== el; n = n.parentElement) {
    if (n.style.fontSize.endsWith("em")) scale *= parseFloat(n.style.fontSize);
  }
  return scale;
}

function styleOf(node: Node, el: HTMLElement): Omit<Run, "text"> {
  let bold: boolean | undefined;
  let color: string | undefined;
  for (let n = node.parentElement; n && n !== el; n = n.parentElement) {
    if (bold === undefined) {
      const w = n.style.fontWeight;
      if (w) bold = w === "bold" || Number(w) >= 600;
      else if (n.tagName === "B" || n.tagName === "STRONG") bold = true;
    }
    if (color === undefined && n.style.color) color = n.style.color;
  }
  const scale = Math.round(scaleOf(node, el) * 1000) / 1000;
  return { scale: scale === 1 ? undefined : scale, bold, color };
}

// Read the editor back into runs.
export function domToRuns(el: HTMLElement): Run[] {
  const runs: Run[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE)
      runs.push({ text: node.textContent ?? "", ...styleOf(node, el) });
    else if (node.nodeName === "BR") runs.push({ text: "\n" });
    else node.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  return mergeRuns(runs);
}

// Make the highlighted part of the editor bigger or smaller by `factor`.
export function scaleSelection(el: HTMLElement, factor: number) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return;

  // Split the text at the ends of the highlight so only the highlighted
  // characters change.
  let {
    startContainer: start,
    startOffset,
    endContainer: end,
    endOffset,
  } = range;
  if (
    end.nodeType === Node.TEXT_NODE &&
    endOffset < (end.textContent ?? "").length
  ) {
    (end as Text).splitText(endOffset);
  }
  if (start.nodeType === Node.TEXT_NODE && startOffset > 0) {
    const rest = (start as Text).splitText(startOffset);
    if (end === start) end = rest;
    start = rest;
    startOffset = 0;
  }

  const nodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const picked = document.createRange();
  picked.setStart(start, startOffset);
  picked.setEnd(
    end,
    end.nodeType === Node.TEXT_NODE
      ? (end.textContent ?? "").length
      : endOffset,
  );
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.textContent && picked.intersectsNode(n)) nodes.push(n as Text);
  }
  if (nodes.length === 0) return;

  for (const n of nodes) {
    const parent = n.parentElement!;
    // A span holding only this text is reused, so repeated steps don't nest.
    const own =
      parent !== el &&
      parent.tagName === "SPAN" &&
      parent.childNodes.length === 1
        ? parent
        : null;
    // The size coming from around the span.
    const outer = scaleOf(own ?? n, el);
    const current = scaleOf(n, el);
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * factor));
    const span = own ?? document.createElement("span");
    if (!own) {
      parent.insertBefore(span, n);
      span.appendChild(n);
    }
    span.style.fontSize = `${next / outer}em`;
  }

  // Keep the same characters highlighted.
  const kept = document.createRange();
  kept.setStart(nodes[0], 0);
  const last = nodes[nodes.length - 1];
  kept.setEnd(last, last.length);
  sel.removeAllRanges();
  sel.addRange(kept);
}
