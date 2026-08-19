import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireInternal } from "@/services/admin/authorization";
import { normalizeAdminPage } from "@/lib/validation/admin";
import { sanitizeSearchTerm } from "@/features/catalog/catalog-utils";
import { logServerError } from "@/lib/observability/logger";

export const ADMIN_PAGE_SIZE = 20;

function rangeFor(page) {
  const safe = normalizeAdminPage(page);
  return { page: safe, from: (safe - 1) * ADMIN_PAGE_SIZE, to: safe * ADMIN_PAGE_SIZE - 1 };
}

function result(data, count, page) {
  return { items: data || [], total: count || 0, page, pageSize: ADMIN_PAGE_SIZE, totalPages: Math.max(1, Math.ceil((count || 0) / ADMIN_PAGE_SIZE)) };
}

function dbError(area, error) {
  logServerError("admin.query.failed", error, { repository: "admin", area });
  throw new Error("ADMIN_DATA_UNAVAILABLE");
}

export async function getDashboard(days = 30) {
  const { supabase } = await requireInternal();
  const safeDays = [1, 7, 30].includes(Number(days)) ? Number(days) : 30;
  const since = new Date(Date.now() - safeDays * 86400000).toISOString();
  const [metricsResult, ordersResult] = await Promise.all([
    supabase.rpc("admin_dashboard_metrics", { p_days: safeDays }),
    supabase.from("orders").select("id, order_number, status, payment_status, total, currency, created_at, profiles(full_name)").gte("created_at", since).order("created_at", { ascending: false }).limit(6),
  ]);
  if (metricsResult.error || ordersResult.error) dbError("dashboard", metricsResult.error || ordersResult.error);
  return { metrics: metricsResult.data, recentOrders: ordersResult.data || [], lowStock: metricsResult.data?.lowStockItems || [], topProducts: metricsResult.data?.topProducts || [], days: safeDays };
}

export async function getAdminCategories() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("categories").select("id, name, slug, description, seo_title, seo_description, active, created_at, product_categories(count)").order("name");
  if (error) dbError("categories", error);
  return data || [];
}

export async function getAdminProducts({ query = "", status = "all", page = 1 } = {}) {
  const { supabase } = await requireAdmin();
  const range = rangeFor(page);
  let productIds = [];
  const search = sanitizeSearchTerm(query);
  if (search) {
    const { data: variants } = await supabase.from("product_variants").select("product_id").ilike("sku", `%${search}%`).limit(100);
    productIds = [...new Set((variants || []).map((row) => row.product_id))];
  }
  let queryBuilder = supabase.from("products").select("id, name, slug, active, created_at, updated_at, product_categories(categories(id,name)), product_variants(id,sku,variant_name,price,active,inventory(quantity,low_stock_threshold))", { count: "exact" });
  if (search) queryBuilder = queryBuilder.or(`name.ilike.%${search}%,slug.ilike.%${search}%${productIds.length ? `,id.in.(${productIds.join(",")})` : ""}`);
  if (status === "active") queryBuilder = queryBuilder.eq("active", true);
  if (status === "inactive") queryBuilder = queryBuilder.eq("active", false);
  const { data, error, count } = await queryBuilder.order("updated_at", { ascending: false }).range(range.from, range.to);
  if (error) dbError("products", error);
  return result(data, count, range.page);
}

export async function getAdminProduct(id) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("products").select("id,name,slug,description,seo_title,seo_description,active,created_at,updated_at,product_categories(category_id,categories(id,name)),product_variants(id,sku,variant_name,price,compare_at_price,active,inventory(quantity,low_stock_threshold)),product_images(id,storage_path,alt_text,sort_order,is_primary)").eq("id", id).maybeSingle();
  if (error) dbError("product", error);
  return data || null;
}

export async function getInventory({ query = "", low = false, productId = "", page = 1 } = {}) {
  const { supabase } = await requireInternal();
  const range = rangeFor(page);
  const { data, error } = await supabase.rpc("admin_inventory_page", { p_search: sanitizeSearchTerm(query) || null, p_low_only: Boolean(low), p_product_id: productId || null, p_limit: ADMIN_PAGE_SIZE, p_offset: range.from });
  if (error) dbError("inventory", error);
  const rows = (data || []).map((row) => ({ variant_id: row.variant_id, quantity: row.quantity, low_stock_threshold: row.low_stock_threshold, updated_at: row.updated_at, product_variants: { id: row.variant_id, sku: row.sku, variant_name: row.variant_name, active: row.active, product_id: row.product_id, products: { id: row.product_id, name: row.product_name } } }));
  return result(rows, Number(data?.[0]?.total_count || 0), range.page);
}

