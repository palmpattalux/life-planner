"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "./env";

// Supabase client for the browser (saving while you work).
export function createClient() {
  return createBrowserClient(supabaseUrl!, supabaseKey!);
}
