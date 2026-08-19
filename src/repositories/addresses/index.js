import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getAddresses() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("addresses").select("id, label, recipient_name, phone, line_1, line_2, city, state_region, postal_code, country_code, delivery_notes, is_default").order("is_default", { ascending: false }).order("created_at");
  if (error) throw new Error("ADDRESSES_UNAVAILABLE");
  return data || [];
}
