import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/**
 * Server-only Supabase Admin client.
 * Lazy-init prevents module-evaluation crashes and "no exports" errors.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // These errors are clearer than "supabaseKey is required"
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");

  _admin = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _admin;
}
