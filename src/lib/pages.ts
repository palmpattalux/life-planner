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
