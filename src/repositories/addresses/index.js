import "server-only";
import { requireUser } from "@/lib/auth";
import { logServerError } from "@/lib/observability/logger";

export async function getAddresses() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("addresses").select("id, label, recipient_name, phone, line_1, line_2, city, state_region, postal_code, country_code, delivery_notes, is_default").eq("profile_id", user.id).order("is_default", { ascending: false }).order("created_at");
  if (error) {
    logServerError("account.addresses.failed", error);
    throw new Error("ADDRESSES_UNAVAILABLE");
  }
  return data || [];
}
