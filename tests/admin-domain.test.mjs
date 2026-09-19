import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADMIN_ROLES,
  allowedOrderTransitions,
  validateInventoryAdjustment,
  validateProductInput,
  validateVariantInput,
} from "../src/lib/validation/admin.js";

const migration = readFileSync(new URL("../supabase/migrations/202608100005_admin.sql", import.meta.url), "utf8");
const initial = readFileSync(new URL("../supabase/migrations/202608100001_initial_schema.sql", import.meta.url), "utf8");
const adminLayout = readFileSync(new URL("../src/app/admin/layout.js", import.meta.url), "utf8");
const adminOnlyLayout = readFileSync(new URL("../src/components/admin/admin-only-layout.js", import.meta.url), "utf8");

test("producto y variante validan slug, SKU, precio y precio comparativo", () => {
  assert.ok(validateProductInput({ name: "Taladro", slug: "taladro-700", active: true }).data);
  assert.match(validateProductInput({ name: "Taladro", slug: "No válido" }).error, /slug/i);
  assert.ok(validateVariantInput({ sku: "HER-700", variantName: "700 W", price: "250", compareAtPrice: "300", lowStockThreshold: "5", active: true }).data);
  assert.match(validateVariantInput({ sku: "?", variantName: "Única", price: "-1", lowStockThreshold: "0" }).error, /SKU/);
  assert.match(validateVariantInput({ sku: "HER-700", variantName: "Única", price: "250", compareAtPrice: "200", lowStockThreshold: "0" }).error, /comparativo/);
});

test("ajustes exigen cantidad positiva, tipo permitido y motivo", () => {
  assert.deepEqual(validateInventoryAdjustment({ quantity: "3", movementType: "out", reason: "Daño en bodega" }).data, { quantity: 3, movementType: "out", reason: "Daño en bodega" });
  assert.match(validateInventoryAdjustment({ quantity: "0", movementType: "out", reason: "Daño" }).error, /cantidad/i);
  assert.match(validateInventoryAdjustment({ quantity: "1", movementType: "delete", reason: "Daño" }).error, /tipo/i);
  assert.match(validateInventoryAdjustment({ quantity: "1", movementType: "in", reason: "" }).error, /motivo/i);
});

test("transiciones administrativas rechazan retrocesos arbitrarios", () => {
  assert.deepEqual(allowedOrderTransitions("confirmed"), ["processing", "cancelled"]);
  assert.deepEqual(allowedOrderTransitions("shipped"), ["delivered", "cancelled"]);
  assert.deepEqual(allowedOrderTransitions("delivered"), []);
  assert.equal(ADMIN_ROLES.includes("root"), false);
});

test("inventario se ajusta con bloqueo, registro y prohibición de negativos", () => {
  assert.match(migration, /from public\.inventory where variant_id=p_variant_id for update/i);
  assert.match(migration, /if v_new < 0 then raise exception 'INSUFFICIENT_STOCK'/i);
  assert.match(migration, /insert into public\.inventory_movements/i);
  assert.match(migration, /revoke insert, update, delete on public\.inventory/i);
});

test("roles y estados se autorizan en base de datos y quedan auditados", () => {
  assert.match(migration, /if not public\.is_admin\(\) then raise exception 'ADMIN_FORBIDDEN'/i);
  assert.match(migration, /if v_admins <= 1 then raise exception 'LAST_ADMIN'/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /'profile\.role_changed'/i);
  assert.match(migration, /'order\.status_changed'/i);
  assert.match(migration, /v_old='shipped' and p_next_status='delivered'/i);
});

test("operator conserva lectura operativa sin mutaciones críticas", () => {
  assert.match(migration, /create policy orders_internal_read/i);
  assert.match(migration, /create policy products_admin_write[\s\S]*public\.is_admin/i);
  assert.match(migration, /create policy admin_assets_insert[\s\S]*public\.is_admin/i);
  assert.match(migration, /revoke insert, update, delete[\s\S]*public\.payments[\s\S]*from authenticated/i);
});

test("rutas distinguen customer, operator y admin en servidor", () => {
  assert.match(adminLayout, /\["operator", "admin"\]\.includes\(profile\.role\)/);
  assert.match(adminLayout, /redirect\("\/no-autorizado"\)/);
  assert.match(adminOnlyLayout, /profile\?\.role !== "admin"/);
  assert.match(adminOnlyLayout, /redirect\("\/no-autorizado"\)/);
});

test("SKU y slug conservan unicidad de base de datos", () => {
  assert.match(initial, /slug text not null unique/i);
  assert.match(initial, /sku text not null unique/i);
});
