"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function back(message: string, kind: "error" | "info" = "error"): never {
  redirect(`/login?${kind}=${encodeURIComponent(message)}`);
}

function credentials(form: FormData) {
  return {
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  };
}

export async function signIn(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(form));
  if (error) back(error.message);
  redirect("/");
}

export async function signUp(form: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const { data, error } = await supabase.auth.signUp({
    ...credentials(form),
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) back(error.message);
  // With email confirmation on, there's no session until the link is clicked.
  if (!data.session) back("Check your email for a confirmation link.", "info");
  redirect("/");
}
