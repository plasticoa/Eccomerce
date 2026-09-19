import "server-only";
import { requireUser } from "@/lib/auth";
import { logServerError } from "@/lib/observability/logger";

const ORDER_SELECT = `id, order_number, status, payment_status, subtotal, discount, shipping_total, total, currency, shipping_address, delivery_method, payment_method, created_at, order_items(id, sku_snapshot, name_snapshot, variant_name_snapshot, unit_price, quantity, line_total), coupon_redemptions(amount_discounted, coupons(code)), payments(id, provider, provider_reference, provider_status, status, amount, currency, error_code, processed_at, created_at), shipments(id, status, delivery_method, shipping_cost, tracking_number, estimated_at, shipped_at, delivered_at)`;

export async function getOrders() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("orders").select("id, order_number, status, payment_status, total, currency, created_at").eq("profile_id", user.id).order("created_at", { ascending: false });
  if (error) {
    logServerError("account.orders.failed", error);
    throw new Error("ORDERS_UNAVAILABLE");
  }
  return data || [];
}

export async function getOrderByNumber(orderNumber) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("profile_id", user.id).eq("order_number", orderNumber).maybeSingle();
  if (error) {
    logServerError("account.order.failed", error);
    throw new Error("ORDER_UNAVAILABLE");
  }
  return data || null;
}
