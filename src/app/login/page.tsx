import Link from "next/link";
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; info?: string; mode?: string }>;
}) {
  const { error, info, mode } = await searchParams;
  const isSignUp = mode === "signup";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Life Planner</h1>
      <p className="mt-2 text-stone-500">
        In this phase of my life, what should I be doing?
      </p>

      <div className="mt-8 grid grid-cols-2 rounded-lg bg-stone-200 p-1 text-center text-sm font-medium">
        <Link
          href="/login"
          className={`rounded-md py-1.5 ${!isSignUp ? "bg-white shadow-sm" : "text-stone-600"}`}
        >
          Log in
        </Link>
        <Link
          href="/login?mode=signup"
          className={`rounded-md py-1.5 ${isSignUp ? "bg-white shadow-sm" : "text-stone-600"}`}
        >
          Create account
        </Link>
      </div>

      {/* One form per mode, so pressing Enter always does what the page says. */}
      <form action={isSignUp ? signUp : signIn} className="mt-4 space-y-3">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          className="input"
        />
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          placeholder={isSignUp ? "Choose a password (6+ characters)" : "Password"}
          className="input"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-700">{info}</p>}

        <button className="btn-primary w-full">
          {isSignUp ? "Create account" : "Log in"}
        </button>
      </form>

      {!isSignUp && (
        <p className="mt-4 text-center text-sm text-stone-500">
          New here?{" "}
          <Link href="/login?mode=signup" className="underline">
            Create an account
          </Link>
        </p>
      )}
    </main>
  );
}
