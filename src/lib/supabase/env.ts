// Supabase's "Connect" panel has used different names for the public key
// over time, so accept any of them. Each is referenced directly so Next.js
// can inline it at build time.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

export const supabaseKey = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)?.trim();

// What's missing, by name only (never the values), for the setup message.
export function missingEnv(): string[] {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL is missing");
  else if (!supabaseUrl.startsWith("https://")) missing.push("NEXT_PUBLIC_SUPABASE_URL must start with https://");
  if (!supabaseKey)
    missing.push(
      "the key is missing (name it NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)",
    );
  return missing;
}
