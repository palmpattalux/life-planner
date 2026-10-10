"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(form: FormData, key: string): string | null {
  const v = String(form.get(key) ?? "").trim();
  return v === "" ? null : v;
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/timeline");
}

export async function savePhase(form: FormData) {
  const supabase = await createClient();
  const id = text(form, "id");
  const row = {
    title: text(form, "title") ?? "Untitled phase",
    focus: text(form, "focus"),
    start_date: text(form, "start_date") ?? new Date().toISOString().slice(0, 10),
    end_date: text(form, "end_date"),
  };

  const { error } = id
    ? await supabase.from("phases").update(row).eq("id", id)
    : await supabase.from("phases").insert(row);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deletePhase(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("phases").delete().eq("id", text(form, "id")!);
  if (error) throw new Error(error.message);
  refresh();
}

export async function saveItem(form: FormData) {
  const supabase = await createClient();
  const id = text(form, "id");
  const row = {
    phase_id: text(form, "phase_id")!,
    kind: text(form, "kind") === "event" ? "event" : "goal",
    title: text(form, "title") ?? "Untitled",
    notes: text(form, "notes"),
    date: text(form, "date"),
    priority: form.get("priority") === "on",
  };

  const { error } = id
    ? await supabase.from("items").update(row).eq("id", id)
    : await supabase.from("items").insert(row);
  if (error) throw new Error(error.message);
  refresh();
}

export async function toggleItem(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ done: form.get("done") !== "true" })
    .eq("id", text(form, "id")!);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteItem(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("items").delete().eq("id", text(form, "id")!);
  if (error) throw new Error(error.message);
  refresh();
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
