// A saved page: a board (the whiteboard) or a note. Notes can hold pages of
// their own through parent_id. Stored in the "pages" table (supabase/schema.sql).
export type PageKind = "board" | "note";

export type PageRow = {
  id: string;
  parent_id: string | null;
  kind: PageKind;
  title: string;
  content: unknown;
  updated_at: string;
};

export type NoteContent = { body: string };

export const untitled = (kind: PageKind) => (kind === "board" ? "Untitled board" : "Untitled note");

// Page ids are uuids; anything else in the address can't be a page.
export const isPageId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Whether a database error means the tables haven't been made yet
// (supabase/schema.sql hasn't been run).
// (42703: a column added later is missing, so the latest schema hasn't been run.)
export const tablesMissing = (error: { code?: string }) =>
  error.code === "42P01" || error.code === "PGRST205" || error.code === "42703";

// Removed pages stay in the trash this long, then are deleted for good.
export const TRASH_DAYS = 30;
