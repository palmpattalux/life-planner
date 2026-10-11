// Boards are saved in the "pages" table (supabase/schema.sql), with kind
// "board". (Its kind and parent_id columns are kept for notes, which are
// being redone.)
export const UNTITLED_BOARD = "Untitled board";

// Page ids are uuids; anything else in the address can't be a page.
export const isPageId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Whether a database error means the tables haven't been made yet
// (supabase/schema.sql hasn't been run).
// (42703: a column added later is missing, so the latest schema hasn't been run.)
export const tablesMissing = (error: { code?: string }) =>
  error.code === "42P01" || error.code === "PGRST205" || error.code === "42703";

// Removed pages stay in the trash this long, then are deleted for good.
export const TRASH_DAYS = 30;
