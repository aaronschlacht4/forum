import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Server-only Supabase admin client.
 * Lazy creation prevents "module has no exports" issues when env vars are missing.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL in .env.local");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing env SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  _client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return _client;
}
