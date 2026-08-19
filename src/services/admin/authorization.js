import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function requireInternal(roles = ["operator", "admin"]) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("ADMIN_UNAUTHENTICATED");
  const { data: profile, error } = await supabase.from("profiles").select("id, full_name, phone, role, created_at").eq("id", authData.user.id).maybeSingle();
  if (error || !profile || !roles.includes(profile.role)) throw new Error("ADMIN_FORBIDDEN");
  return { supabase, user: authData.user, profile: { ...profile, email: authData.user.email } };
}

export function requireAdmin() {
  return requireInternal(["admin"]);
}

