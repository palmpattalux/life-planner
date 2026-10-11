"use client";

import { useState } from "react";
import { signOut } from "../actions";

// The menu at the top right of Home. Clicking anywhere else closes it.
export function AccountMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        aria-label="Menu"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md px-2.5 py-1 text-lg leading-none hover:bg-stone-100"
      >
        ☰
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onPointerDown={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-md border border-stone-200 bg-white py-1 text-sm shadow-lg">
            <form action={signOut}>
              <button className="w-full px-3 py-1.5 text-left hover:bg-stone-100">Log out</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
