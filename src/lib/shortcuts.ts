// The board's one-key shortcuts, changeable in Home's menu (Shortcuts) and
// kept in this browser.

export type Action = "text" | "view" | "circle" | "line" | "presets" | "centre";
export type Shortcuts = Record<Action, string>;

export const DEFAULT_SHORTCUTS: Shortcuts = { text: "t", view: "v", circle: "b", line: "n", presets: "m", centre: "f" };

// In the order Home's menu lists them.
export const ACTIONS: { action: Action; label: string }[] = [
  { action: "text", label: "New text" },
  { action: "view", label: "View mode" },
  { action: "circle", label: "New circle" },
  { action: "line", label: "Draw a line (hold)" },
  { action: "presets", label: "Presets menu" },
  { action: "centre", label: "Centre the view" },
];

const KEY = "shortcuts";

export function getShortcuts(): Shortcuts {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Shortcuts>;
    return { ...DEFAULT_SHORTCUTS, ...saved };
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

export function saveShortcuts(s: Shortcuts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

// Give an action a new key. A key already used by another action is swapped
// with it, so no key does two things.
export function withKey(s: Shortcuts, action: Action, key: string): Shortcuts {
  const other = (Object.keys(s) as Action[]).find((a) => a !== action && s[a] === key);
  return { ...s, [action]: key, ...(other ? { [other]: s[action] } : {}) };
}
