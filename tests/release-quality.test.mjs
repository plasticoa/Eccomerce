import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildPublicMetadata } from "../src/lib/seo.js";
import { getSiteUrl, normalizeSiteUrl } from "../src/lib/site-url.js";
import { validateCategoryInput, validateProductInput } from "../src/lib/validation/admin.js";
import { validateSiteSettingsInput } from "../src/lib/validation/settings.js";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/202608100007_release_hardening_seo.sql"), "utf8");
const initial = readFileSync(join(root, "supabase/migrations/202608100001_initial_schema.sql"), "utf8");
const payments = readFileSync(join(root, "supabase/migrations/202608100004_payments_inventory.sql"), "utf8");
const admin = readFileSync(join(root, "supabase/migrations/202608100005_admin.sql"), "utf8");
const sitemap = readFileSync(join(root, "src/app/sitemap.js"), "utf8");
const robots = readFileSync(join(root, "src/app/robots.js"), "utf8");

function filesBelow(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesBelow(join(path, entry.name)) : [join(path, entry.name)]);
}

test("SEO valida títulos, descripciones y dominio canónico", () => {
  assert.match(validateProductInput({ name: "Taladro", slug: "taladro", seoTitle: "T".repeat(71) }).error, /70/);
  assert.match(validateCategoryInput({ name: "Hogar", slug: "hogar", seoDescription: "D".repeat(171) }).error, /170/);
  const settings = validateSiteSettingsInput({ storeName: "Valiente", primaryColor: "#112233", secondaryColor: "#223344", accentColor: "#334455", currency: "GTQ", canonicalDomain: "https://tienda.example/", seoTitle: "Catálogo", seoDescription: "Productos" });
  assert.equal(settings.data.seo.canonicalDomain, "https://tienda.example");
});

test("metadata pública genera canonical, Open Graph y Twitter sin dominio hardcodeado", () => {
  const settings = { storeName: "Valiente", seo: { title: "Valiente", description: "Catálogo", canonicalDomain: "https://tienda.example", socialImage: "/social.jpg" } };
  const metadata = buildPublicMetadata({ settings, title: "Taladro", path: "/productos/taladro" });
  assert.equal(metadata.alternates.canonical, "https://tienda.example/productos/taladro");
  assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
  assert.equal(metadata.twitter.card, "summary_large_image");
});

test("URL productiva ausente falla con un error explícito", () => {
  assert.equal(normalizeSiteUrl("javascript:alert(1)"), null);
  assert.throws(() => getSiteUrl({ NODE_ENV: "production" }), /NEXT_PUBLIC_SITE_URL/);
  assert.equal(getSiteUrl({ NODE_ENV: "development" }), "http://localhost:3000");
});

test("migración agrega SEO, límites e índices derivados de consultas reales", () => {
  assert.match(migration, /add column if not exists seo_title/i);
  assert.match(migration, /products_public_updated_idx/i);
  assert.match(migration, /orders_profile_created_at_idx/i);
  assert.match(migration, /payment_webhook_events_received_at_idx/i);
  assert.match(migration, /product\.created/i);
  assert.match(migration, /site_settings\.updated/i);
});

test("todas las tablas privadas principales tienen RLS y propiedad por auth.uid", () => {
  for (const table of ["profiles", "addresses", "carts", "cart_items", "orders", "order_items", "payments", "shipments", "coupon_redemptions", "audit_logs"]) {
    assert.match(initial + payments, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(initial, /orders_owner_read[\s\S]*profile_id = auth\.uid\(\)/i);
  assert.match(initial, /addresses_owner_all[\s\S]*profile_id = auth\.uid\(\)/i);
  assert.match(initial, /profiles_owner_read[\s\S]*id = auth\.uid\(\)/i);
});

test("operator queda en lectura y mutaciones críticas requieren admin o RPC", () => {
  assert.match(admin, /drop policy if exists products_internal_all/i);
  assert.match(admin, /products_internal_read[\s\S]*public\.is_internal_user/i);
  assert.match(admin, /products_admin_write[\s\S]*public\.is_admin/i);
  assert.match(admin, /revoke insert, update, delete on public\.inventory[\s\S]*public\.payments[\s\S]*from authenticated/i);
});

test("webhook conserva autenticidad, idempotencia y stock transaccional", () => {
  assert.match(payments, /unique\(provider, provider_event_id\)/i);
  assert.match(payments, /on conflict \(provider, provider_event_id\) do nothing/i);
  assert.match(payments, /for update of stock/i);
  assert.match(payments, /quantity >= v_line\.quantity/i);
  assert.match(payments, /grant execute on function public\.process_payment_webhook[\s\S]*to service_role/i);
});

test("sitemap y robots excluyen superficies privadas y filtran publicación", () => {
  assert.match(sitemap, /\/productos\/\$\{product\.slug\}/);
  assert.match(sitemap, /\/categorias\/\$\{category\.slug\}/);
  assert.doesNotMatch(sitemap, /\/admin|\/checkout|\/cuenta/);
  assert.match(readFileSync(join(root, "src/repositories/seo/index.js"), "utf8"), /\.eq\("active", true\)[\s\S]*product_variants\.active/i);
  for (const path of ["/admin/", "/cuenta/", "/checkout", "/api/"]) assert.match(robots, new RegExp(path.replaceAll("/", "\\/")));
});

test("componentes cliente no importan ni nombran service role", () => {
  const clientFiles = filesBelow(join(root, "src")).filter((file) => file.endsWith(".js") && /^\s*["']use client["'];/m.test(readFileSync(file, "utf8")));
  assert.ok(clientFiles.length > 0);
  for (const file of clientFiles) assert.doesNotMatch(readFileSync(file, "utf8"), /SUPABASE_SERVICE_ROLE_KEY|supabase\/admin/i, file);
});

test("caché pública tiene tags y las acciones administrativas los invalidan", () => {
  const settingsRepository = readFileSync(join(root, "src/repositories/settings/index.js"), "utf8");
  const productRepository = readFileSync(join(root, "src/repositories/products/index.js"), "utf8");
  const actions = readFileSync(join(root, "src/features/admin/actions.js"), "utf8");
  assert.match(settingsRepository, /unstable_cache[\s\S]*site-settings/);
  assert.match(productRepository, /unstable_cache[\s\S]*catalog-products/);
  assert.match(actions, /updateTag\("catalog-products"\)/);
  assert.match(actions, /updateTag\("catalog-categories"\)/);
});
