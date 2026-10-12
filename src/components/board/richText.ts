// Text where parts can have their own boldness, colour and background.
// A text is stored as runs: pieces of text that share one style. Joined
// together, the runs' text is the whole text. (`scale`, a part with its own
// size, is only kept for texts made before that was removed: a different size
// now means another text.)

export type Run = {
  text: string;
  scale?: number;
  bold?: boolean; // left out: as bold as the whole text
  color?: string; // left out: the whole text's colour
  bg?: string; // background fill; left out: the whole text's (usually none)
};

function sameStyle(a: Run, b: Run) {
  return a.scale === b.scale && a.bold === b.bold && a.color === b.color && a.bg === b.bg;
}

const plain = (r: Run) => r.scale === undefined && r.bold === undefined && r.color === undefined && r.bg === undefined;

export function isPlain(runs: Run[]) {
  return runs.every(plain);
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
    if (end > start) out.push({ ...r, text: r.text.slice(start - at, end - at) });
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
    const target: HTMLElement = plain(r) ? el : el.appendChild(document.createElement("span"));
    if (r.scale !== undefined) target.style.fontSize = `${r.scale}em`;
    if (r.bold !== undefined) target.style.fontWeight = r.bold ? "700" : "400";
    if (r.color !== undefined) target.style.color = r.color;
    if (r.bg !== undefined) target.style.backgroundColor = r.bg;
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
  let bg: string | undefined;
  for (let n = node.parentElement; n && n !== el; n = n.parentElement) {
    if (bold === undefined) {
      const w = n.style.fontWeight;
      if (w) bold = w === "bold" || Number(w) >= 600;
      else if (n.tagName === "B" || n.tagName === "STRONG") bold = true;
    }
    if (color === undefined && n.style.color) color = n.style.color;
    if (bg === undefined && n.style.backgroundColor) bg = n.style.backgroundColor;
  }
  const scale = Math.round(scaleOf(node, el) * 1000) / 1000;
  return { scale: scale === 1 ? undefined : scale, bold, color, bg: bg === "transparent" ? undefined : bg };
}

// Read the editor back into runs.
export function domToRuns(el: HTMLElement): Run[] {
  const runs: Run[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) runs.push({ text: node.textContent ?? "", ...styleOf(node, el) });
    else if (node.nodeName === "BR") runs.push({ text: "\n" });
    else node.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  return mergeRuns(runs);
}

// List markers a text line can start with (after its indent).
export type ListKind = "number" | "bullet" | "check";
export const BULLET = "•";
const MARKER = /^(\d+\. |[☐☑] |• )/;
const kindOf = (line: string): ListKind | null =>
  /^\d+\. /.test(line) ? "number" : /^[☐☑] /.test(line) ? "check" : line.startsWith(`${BULLET} `) ? "bullet" : null;

// Turn lines `from` to `to` (inclusive) into a numbered list, bullet points
// or a checklist, replacing any marker they had. If they all already are
// that kind of list, the markers come off instead.
export function setListKind(runs: Run[], from: number, to: number, kind: ListKind, unchecked: string): Run[] {
  const lines = runLines(runs);
  const texts = lines.map((l) => l.map((r) => r.text).join(""));
  const picked = texts.slice(from, to + 1);
  const off = picked.every((t) => kindOf(t.slice(t.match(/^ */)![0].length)) === kind);
  let n = 0;
  const out: Run[] = [];
  lines.forEach((lineRuns, i) => {
    if (i > 0) out.push({ text: "\n" });
    if (i < from || i > to) return out.push(...lineRuns);
    const text = texts[i];
    const indent = text.match(/^ */)![0].length;
    const old = text.slice(indent).match(MARKER)?.[0].length ?? 0;
    const marker = off ? "" : kind === "number" ? `${++n}. ` : kind === "bullet" ? `${BULLET} ` : `${unchecked} `;
    out.push(...sliceRuns(lineRuns, 0, indent), { text: marker }, ...sliceRuns(lineRuns, indent + old));
  });
  return mergeRuns(out);
}
