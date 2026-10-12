import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { isPageId, tablesMissing } from "@/lib/pages";
import { SetupNeeded } from "../../SetupNeeded";
import { TaskPage } from "./TaskPage";

// A phase goal task's own page: notes and a checklist for that task.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPageId(id)) notFound();
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("pages")
    .select("id, title, content, updated_at")
    .eq("id", id)
    .eq("kind", "note")
    .is("deleted_at", null)
    .maybeSingle();
  if (error && tablesMissing(error)) return <SetupNeeded message={error.message} />;
  if (error) throw new Error(error.message);
  if (!data) notFound();
  return <TaskPage id={data.id} title={data.title} content={data.content} loadedAt={data.updated_at} />;
}
