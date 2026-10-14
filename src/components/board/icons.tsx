"use client";

import { useState } from "react";
import { LINE_WIDTHS } from "./constants";

// Small icons used in the menus.

export function SquareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="2.5" width="11" height="11" />
    </svg>
  );
}

export function ChainIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M6.5 9.5 L9.5 6.5" />
      <path d="M7 4.5 L8.2 3.3 a2.6 2.6 0 0 1 3.7 3.7 L10.7 8.2" />
      <path d="M9 11.5 L7.8 12.7 a2.6 2.6 0 0 1 -3.7 -3.7 L5.3 7.8" />
    </svg>
  );
}

// The chain icon row in every menu. It will link to other notes or pages
// (inside the app or outside); for now it does nothing.
export function LinkButton() {
  return (
    <button
      aria-label="Link"
      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-stone-100"
    >
      <ChainIcon />
      Link
    </button>
  );
}

export function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="6" r="3.5" />
      <path d="M8 9.5 V14.5" />
    </svg>
  );
}

export function ChecklistIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.5" y="2" width="5" height="5" rx="1" />
      <path d="M2.8 4.5 L3.9 5.6 L5.5 3.6" />
      <rect x="1.5" y="9" width="5" height="5" rx="1" />
      <path d="M9 4.5 H14.5" />
      <path d="M9 11.5 H14.5" />
    </svg>
  );
}

// The tick drawn inside a checked checklist box.
export function CheckMark({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 10 10"
      className="absolute inset-0 size-full"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.2 5.2 L4.2 7.2 L7.8 3" />
    </svg>
  );
}

export function LayersIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    >
      <path d="M8 2 L14.5 5.5 L8 9 L1.5 5.5 Z" />
      <path d="M1.5 9 L8 12.5 L14.5 9" />
    </svg>
  );
}

// "Layer" in the box of something that overlaps something else: click it for
// Move to front and Move to back.
export function LayerButton({ onFront, onBack }: { onFront: () => void; onBack: () => void }) {
  const [open, setOpen] = useState(false);
  const item = "w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100";
  return (
    <div data-layer>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${open ? "bg-stone-100" : "hover:bg-stone-100"}`}
      >
        <LayersIcon />
        Layer
      </button>
      {open && (
        <div className="pl-6">
          <button data-layer-front onClick={onFront} className={item}>
            Move to front
          </button>
          <button data-layer-back onClick={onBack} className={item}>
            Move to back
          </button>
        </div>
      )}
    </div>
  );
}

// Choosing how thick a line is: one short sample line per thickness.
export function LineWidths({ value, onPick }: { value?: number; onPick: (width: number) => void }) {
  return (
    <div data-line-widths className="flex items-center gap-1 px-1 py-1">
      {LINE_WIDTHS.map((w) => (
        <button
          key={w}
          type="button"
          data-line-width={w}
          aria-label={`Thickness ${w}`}
          aria-pressed={value === w}
          onClick={() => onPick(w)}
          className={`flex h-6 w-7 items-center justify-center rounded ${value === w ? "bg-stone-200" : "hover:bg-stone-100"}`}
        >
          <span className="block w-4 rounded-full bg-stone-900" style={{ height: Math.max(1, w * 0.8) }} />
        </button>
      ))}
    </div>
  );
}

export function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 4.5 H13.5 M6 4.5 V3 a1 1 0 0 1 1 -1 H9 a1 1 0 0 1 1 1 V4.5 M4 4.5 L4.7 13 a1 1 0 0 0 1 1 H10.3 a1 1 0 0 0 1 -1 L12 4.5" />
    </svg>
  );
}
