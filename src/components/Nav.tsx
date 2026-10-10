import Link from "next/link";
import { signOut } from "@/app/actions";

export function Nav({ active }: { active: "now" | "timeline" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${
        on ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-200"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <nav className="flex gap-1">
          {tab("/", "Now", active === "now")}
          {tab("/timeline", "Timeline", active === "timeline")}
        </nav>
        <form action={signOut}>
          <button className="btn-link">Sign out</button>
        </form>
      </div>
    </header>
  );
}
