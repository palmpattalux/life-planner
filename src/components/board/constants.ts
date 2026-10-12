// Sizes, colours and limits used across the board.

export const CIRCLE_SIZE = 64;
export const MIN_CIRCLE = 8;
export const MAX_CIRCLE = 2000;
export const TEXT_SIZE = 24;
export const MIN_TEXT = 6;
export const MAX_TEXT = 800;
// Pasted pictures: how big they start out at most, and at most can be.
export const PICTURE_SIZE = 480;
export const MAX_PICTURE = 6000;
// Above everything on the board (menus, handles, guides), whatever the layers.
export const TOP_LAYER = 1_000_000;
export const TEXT_COLORS = ["#1c1917", "#78716c", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#9333ea"];
export const INK = "#1c1917";
// Background fills a text (or highlighted words) can have. New texts have none.
export const TEXT_FILLS = ["#fef08a", "#fed7aa", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#fbcfe8", "#e7e5e4"];
export const SELECT_BLUE = "#3b82f6";
export const SNAP_PINK = "#ec4899";
// Checklist boxes are stored as these characters at the start of a text line.
export const UNCHECKED = "☐";
export const CHECKED = "☑";
// Pressing Tab while typing moves the line right by this much.
export const INDENT = "    ";
export const PHASE_ORANGE = "#f97316";
// How far a new phase sits from the timeline it was made from, in board units.
export const PHASE_GAP = 48;
export const PHASE_GAP_PAST_LABELS = 72;
// How much bigger a bold pinned timeline mark is drawn.
export const PIN_GROW = 1.5;
// How far a phase bracket's ends curl toward its timeline, in board units.
export const BRACKET_CURL = 14;
// Moving less than this many pixels between press and release counts as a click.
export const CLICK_SLOP = 4;
// Scroll steps closer together than this are one resize, undone in one go.
export const RESIZE_UNDO_GAP_MS = 500;
export const MAX_UNDO = 200;

// The board itself, in board units. Everything lives inside it.
export const BOARD_W = 10000;
export const BOARD_H = 10000;
export const DOT_SPACING = 24;
export const MIN_SCALE = 0.06;
export const MAX_SCALE = 4;
// Timeline ruler sizes, in board units.
export const TICK = 6;
export const MAJOR_TICK = 10;
export const TICK_LABEL_SIZE = 11;
export const TICK_LABEL_GAP = 56; // roughly the width of one label
// Text in the middle of a line, in board units.
export const LINE_LABEL_SIZE = 16;
// How close (in screen pixels, beyond the circle's edge) a dragged line end
// has to be to a circle to attach to it.
export const ATTACH_DISTANCE = 16;
// How close (in screen pixels) a dragged square's edge or middle has to be to
// another square's to snap in line with it.
export const SNAP_DISTANCE = 8;
// Square labels grow and shrink with their square.
export const squareLabelSize = (size: number) => Math.max(8, size / 4);
