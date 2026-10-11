"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_BOARD } from "@/components/board/model";

// Make a new board and open it.
export async function createBoard() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pages")
    .insert({ kind: "board", content: EMPTY_BOARD })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't create the board");
  redirect(`/board/${data.id}`);
}