export async function getInventoryMovements(limit = 30) {
  const { supabase } = await requireInternal();
  const { data, error } = await supabase.from("inventory_movements").select("id,quantity,movement_type,reason,reference_type,reference_id,created_at,profiles(full_name),product_variants(sku,variant_name,products(name))").order("created_at", { ascending: false }).limit(limit);
  if (error) dbError("movements", error);
  return data || [];
}

export async function getAdminOrders({ query = "", status = "", payment = "", from = "", to = "", page = 1 } = {}) {
  const { supabase } = await requireInternal();
  const range = rangeFor(page);
  let builder = supabase.from("orders").select("id,order_number,status,payment_status,total,currency,delivery_method,created_at,profiles(id,full_name)", { count: "exact" });
  if (query) builder = builder.ilike("order_number", `%${String(query).replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)}%`);
  if (status) builder = builder.eq("status", status);
  if (payment) builder = builder.eq("payment_status", payment);
  if (from) builder = builder.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) builder = builder.lte("created_at", `${to}T23:59:59.999Z`);
  const { data, error, count } = await builder.order("created_at", { ascending: false }).range(range.from, range.to);
  if (error) dbError("orders", error);
  return result(data, count, range.page);
}

export async function getAdminOrder(id) {
  const { supabase } = await requireInternal();
  const { data, error } = await supabase.from("orders").select("id,profile_id,order_number,status,payment_status,subtotal,discount,shipping_total,total,currency,shipping_address,delivery_method,payment_method,created_at,profiles(id,full_name,phone),order_items(id,sku_snapshot,name_snapshot,variant_name_snapshot,unit_price,quantity,line_total),coupon_redemptions(amount_discounted,coupons(code)),payments(id,provider,provider_reference,provider_status,status,amount,currency,processed_at,created_at),shipments(id,status,delivery_method,carrier,tracking_number,estimated_at,shipped_at,delivered_at,notes)").eq("id", id).maybeSingle();
  if (error) dbError("order", error);
  if (!data) return null;
  const admin = createAdminClient();
  const authUser = data.profile_id ? await admin.auth.admin.getUserById(data.profile_id) : null;
  return { ...data, customerEmail: authUser?.data?.user?.email || "" };
}

async function profilesWithEmails(rows) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) dbError("auth-users", error);
  const emails = new Map((data.users || []).map((user) => [user.id, user.email]));
  return rows.map((row) => ({ ...row, email: emails.get(row.id) || "" }));
}

export async function getCustomers({ query = "", page = 1 } = {}) {
  const { supabase } = await requireInternal();
  const range = rangeFor(page);
  let builder = supabase.from("profiles").select("id,full_name,phone,created_at,orders(id,total,payment_status)", { count: "exact" }).eq("role", "customer");
  if (query) {
    const rawSearch = String(query).trim().slice(0, 80);
    const search = sanitizeSearchTerm(rawSearch);
    const admin = createAdminClient();
    const { data: authData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailIds = (authData?.users || []).filter((user) => user.email?.toLowerCase().includes(rawSearch.toLowerCase())).map((user) => user.id);
    builder = builder.or(`full_name.ilike.%${search}%${emailIds.length ? `,id.in.(${emailIds.join(",")})` : ""}`);
  }
  const { data, error, count } = await builder.order("created_at", { ascending: false }).range(range.from, range.to);
  if (error) dbError("customers", error);
  return { ...result(await profilesWithEmails(data || []), count, range.page) };
}

export async function getCustomer(id) {
  const { supabase } = await requireInternal();
  const { data, error } = await supabase.from("profiles").select("id,full_name,phone,role,created_at,addresses(id,label,recipient_name,phone,line_1,line_2,city,state_region,postal_code,country_code,is_default),orders(id,order_number,status,payment_status,total,currency,created_at)").eq("id", id).eq("role", "customer").maybeSingle();
  if (error) dbError("customer", error);
  return data ? (await profilesWithEmails([data]))[0] : null;
}

export async function getInternalUsers() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("profiles").select("id,full_name,phone,role,created_at").order("created_at", { ascending: false }).limit(1000);
  if (error) dbError("users", error);
  return profilesWithEmails(data || []);
}
