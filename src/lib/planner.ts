// Home's to-do list, milestone and priority tasks, kept in Supabase
// (supabase/schema.sql: todo_days, phase_goals, priority_tasks, task_links). A board text added as a task shares
// a link id with the task; whether it's ticked lives in task_links, so
// ticking either one ticks the other, while removing either leaves the other.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskPage } from "@/components/board/LinkMenu";

// `page`: a phase goal task's own page (a "note" in pages).
// `deadline`: a priority task's deadline (an ISO date and time).
export type Task = { id: string; text: string; done: boolean; link?: string; page?: string; deadline?: string };
export type PhaseUnit = "day" | "week" | "month" | "year";
// start / end are dates ("2026-10-12"); end is the last day of the phase.
export type Phase = { unit: PhaseUnit | null; start: string | null; end: string | null; tasks: Task[] };
export const EMPTY_PHASE: Phase = { unit: null, start: null, end: null, tasks: [] };
export type Day = { day: string; items: Task[] };

// Past to-do days are kept this long, then deleted.
export const KEEP_DAYS = 30;

// A date as "YYYY-MM-DD", in this device's time zone.
export function localDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const today = () => localDate(new Date());
// "YYYY-MM-DD" as a local date.
export const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
// Whole days from today until this date (0: it's today).
export const daysUntil = (s: string) =>
  Math.round((parseDate(s).getTime() - parseDate(today()).getTime()) / (24 * 60 * 60 * 1000));

export const newTask = (text = ""): Task => ({ id: crypto.randomUUID(), text, done: false });

// Tasks with their ticks as they are in task_links (for linked ones).
async function withLinkStates(sb: SupabaseClient, tasks: Task[]): Promise<Task[]> {
  const links = tasks.flatMap((t) => (t.link ? [t.link] : []));
  if (links.length === 0) return tasks;
  const { data } = await sb.from("task_links").select("id, done").in("id", links);
  const done = new Map((data ?? []).map((r) => [r.id as string, r.done as boolean]));
  return tasks.map((t) => (t.link && done.has(t.link) ? { ...t, done: done.get(t.link)! } : t));
}

export async function loadToday(sb: SupabaseClient): Promise<Task[]> {
  const { data, error } = await sb.from("todo_days").select("items").eq("day", today()).maybeSingle();
  if (error) throw error;
  return withLinkStates(sb, (data?.items as Task[]) ?? []);
}

export async function saveDay(sb: SupabaseClient, day: string, items: Task[]) {
  const { error } = await sb
    .from("todo_days")
    .upsert(
      { day, items: items.filter((t) => t.text.trim()), updated_at: new Date().toISOString() },
      { onConflict: "user_id,day" },
    );
  if (error) throw error;
}

// The days before today that have tasks, newest first. Days older than
// KEEP_DAYS are deleted first.
export async function loadPastDays(sb: SupabaseClient): Promise<Day[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  await sb.from("todo_days").delete().lt("day", localDate(cutoff));
  const { data, error } = await sb
    .from("todo_days")
    .select("day, items")
    .lt("day", today())
    .order("day", { ascending: false });
  if (error) throw error;
  return (data as Day[]).filter((d) => d.items.some((t) => t.text.trim()));
}

export async function loadPhase(sb: SupabaseClient): Promise<Phase> {
  const { data, error } = await sb.from("phase_goals").select("unit, start_date, end_date, tasks").maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_PHASE;
  return {
    unit: data.unit,
    start: data.start_date,
    end: data.end_date,
    tasks: await withLinkStates(sb, (data.tasks as Task[]) ?? []),
  };
}

