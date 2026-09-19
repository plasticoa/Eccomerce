"use server";
import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";
import { logServerError } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { PAYMENT_METHODS } from "@/services/checkout/calculations";
import { isUuid } from "@/lib/validation/purchase";

function checkoutError(error) {
  const message = String(error?.message || "");
  if (message.includes("EMPTY_CART")) return "Tu carrito está vacío.";
  if (message.includes("ADDRESS_NOT_FOUND")) return "Selecciona una dirección válida.";
  if (message.includes("INSUFFICIENT_STOCK")) return "Cambió la disponibilidad de uno de los productos. Revisa tu carrito.";
  if (message.includes("UNAVAILABLE")) return "Uno de los productos ya no está disponible.";
  if (message.includes("COUPON_NOT_FOUND")) return "El cupón no existe.";
  if (message.includes("COUPON_INACTIVE")) return "El cupón está inactivo.";
  if (message.includes("COUPON_EXPIRED")) return "El cupón expiró.";
  if (message.includes("COUPON_NOT_STARTED")) return "El cupón todavía no está vigente.";
  if (message.includes("COUPON_MINIMUM")) return "El pedido no alcanza el monto mínimo del cupón.";
  if (message.includes("COUPON_LIMIT_REACHED")) return "El cupón alcanzó su límite de usos.";
  return "No pudimos crear el pedido. Revisa los datos e intenta nuevamente.";
}

export async function createOrderAction(_state, formData) {
  if (!(await getCurrentUser())) return { error: "Tu sesión expiró. Inicia sesión nuevamente." };
  const addressId = String(formData.get("addressId") || "");
  const deliveryMethod = String(formData.get("deliveryMethod") || "");
  const paymentMethod = String(formData.get("paymentMethod") || "");
  const checkoutToken = String(formData.get("checkoutToken") || "");
  const couponCode=String(formData.get("couponCode")||"").trim().toUpperCase();
  if (!isUuid(addressId) || !isUuid(checkoutToken) || !/^[a-z_]{3,40}$/.test(deliveryMethod) || !PAYMENT_METHODS[paymentMethod] || (couponCode&&!/^[A-Z0-9_-]{3,40}$/.test(couponCode))) return { error: "Completa las opciones del pedido." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order_from_cart", {
    p_address_id: addressId, p_delivery_method: deliveryMethod,
    p_payment_method: paymentMethod, p_checkout_token: checkoutToken,p_coupon_code:couponCode||null,
  });
  if (error || !data?.orderNumber) {
    logServerError("checkout.order.failed", error, { action: "createOrder", result: "failed" });
    return { error: checkoutError(error) };
  }
  revalidatePath("/", "layout");
  redirect(`/pedido/confirmacion/${encodeURIComponent(data.orderNumber)}`);
}
