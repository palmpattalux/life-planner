import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; info?: string }>;
}) {
  const { error, info } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Life Planner</h1>
      <p className="mt-2 text-stone-500">
        In this phase of my life, what should I be doing?
      </p>

      <form className="mt-8 space-y-3">
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
          autoComplete="current-password"
          placeholder="Password"
          className="input"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-700">{info}</p>}

        <div className="flex gap-2 pt-2">
          <button formAction={signIn} className="btn-primary flex-1">
            Log in
          </button>
          <button formAction={signUp} className="btn-secondary flex-1">
            Sign up
          </button>
        </div>
      </form>
    </main>
  );
}
