// Shown when the database tables haven't been made yet.
export function SetupNeeded({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-xl font-semibold">Database setup needed</h1>
      <p className="mt-3 text-stone-600">
        Open Supabase, go to SQL Editor, paste the contents of <code>supabase/schema.sql</code> from the repository and
        press Run. Then reload this page.
      </p>
      <p className="mt-3 text-sm text-stone-400">{message}</p>
    </main>
  );
}
