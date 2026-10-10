import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where the email confirmation link lands. Logs the person in.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  // Works on any device or browser (needs the Supabase email template
  // to link here with token_hash, see README).
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  // Default Supabase link. Only works in the same browser that signed up,
  // because it needs a cookie saved at sign-up time.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(
      "That link didn't log you in. Try logging in, or create your account again if it says your email isn't confirmed.",
    )}`,
  );
}
