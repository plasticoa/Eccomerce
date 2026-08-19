import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "./config";

export function createPublicClient() {
  const { url, key } = getPublicSupabaseConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
