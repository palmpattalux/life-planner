import { requireUser } from "@/lib/supabase/server";
import { BoardList } from "../BoardList";
import { AccountMenu } from "./AccountMenu";

// Home: who's logged in on the left, a menu with Log out on the right, and
// every board in a frame in the middle.
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
      {/* The boards sit in a smaller frame in the middle of the screen. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-16">
        <div
          data-home-frame
          className="flex h-[min(60vh,560px)] w-full max-w-3xl flex-col rounded-2xl border border-stone-200 bg-white pt-5 shadow-sm"
        >
          <BoardList />
        </div>
      </div>
    </main>
  );
}
