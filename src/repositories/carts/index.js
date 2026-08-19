import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getProductImageUrl } from "@/features/catalog/catalog-utils";
import { calculateCartSubtotal } from "@/services/checkout/calculations";
import { logServerError } from "@/lib/observability/logger";

function unwrap(value) { return Array.isArray(value) ? value[0] : value; }

export async function validateCartItems(items = []) {
  const normalized = items.slice(0, 50)
    .map((item) => ({ variantId: String(item.variantId || ""), quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1) }))
    .filter((item) => item.variantId);
  if (!normalized.length) return { items: [], subtotal: 0, warnings: [] };

  const ids = [...new Set(normalized.map((item) => item.variantId))];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select(`id, sku, variant_name, price, active, inventory(quantity, low_stock_threshold), products!inner(id, name, slug, active, product_images(id, storage_path, alt_text, sort_order, is_primary))`)
    .in("id", ids)
    .eq("active", true)
    .eq("products.active", true);
  if (error) {
    logServerError("cart.validation.failed", error, { repository: "carts", operation: "validate" });
    throw new Error("CART_UNAVAILABLE");
  }

  const rows = new Map((data || []).map((row) => [row.id, row]));
  const warnings = [];
  const detailed = normalized.map((raw) => {
    const row = rows.get(raw.variantId);
    if (!row) {
      warnings.push("Un producto del carrito ya no está disponible.");
      return { variantId: raw.variantId, quantity: raw.quantity, available: false };
    }
    const product = unwrap(row.products);
    const inventory = unwrap(row.inventory) || {};
    const stock = Number(inventory.quantity || 0);
    const quantity = Math.min(raw.quantity, Math.max(stock, 1));
    if (stock < 1) warnings.push(`${product.name} está agotado.`);
    else if (quantity !== raw.quantity) warnings.push(`Ajustamos ${product.name} al stock disponible.`);
    const images = [...(product.product_images || [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
    return {
      variantId: row.id,
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      variantName: row.variant_name,
      sku: row.sku,
      price: Number(row.price),
      quantity,
      requestedQuantity: raw.quantity,
      stock,
      available: stock > 0,
      productActive: true,
      variantActive: true,
      imageUrl: getProductImageUrl(images[0]?.storage_path),
      imageAlt: images[0]?.alt_text || product.name,
      lineTotal: Number(row.price) * quantity,
    };
  });
  return { items: detailed, subtotal: calculateCartSubtotal(detailed.filter((item) => item.available)), warnings };
}

export async function getAuthenticatedCart() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data, error } = await supabase
    .from("carts")
    .select("id, cart_items(variant_id, quantity)")
    .eq("profile_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("CART_UNAVAILABLE");
  const rawItems = (data?.cart_items || []).map((item) => ({ variantId: item.variant_id, quantity: item.quantity }));
  const validated = await validateCartItems(rawItems);
  return { id: data?.id || null, rawItems, ...validated };
}
