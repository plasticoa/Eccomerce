"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getAuthenticatedCart, validateCartItems } from "@/repositories/carts";
import { isUuid, parseQuantity } from "@/lib/validation/purchase";

function cartError(error) {
  const message = String(error?.message || "");
  if (message.includes("INSUFFICIENT_STOCK")) return "La cantidad supera las existencias disponibles.";
  if (message.includes("VARIANT_UNAVAILABLE")) return "Esta variante ya no está disponible.";
  if (message.includes("CART_ITEM_NOT_FOUND")) return "El artículo ya no está en el carrito.";
  return "No pudimos actualizar el carrito. Intenta nuevamente.";
}

export async function validateGuestCartAction(items) {
  try { return { success: true, cart: await validateCartItems(Array.isArray(items) ? items : []) }; }
  catch { return { success: false, error: "No pudimos validar el carrito." }; }
}

export async function validateCartQuantityAction(variantId, quantity) {
  const parsed = parseQuantity(quantity);
  if (!isUuid(variantId) || !parsed) return { success: false, error: "Cantidad no válida." };
  const cart = await validateCartItems([{ variantId, quantity: parsed }]);
  const item = cart.items[0];
  if (!item?.available) return { success: false, error: "Esta variante ya no está disponible." };
  if (parsed > item.stock) return { success: false, error: "La cantidad supera las existencias disponibles." };
  return { success: true, stock: item.stock };
}

export async function getCartAction() {
  try { return { success: true, cart: await getAuthenticatedCart() }; }
  catch { return { success: false, error: "No pudimos cargar el carrito." }; }
}

export async function reconcileCartAction() {
  if (!(await getCurrentUser())) return { success: false, error: "Sesión no válida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reconcile_active_cart");
  if (error) return { success: false, error: cartError(error) };
  if (Number(data) > 0) revalidatePath("/carrito");
  return { success: true, updated: Number(data) || 0 };
}

export async function addCartItemAction(variantId, quantity) {
  if (!(await getCurrentUser())) return { success: false, error: "Inicia sesión para usar este carrito." };
  const parsed = parseQuantity(quantity);
  if (!isUuid(variantId) || !parsed) return { success: false, error: "Cantidad no válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cart_add_item", { p_variant_id: variantId, p_quantity: parsed });
  if (error) return { success: false, error: cartError(error) };
  revalidatePath("/carrito");
  return { success: true };
}

export async function updateCartQuantityAction(variantId, quantity) {
  if (!(await getCurrentUser())) return { success: false, error: "Sesión no válida." };
  const parsed = parseQuantity(quantity);
  if (!isUuid(variantId) || !parsed) return { success: false, error: "Cantidad no válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cart_set_quantity", { p_variant_id: variantId, p_quantity: parsed });
  if (error) return { success: false, error: cartError(error) };
  revalidatePath("/carrito");
  return { success: true };
}

export async function removeCartItemAction(variantId) {
  if (!(await getCurrentUser()) || !isUuid(variantId)) return { success: false, error: "Solicitud no válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cart_remove_item", { p_variant_id: variantId });
  if (error) return { success: false, error: cartError(error) };
  revalidatePath("/carrito");
  return { success: true };
}

export async function mergeGuestCartAction(guestCart) {
  if (!(await getCurrentUser())) return { success: false, error: "Sesión no válida." };
  if (!isUuid(guestCart?.id) || !Array.isArray(guestCart?.items) || guestCart.items.length > 50) return { success: false, error: "Carrito local no válido." };
  const items = guestCart.items.map((item) => ({ variantId: String(item.variantId), quantity: parseQuantity(item.quantity) })).filter((item) => isUuid(item.variantId) && item.quantity);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("merge_guest_cart", { p_items: items, p_merge_token: guestCart.id });
  if (error) return { success: false, error: cartError(error) };
  revalidatePath("/carrito");
  return { success: true, result: data };
}
