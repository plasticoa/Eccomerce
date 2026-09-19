import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readProfile } from "@/lib/auth";
import { logServerError } from "@/lib/observability/logger";

export async function requireInternal(roles = ["operator", "admin"]) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("ADMIN_UNAUTHENTICATED");
  const profile = await readProfile(supabase, authData.user);
  if (!roles.includes(profile.role)) throw new Error("ADMIN_FORBIDDEN");
  // Check the RLS helper too: inconsistent deployments must not look like empty lists.
  const { data: permitted, error } = await supabase.rpc(roles.length === 1 && roles[0] === "admin" ? "is_admin" : "is_internal_user");
  if (error || permitted !== true) {
    logServerError("admin.authorization.failed", error || { code: "ROLE_POLICY_MISMATCH", message: "Profile role and RLS helper disagree" });
    throw new Error("ADMIN_AUTHORIZATION_UNAVAILABLE");
  }
  return { supabase, user: authData.user, profile };
}

export function requireAdmin() {
  return requireInternal(["admin"]);
}

