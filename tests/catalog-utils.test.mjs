import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCurrency,
  getProductAvailability,
  getVariantAvailability,
  normalizeProduct,
  parseCatalogParams,
  sanitizeSearchTerm,
} from "../src/features/catalog/catalog-utils.js";

test("formatCurrency presenta quetzales de forma consistente", () => {
  assert.match(formatCurrency(125.5), /125\.50/);
  assert.match(formatCurrency(125.5), /Q|GTQ/);
});

test("sanitizeSearchTerm limita longitud y elimina operadores de PostgREST", () => {
  const result = sanitizeSearchTerm("  taladro%25,(sku.eq.X)   profesional  ");
  assert.equal(result, "taladro 25 sku eq X profesional");
  assert.ok(sanitizeSearchTerm("a".repeat(200)).length <= 80);
});

test("parseCatalogParams valida página, slug, precios y disponibilidad", () => {
  assert.deepEqual(parseCatalogParams({ page: "-2", categoria: "Hogar!", min: "500", max: "100", disponible: "true" }), {
    page: 1,
    query: "",
    category: "",
    minPrice: 100,
    maxPrice: 500,
    availableOnly: true,
  });
});

test("disponibilidad distingue disponible, pocas unidades y agotado", () => {
  assert.equal(getVariantAvailability({ active: true, quantity: 8, lowStockThreshold: 2 }).key, "available");
  assert.equal(getVariantAvailability({ active: true, quantity: 2, lowStockThreshold: 2 }).key, "low");
  assert.equal(getVariantAvailability({ active: true, quantity: 0, lowStockThreshold: 2 }).key, "out");
  assert.equal(getProductAvailability([{ active: true, quantity: 0, lowStockThreshold: 2 }]).key, "out");
});

test("normalizeProduct filtra variantes inactivas y calcula rango mínimo", () => {
  const product = normalizeProduct({
    id: "p1",
    name: "Producto",
    slug: "producto",
    product_variants: [
      { id: "v1", sku: "A", variant_name: "A", price: "120", compare_at_price: null, active: true, inventory: { quantity: 1, low_stock_threshold: 2 } },
      { id: "v2", sku: "B", variant_name: "B", price: "100", compare_at_price: "130", active: true, inventory: { quantity: 4, low_stock_threshold: 2 } },
      { id: "v3", sku: "C", variant_name: "C", price: "20", compare_at_price: null, active: false, inventory: { quantity: 9, low_stock_threshold: 2 } },
    ],
    product_images: [],
    product_categories: [],
  });
  assert.equal(product.variants.length, 2);
  assert.equal(product.minPrice, 100);
  assert.equal(product.maxPrice, 120);
  assert.equal(product.hasPriceRange, true);
  assert.equal(product.compareAtPrice, 130);
});
