import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { requireAdmin } from "@/services/admin/authorization";
import { normalizeSettings } from "@/features/settings/settings-utils";
import { logServerError } from "@/lib/observability/logger";

const SETTINGS_SELECT = "id,store_name,logo_url,favicon_url,primary_color,secondary_color,accent_color,currency,contact_data,social_links,home_content,footer_content,seo_title,seo_description,social_image_url,canonical_domain,created_at,updated_at";

const getCachedPublicSettings = unstable_cache(async function getCachedPublicSettings() {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("site_settings").select(SETTINGS_SELECT).order("created_at").limit(1).maybeSingle();
  if (error) { logServerError("settings.query.failed", error, { repository: "settings", operation: "public" }); return normalizeSettings(null); }
  return normalizeSettings(data);
}, ["public-site-settings"], { revalidate: 300, tags: ["site-settings"] });
export const getPublicSettings = cache(getCachedPublicSettings);

const getCachedPublicBanners = unstable_cache(async function getCachedPublicBanners() {
  const supabase = createPublicClient();
  const now=new Date().toISOString();
  const { data, error } = await supabase.from("banners").select("id,title,subtitle,image_url,button_text,link_url,sort_order,active,starts_at,ends_at").eq("active",true).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`).order("sort_order").order("created_at");
  if (error) { logServerError("settings.query.failed", error, { repository: "settings", operation: "banners" }); return []; }
  return data || [];
}, ["public-banners"], { revalidate: 60, tags: ["storefront-banners"] });
export const getPublicBanners = cache(getCachedPublicBanners);

const getCachedPublicShippingMethods = unstable_cache(async function getCachedPublicShippingMethods() {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("shipping_methods").select("id,code,name,description,price,instructions,active,sort_order").eq("active",true).order("sort_order");
  if (error) { logServerError("settings.query.failed", error, { repository: "settings", operation: "shipping" }); return []; }
  return (data || []).map((row) => ({ id: row.code, label: row.name, description: row.description || "", price: Number(row.price), instructions: row.instructions || "", active: row.active }));
}, ["public-shipping-methods"], { revalidate: 300, tags: ["shipping-methods"] });
export const getPublicShippingMethods = cache(getCachedPublicShippingMethods);

export async function getAdminCustomization() {
  const { supabase } = await requireAdmin();
  const [settingsResult,bannersResult] = await Promise.all([
    supabase.from("site_settings").select(SETTINGS_SELECT).order("created_at").limit(1).maybeSingle(),
    supabase.from("banners").select("id,title,subtitle,image_url,button_text,link_url,sort_order,active,starts_at,ends_at,created_at,updated_at").order("sort_order"),
  ]);
  if (settingsResult.error || bannersResult.error) throw new Error("CUSTOMIZATION_UNAVAILABLE");
  return { settings: normalizeSettings(settingsResult.data), banners: bannersResult.data || [] };
}

export async function getAdminShippingMethods() {
  const { supabase } = await requireAdmin();
  const { data,error } = await supabase.from("shipping_methods").select("id,code,name,description,price,instructions,active,sort_order").order("sort_order");
  if (error) throw new Error("SHIPPING_UNAVAILABLE");
  return data || [];
}
