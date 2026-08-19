import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  return data ? { ...data, email: user.email } : null;
}

export async function isAdmin() {
  const profile = await getCurrentProfile();
  return profile?.role === "admin";
}

export async function isInternalUser() {
  const profile = await getCurrentProfile();
  return ["operator", "admin"].includes(profile?.role);
}
