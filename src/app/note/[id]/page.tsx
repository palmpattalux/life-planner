import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { isPageId, tablesMissing, type NoteContent } from "@/lib/pages";
import { SetupNeeded } from "../../SetupNeeded";
import { NotePage } from "./NotePage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPageId(id)) notFound();
  const { supabase } = await requireUser();
  const [note, children] = await Promise.all([
    supabase.from("pages").select("id, parent_id, title, content").eq("id", id).eq("kind", "note").maybeSingle(),
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
      title={note.data.title}
      body={(note.data.content as NoteContent).body ?? ""}
      pages={children.data ?? []}
    />
  );
}
