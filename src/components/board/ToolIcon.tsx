// Icons for the phone toolbar's buttons.
export function ToolIcon({ tool }: { tool: string }) {
  const paths: Record<string, React.ReactNode> = {
    Circle: <circle cx="10" cy="10" r="6.5" />,
    Line: <path d="M4 16 L16 4" />,
    Text: <path d="M4 4.5 H16 M10 4.5 V16" />,
    Undo: <path d="M7 5 L3.5 8.5 L7 12 M3.5 8.5 H12 A4.5 4.5 0 0 1 12 17.5 H9" />,
    Redo: <path d="M13 5 L16.5 8.5 L13 12 M16.5 8.5 H8 A4.5 4.5 0 0 0 8 17.5 H11" />,
    Delete: <path d="M3.5 5.5 H16.5 M8 5.5 V3.5 H12 V5.5 M5.5 5.5 L6.5 17 H13.5 L14.5 5.5" />,
    Image: (
      <>
        <rect x="3.5" y="4" width="13" height="12" rx="2" />
        <circle cx="8" cy="8.5" r="1.3" />
        <path d="M4 14.5 L8.5 11 L11.5 13 L13.5 11.5 L16 13.5" />
      </>
    ),
    Presets: <path d="M4 5 H16 M4 10 H16 M4 15 H16" />,
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[tool]}
    </svg>
  );
}
