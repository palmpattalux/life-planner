import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { isPageId, tablesMissing } from "@/lib/pages";
import type { BoardData, Preset } from "@/components/board/model";
import { SetupNeeded } from "../../SetupNeeded";
import { BoardPage } from "./BoardPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ open?: string; new?: string }>;
}) {
  const { id } = await params;
  const { open, new: isNew } = await searchParams;
  if (!isPageId(id)) notFound();
  const { supabase } = await requireUser();
  const [page, presets] = await Promise.all([
    supabase
      .from("pages")
      .select("id, title, content, updated_at")
      .eq("id", id)
      .eq("kind", "board")
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("presets").select("id, name, content").order("created_at"),
  ]);
  for (const error of [page.error, presets.error]) {
    if (error && tablesMissing(error)) return <SetupNeeded message={error.message} />;
    if (error) throw new Error(error.message);
  }
  if (!page.data) notFound();

  return (
    <BoardPage
      id={page.data.id}
      title={page.data.title}
      loadedAt={page.data.updated_at}
      showOpen={open === "1"}
      isNew={isNew === "1"}
      initial={page.data.content as BoardData}
      presets={presets.data!.map((p) => ({ id: p.id, name: p.name, data: p.content as BoardData }) satisfies Preset)}
    />
  );
}
