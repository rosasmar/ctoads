// Supabase client for the web app's server code. It uses the service role key, which skips row
// level security, so `server-only` makes the build fail if a Client Component imports this file.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** The shared client. Throws if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY isn't set. */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Alerts aren't set up: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
