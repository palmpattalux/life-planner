import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { isPageId, tablesMissing, type NoteContent } from "@/lib/pages";
import { SetupNeeded } from "../../SetupNeeded";
import { NotePage } from "./NotePage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ open?: string }>;
}) {
  const { id } = await params;
  const { open } = await searchParams;
  if (!isPageId(id)) notFound();
  const { supabase } = await requireUser();
  const [note, children] = await Promise.all([
    supabase
      .from("pages")
      .select("id, parent_id, title, content, updated_at")
      .eq("id", id)
      .eq("kind", "note")
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("pages").select("id, kind, title").eq("parent_id", id).order("created_at"),
  ]);
  for (const error of [note.error, children.error]) {
    if (error && tablesMissing(error)) return <SetupNeeded message={error.message} />;
    if (error) throw new Error(error.message);
  }
  if (!note.data) notFound();

  return (
    <NotePage
      id={note.data.id}
      parentId={note.data.parent_id}
      loadedAt={note.data.updated_at}
      showOpen={open === "1"}
      title={note.data.title}
      body={(note.data.content as NoteContent).body ?? ""}
      pages={children.data ?? []}
    />
  );
}
