import { requireUser } from "@/lib/supabase/server";
import { BoardList } from "../BoardList";
import { AccountMenu } from "./AccountMenu";

// Home: who's logged in on the left, a menu with Log out on the right, and
// every board below.
export default async function HomePage() {
  const { user } = await requireUser();

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <span data-account className="truncate font-medium">
          {user?.email}
        </span>
        <AccountMenu />
      </header>
      <BoardList />
    </main>
  );
}
