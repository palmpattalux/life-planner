// The site's look: "light" (the original) or "dark" (midnight). Chosen in
// Home's menu and kept in this browser.

export type Theme = "light" | "dark";
const KEY = "theme";

// Runs in <head> before the page shows, so a dark page never flashes light.
export const themeScript = `try{if(localStorage.getItem("${KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
}
