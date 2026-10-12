import { fullBoard, type BoardData } from "@/components/board/model";
import { INK } from "@/components/board/constants";

// A small, slightly blurred picture of what's on a board, for its box on
// Home: its circles, squares, texts, lines and pictures.
export function BoardPreview({ data }: { data: BoardData | null }) {
  const d = fullBoard(data);
  const items = [...d.circles, ...d.squares, ...d.texts];
  const at = (id: number | undefined, p: { x: number; y: number }) => {
    const item = id === undefined ? undefined : items.find((i) => i.id === id);
    return item ? { x: item.x, y: item.y } : p;
  };
  const lines = d.lines.map((l) => ({ l, pts: [at(l.fromItem, l.from), ...(l.bends ?? []), at(l.toItem, l.to)] }));

  // Everything's outer edges, so the picture frames all of it.
  const boxes = [
    ...d.circles.map((c) => [c.x - c.size / 2, c.y - c.size / 2, c.x + c.size / 2, c.y + c.size / 2]),
    ...[...d.squares, ...d.pictures].map((q) => [q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2]),
    ...d.texts.map((t) => {
      const rows = t.text.split("\n");
      const w = (Math.max(...rows.map((r) => r.length)) * t.fontSize * 0.55) / 2;
      const h = (rows.length * t.fontSize * 1.2) / 2;
      return [t.x - w, t.y - h, t.x + w, t.y + h];
    }),
    ...lines.flatMap(({ pts }) => pts.map((p) => [p.x, p.y, p.x, p.y])),
  ];
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b[0]));
  const minY = Math.min(...boxes.map((b) => b[1]));
  const maxX = Math.max(...boxes.map((b) => b[2]));
  const maxY = Math.max(...boxes.map((b) => b[3]));
  const pad = Math.max(maxX - minX, maxY - minY, 200) * 0.08;
  const viewBox = `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`;
  // Keep strokes visible however big the board is.
  const stroke = Math.max(2, (maxX - minX + maxY - minY) / 300);

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 size-full px-4 pb-10 pt-4 opacity-70 blur-[1.5px]"
      aria-hidden
    >
      {d.pictures.map((p) => (
        <image key={`p${p.id}`} href={p.src} x={p.x - p.w / 2} y={p.y - p.h / 2} width={p.w} height={p.h} />
      ))}
      {d.squares.map((q) => (
        <rect
          key={`q${q.id}`}
          x={q.x - q.w / 2}
          y={q.y - q.h / 2}
          width={q.w}
          height={q.h}
          fill="none"
          stroke={q.color}
          strokeWidth={stroke}
        />
      ))}
      {d.circles.map((c) => (
        <circle key={`c${c.id}`} cx={c.x} cy={c.y} r={c.size / 2} fill="none" stroke={INK} strokeWidth={stroke} />
      ))}
      {lines.map(({ l, pts }) => (
        <polyline
          key={`l${l.id}`}
          points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={l.color ?? INK}
          strokeWidth={stroke}
        />
      ))}
      {d.texts.map((t) => {
        const rows = t.text.split("\n");
        return (
          <text
            key={`t${t.id}`}
            x={t.x}
            y={t.y - ((rows.length - 1) * t.fontSize * 1.2) / 2}
            fontSize={t.fontSize}
            fill={t.color}
            fontWeight={t.bold ? 700 : 400}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {rows.map((r, i) => (
              <tspan key={i} x={t.x} dy={i === 0 ? 0 : t.fontSize * 1.2}>
                {r}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
