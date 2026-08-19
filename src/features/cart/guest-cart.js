export const GUEST_CART_KEY = "importadora-valiente:guest-cart:v1";
export const GUEST_CART_VERSION = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function emptyGuestCart(id = "") {
  return { version: GUEST_CART_VERSION, id, items: [] };
}

export function normalizeGuestCart(value, idFactory = () => "") {
  const id = UUID_PATTERN.test(String(value?.id || "")) ? value.id : idFactory();
  const quantities = new Map();
  if (value?.version === GUEST_CART_VERSION && Array.isArray(value.items)) {
    value.items.slice(0, 50).forEach((item) => {
      const variantId = String(item?.variantId || "");
      const quantity = Number.parseInt(item?.quantity, 10);
      if (variantId && quantity > 0) quantities.set(variantId, Math.min(999, (quantities.get(variantId) || 0) + quantity));
    });
  }
  return { version: GUEST_CART_VERSION, id, items: [...quantities].map(([variantId, quantity]) => ({ variantId, quantity })) };
}

export function addGuestItem(cart, variantId, quantity, stock) {
  const amount = Number.parseInt(quantity, 10);
  if (!variantId || !Number.isInteger(amount) || amount < 1) throw new Error("INVALID_QUANTITY");
  const current = cart.items.find((item) => item.variantId === variantId)?.quantity || 0;
  const nextQuantity = current + amount;
  if (nextQuantity > stock) throw new Error("INSUFFICIENT_STOCK");
  return setGuestQuantity(cart, variantId, nextQuantity, stock);
}

export function setGuestQuantity(cart, variantId, quantity, stock) {
  const amount = Number.parseInt(quantity, 10);
  if (!Number.isInteger(amount) || amount < 1) throw new Error("INVALID_QUANTITY");
  if (amount > stock) throw new Error("INSUFFICIENT_STOCK");
  const exists = cart.items.some((item) => item.variantId === variantId);
  const items = exists
    ? cart.items.map((item) => item.variantId === variantId ? { ...item, quantity: amount } : item)
    : [...cart.items, { variantId, quantity: amount }];
  return { ...cart, items };
}

export function removeGuestItem(cart, variantId) {
  return { ...cart, items: cart.items.filter((item) => item.variantId !== variantId) };
}

export function mergeCartItems(localItems, databaseItems, stockByVariant) {
  const merged = new Map();
  databaseItems.forEach((item) => merged.set(item.variantId, item.quantity));
  localItems.forEach((item) => merged.set(item.variantId, (merged.get(item.variantId) || 0) + item.quantity));
  return [...merged].map(([variantId, quantity]) => ({
    variantId,
    quantity: Math.max(0, Math.min(quantity, stockByVariant[variantId] || 0)),
  })).filter((item) => item.quantity > 0);
}

export function cartUnitCount(items) {
  return items.reduce((total, item) => total + Number(item.quantity || 0), 0);
}
