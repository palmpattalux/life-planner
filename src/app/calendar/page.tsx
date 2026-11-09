import { requireUser } from "@/lib/supabase/server";
import { CalendarView } from "./CalendarView";

// The calendar, opened from the heading of Home's week timeline.
export default async function CalendarPage() {
  await requireUser();
  return <CalendarView />;
}
