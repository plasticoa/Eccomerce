import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addGuestItem,
  emptyGuestCart,
  mergeCartItems,
  normalizeGuestCart,
  removeGuestItem,
  setGuestQuantity,
} from "../src/features/cart/guest-cart.js";
import {
  calculateCartSubtotal,
  calculateCheckoutTotals,
  validateCheckoutItems,
} from "../src/services/checkout/calculations.js";
import { parseQuantity, safeInternalPath, validateAddressInput, validateProfileInput } from "../src/lib/validation/purchase.js";

const initialSql = readFileSync(new URL("../supabase/migrations/202608100001_initial_schema.sql", import.meta.url), "utf8");
const purchaseSql = readFileSync(new URL("../supabase/migrations/202608100003_purchase_flow.sql", import.meta.url), "utf8");

test("carrito local agrega, incrementa y elimina una variante", () => {
  let cart = emptyGuestCart("cart-1");
  cart = addGuestItem(cart, "variant-a", 2, 8);
  cart = addGuestItem(cart, "variant-a", 3, 8);
  assert.deepEqual(cart.items, [{ variantId: "variant-a", quantity: 5 }]);
  cart = removeGuestItem(cart, "variant-a");
  assert.deepEqual(cart.items, []);
});

test("carrito aplica cantidad mínima y límite de stock", () => {
  const cart = { version: 1, id: "cart-1", items: [{ variantId: "variant-a", quantity: 1 }] };
  assert.equal(parseQuantity(0), null);
  assert.throws(() => setGuestQuantity(cart, "variant-a", 0, 5), /INVALID_QUANTITY/);
  assert.throws(() => setGuestQuantity(cart, "variant-a", 6, 5), /INSUFFICIENT_STOCK/);
});

test("normalización conserva formato versionado y descarta entradas inválidas", () => {
  const cart = normalizeGuestCart({ version: 1, id: "invalid", items: [{ variantId: "a", quantity: 2 }, { variantId: "a", quantity: 1 }, { variantId: "b", quantity: 0 }] }, () => "123e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual(cart, { version: 1, id: "123e4567-e89b-42d3-a456-426614174000", items: [{ variantId: "a", quantity: 3 }] });
});

test("subtotal se recalcula desde precios vigentes", () => {
  const items = [{ price: 25.5, quantity: 2 }, { price: 10, quantity: 3 }];
  assert.equal(calculateCartSubtotal(items), 81);
  const priceChanged = [{ price: 30, quantity: 2 }];
  assert.equal(calculateCartSubtotal(priceChanged), 60);
});

test("merge cubre carritos vacíos, suma coincidencias y no duplica líneas", () => {
  assert.deepEqual(mergeCartItems([], [], {}), []);
  assert.deepEqual(mergeCartItems([{ variantId: "a", quantity: 2 }], [], { a: 5 }), [{ variantId: "a", quantity: 2 }]);
  assert.deepEqual(mergeCartItems([], [{ variantId: "a", quantity: 2 }], { a: 5 }), [{ variantId: "a", quantity: 2 }]);
  assert.deepEqual(mergeCartItems([{ variantId: "a", quantity: 3 }], [{ variantId: "a", quantity: 4 }], { a: 5 }), [{ variantId: "a", quantity: 5 }]);
});

test("checkout rechaza carrito vacío, producto/variante inactivos y stock insuficiente", () => {
  assert.equal(validateCheckoutItems([]).error, "EMPTY_CART");
  assert.equal(validateCheckoutItems([{ productActive: false, variantActive: true, quantity: 1, stock: 3 }]).error, "PRODUCT_UNAVAILABLE");
  assert.equal(validateCheckoutItems([{ productActive: true, variantActive: false, quantity: 1, stock: 3 }]).error, "VARIANT_UNAVAILABLE");
  assert.equal(validateCheckoutItems([{ productActive: true, variantActive: true, quantity: 4, stock: 3 }]).error, "INSUFFICIENT_STOCK");
});

test("checkout calcula descuento cero, envío local, retiro y total", () => {
  const items = [{ price: 100, quantity: 2 }, { price: 25, quantity: 1 }];
  assert.deepEqual(calculateCheckoutTotals(items, "local_delivery"), { subtotal: 225, discount: 0, shipping: 35, total: 260 });
  assert.deepEqual(calculateCheckoutTotals(items, "store_pickup"), { subtotal: 225, discount: 0, shipping: 0, total: 225 });
});

test("validación limita perfil/dirección y evita redirects externos", () => {
  assert.deepEqual(validateProfileInput({ fullName: "Ana López", phone: "55551234" }).data, { full_name: "Ana López", phone: "55551234" });
  assert.ok(validateAddressInput({ recipientName: "Ana", line1: "Zona 1, calle 2", city: "Guatemala" }).data);
  assert.equal(safeInternalPath("/checkout"), "/checkout");
  assert.equal(safeInternalPath("//evil.example", "/cuenta"), "/cuenta");
});

test("migración crea pedido atómico con identidad, precios y snapshots de servidor", () => {
  assert.match(purchaseSql, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(purchaseSql, /variant\.price \* item\.quantity/);
  assert.match(purchaseSql, /sku_snapshot, name_snapshot, variant_name_snapshot/);
  assert.match(purchaseSql, /to_jsonb\(v_address\)/);
  assert.match(purchaseSql, /'pending', 'pending'/);
  assert.match(purchaseSql, /insert into public\.shipments/);
  assert.doesNotMatch(purchaseSql, /update public\.inventory\s+set/i);
  assert.doesNotMatch(purchaseSql, /insert into public\.inventory_movements/i);
});

test("número e idempotencia de pedido tienen defensas de base de datos", () => {
  assert.match(initialSql, /order_number text not null unique/);
  assert.match(purchaseSql, /create sequence public\.order_number_seq/);
  assert.match(purchaseSql, /orders_profile_checkout_token_unique/);
  assert.match(purchaseSql, /where profile_id = v_user_id and checkout_token = p_checkout_token/);
});

test("RLS limita datos privados y el cliente no puede escribir pedidos/totales", () => {
  assert.match(initialSql, /addresses_owner_all[\s\S]*profile_id = auth\.uid\(\)/);
  assert.match(initialSql, /orders_owner_read[\s\S]*profile_id = auth\.uid\(\)/);
  assert.match(initialSql, /order_items_owner_read[\s\S]*o\.profile_id = auth\.uid\(\)/);
  assert.match(initialSql, /shipments_owner_read[\s\S]*o\.profile_id = auth\.uid\(\)/);
  assert.match(purchaseSql, /drop policy if exists carts_owner_all/);
  assert.match(purchaseSql, /create policy carts_owner_read/);
  assert.match(purchaseSql, /revoke all on function public\.create_order_from_cart[\s\S]*from public, anon/);
  assert.doesNotMatch(initialSql, /create policy orders_owner_(insert|update|delete|all)/);
});
