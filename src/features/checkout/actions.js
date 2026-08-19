"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { DELIVERY_METHODS, PAYMENT_METHODS } from "@/services/checkout/calculations";
import { isUuid } from "@/lib/validation/purchase";

function checkoutError(error) {
  const message = String(error?.message || "");
  if (message.includes("EMPTY_CART")) return "Tu carrito está vacío.";
  if (message.includes("ADDRESS_NOT_FOUND")) return "Selecciona una dirección válida.";
  if (message.includes("INSUFFICIENT_STOCK")) return "Cambió la disponibilidad de uno de los productos. Revisa tu carrito.";
  if (message.includes("UNAVAILABLE")) return "Uno de los productos ya no está disponible.";
  return "No pudimos crear el pedido. Revisa los datos e intenta nuevamente.";
}

export async function createOrderAction(_state, formData) {
  if (!(await getCurrentUser())) return { error: "Tu sesión expiró. Inicia sesión nuevamente." };
  const addressId = String(formData.get("addressId") || "");
  const deliveryMethod = String(formData.get("deliveryMethod") || "");
  const paymentMethod = String(formData.get("paymentMethod") || "");
  const checkoutToken = String(formData.get("checkoutToken") || "");
  if (!isUuid(addressId) || !isUuid(checkoutToken) || !DELIVERY_METHODS[deliveryMethod] || !PAYMENT_METHODS[paymentMethod]) return { error: "Completa las opciones del pedido." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order_from_cart", {
    p_address_id: addressId, p_delivery_method: deliveryMethod,
    p_payment_method: paymentMethod, p_checkout_token: checkoutToken,
  });
  if (error || !data?.orderNumber) {
    console.error("[checkout:create-order]", { code: error?.code || "NO_ORDER_NUMBER" });
    return { error: checkoutError(error) };
  }
  redirect(`/pedido/confirmacion/${encodeURIComponent(data.orderNumber)}`);
}
