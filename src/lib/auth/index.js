import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/observability/logger";

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("AUTH_REQUIRED");
  return { supabase, user: data.user };
}

export async function readProfile(supabase, user) {
  const { data, error } = await supabase.from("profiles")
    .select("id, full_name, phone, role, created_at").eq("id", user.id).maybeSingle();
  if (error || !data) {
    logServerError("auth.profile.failed", error || { code: "PROFILE_MISSING", message: "Authenticated user has no profile" });
    throw new Error("PROFILE_UNAVAILABLE");
  }
  return { ...data, email: user.email };
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  return readProfile(supabase, user);
}

export async function isAdmin() {
  const profile = await getCurrentProfile();
  return profile?.role === "admin";
}

export async function isInternalUser() {
  const profile = await getCurrentProfile();
  return ["operator", "admin"].includes(profile?.role);
}
