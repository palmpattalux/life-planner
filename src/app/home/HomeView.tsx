"use client";

import { BoardList, useBoards } from "../BoardList";
import { AccountMenu } from "./AccountMenu";

// Home: who's logged in on the left, a menu on the right (trash and Log out),
// and every board grouped in the middle.
export function HomeView({ email }: { email?: string }) {
  const boards = useBoards({ withContent: true });

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <span data-account className="truncate font-medium">
          {email}
        </span>
        <AccountMenu boards={boards} />
      </header>
      {/* The boards, grouped in the middle of the screen with nothing around them. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-16">
        <div data-home-boards className="flex h-[min(60vh,560px)] w-full max-w-3xl flex-col pt-3">
          <BoardList boards={boards} home />
        </div>
      </div>
    </main>
  );
}