export async function savePhase(sb: SupabaseClient, p: Phase) {
  const { error } = await sb.from("phase_goals").upsert(
    {
      unit: p.unit,
      start_date: p.start,
      end_date: p.end,
      tasks: p.tasks.filter((t) => t.text.trim()),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

// Tick or untick a linked task everywhere it shows.
export async function setLinkDone(sb: SupabaseClient, link: string, done: boolean) {
  const { error } = await sb.from("task_links").upsert({ id: link, done });
  if (error) throw error;
}

export async function linkStates(sb: SupabaseClient, links: string[]): Promise<Map<string, boolean>> {
  if (links.length === 0) return new Map();
  const { data } = await sb.from("task_links").select("id, done").in("id", links);
  return new Map((data ?? []).map((r) => [r.id as string, r.done as boolean]));
}

type Linked = { text: string; link: string; done: boolean };
const linkedTask = (t: Linked): Task => ({ ...newTask(t.text), done: t.done, link: t.link });

export async function addToToday(sb: SupabaseClient, t: Linked) {
  await setLinkDone(sb, t.link, t.done);
  const items = await loadToday(sb);
  await saveDay(sb, today(), [...items.filter((i) => i.text.trim()), linkedTask(t)]);
}

export async function addPhaseTask(sb: SupabaseClient, t: Linked) {
  await setLinkDone(sb, t.link, t.done);
  const phase = await loadPhase(sb);
  await savePhase(sb, { ...phase, tasks: [...phase.tasks.filter((i) => i.text.trim()), linkedTask(t)] });
}

export async function loadPriority(sb: SupabaseClient): Promise<Task[]> {
  const { data, error } = await sb.from("priority_tasks").select("tasks").maybeSingle();
  if (error) throw error;
  return withLinkStates(sb, (data?.tasks as Task[]) ?? []);
}

export async function savePriority(sb: SupabaseClient, tasks: Task[]) {
  const { error } = await sb
    .from("priority_tasks")
    .upsert(
      { tasks: tasks.filter((t) => t.text.trim()), updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

// A board's deadline task on Home's Priority tasks: added the first time,
// and its words kept up to date after that.
export async function putPriorityTask(sb: SupabaseClient, t: Linked, deadline: string) {
  await setLinkDone(sb, t.link, t.done);
  const tasks = (await loadPriority(sb)).filter((i) => i.text.trim());
  const at = tasks.findIndex((i) => i.link === t.link);
  if (at === -1) tasks.push({ ...linkedTask(t), deadline });
  else tasks[at] = { ...tasks[at], text: t.text };
  await savePriority(sb, tasks);
}

// The phase goal's tasks that have their own page.
export async function phaseTaskPages(sb: SupabaseClient): Promise<TaskPage[]> {
  const phase = await loadPhase(sb);
  return phase.tasks.flatMap((t) => (t.page ? [{ id: t.page, title: t.text }] : []));
}

// The note pages' content: a TipTap document.
type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; text?: string };

// Add a task (a checklist line) to the end of a task page.
export async function addTaskToPage(sb: SupabaseClient, pageId: string, t: Linked) {
  await setLinkDone(sb, t.link, t.done);
  const { data, error } = await sb.from("pages").select("content").eq("id", pageId).single();
  if (error) throw error;
  const doc: DocNode =
    (data.content as DocNode)?.type === "doc" ? (data.content as DocNode) : { type: "doc", content: [] };
  const content = [...(doc.content ?? [])];
  const item: DocNode = {
    type: "taskItem",
    attrs: { checked: t.done, link: t.link },
    content: [{ type: "paragraph", content: [{ type: "text", text: t.text }] }],
  };
  const last = content[content.length - 1];
  if (last?.type === "taskList") content[content.length - 1] = { ...last, content: [...(last.content ?? []), item] };
  else content.push({ type: "taskList", content: [item] });
  const { error: saveError } = await sb
    .from("pages")
    .update({ content: { ...doc, content }, updated_at: new Date().toISOString() })
    .eq("id", pageId);
  if (saveError) throw saveError;
}

// A phase goal task's page, made (titled with the task) the first time.
export async function createTaskPage(sb: SupabaseClient, title: string): Promise<string> {
  const { data, error } = await sb
    .from("pages")
    .insert({ kind: "note", title, content: { type: "doc", content: [{ type: "paragraph" }] } })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// Store a picture pasted on a board; returns its address.
export async function uploadPicture(sb: SupabaseClient, file: Blob): Promise<string> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");
  const path = `${auth.user.id}/${crypto.randomUUID()}.webp`;
  const { error } = await sb.storage.from("pictures").upload(path, file, { contentType: file.type || "image/webp" });
  if (error) throw error;
  return sb.storage.from("pictures").getPublicUrl(path).data.publicUrl;
}
