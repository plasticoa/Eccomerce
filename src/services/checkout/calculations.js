export const DELIVERY_METHODS = {
  local_delivery: { id: "local_delivery", label: "Entrega local", description: "Entrega coordinada dentro del área disponible.", price: 35 },
  store_pickup: { id: "store_pickup", label: "Retiro en tienda", description: "Sin costo. Coordinaremos cuándo estará listo.", price: 0 },
};

export const PAYMENT_METHODS = {
  pending_gateway: { id: "pending_gateway", label: "Pago pendiente", description: "No se realizará ningún cobro en esta etapa." },
};

export function calculateCartSubtotal(items) {
  return items.reduce((total, item) => total + Number(item.price) * Number(item.quantity), 0);
}

export function calculateCheckoutTotals(items, deliveryMethod) {
  if (!items.length) throw new Error("EMPTY_CART");
  const method = DELIVERY_METHODS[deliveryMethod];
  if (!method) throw new Error("INVALID_DELIVERY_METHOD");
  const subtotal = calculateCartSubtotal(items);
  const discount = 0;
  const shipping = method.price;
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}

export function validateCheckoutItems(items) {
  if (!items.length) return { valid: false, error: "EMPTY_CART" };
  for (const item of items) {
    if (!item.productActive) return { valid: false, error: "PRODUCT_UNAVAILABLE" };
    if (!item.variantActive) return { valid: false, error: "VARIANT_UNAVAILABLE" };
    if (item.quantity < 1) return { valid: false, error: "INVALID_QUANTITY" };
    if (item.quantity > item.stock) return { valid: false, error: "INSUFFICIENT_STOCK" };
  }
  return { valid: true };
}
