import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import type { BoardData, Preset } from "@/components/Board";
import { SetupNeeded } from "../../SetupNeeded";
import { BoardPage } from "./BoardPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [page, presets] = await Promise.all([
    supabase.from("pages").select("id, title, content").eq("id", id).eq("kind", "board").maybeSingle(),
    supabase.from("presets").select("id, name, content").order("created_at"),
  ]);
  if (page.error) return <SetupNeeded message={page.error.message} />;
  if (presets.error) return <SetupNeeded message={presets.error.message} />;
  if (!page.data) notFound();

  return (
    <BoardPage
      id={page.data.id}
      title={page.data.title}
      initial={page.data.content as BoardData}
      presets={presets.data.map((p) => ({ id: p.id, name: p.name, data: p.content as BoardData }) satisfies Preset)}
    />
  );
}
