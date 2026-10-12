import { requireUser } from "@/lib/supabase/server";
import { HomeView } from "./HomeView";

export default async function HomePage() {
  const { user } = await requireUser();
  return <HomeView email={user?.email} />;
}
