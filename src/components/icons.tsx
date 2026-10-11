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
