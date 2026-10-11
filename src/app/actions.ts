"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type PageKind } from "@/lib/pages";

// Make a new board or note (inside `parentId` when given) and open it.
export async function createPage(kind: PageKind, parentId: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pages")
    .insert({ kind, parent_id: parentId, content: kind === "board" ? { circles: [], squares: [], texts: [], lines: [] } : { body: "" } })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't create the page");
  redirect(`/${kind}/${data.id}`);
}
