const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;

function optionalSeoText(value, max) {
  const text = String(value || "").trim();
  if (text.length > max) return null;
  return text || null;
}

export const ADMIN_ROLES = ["customer", "operator", "admin"];
export const ORDER_TRANSITIONS = {
  pending: ["cancelled"],
  confirmed: ["processing"],
  processing: ["shipped"],
  shipped: ["delivered"],
  payment_review: [],
};

export function isAdminUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

export function normalizeAdminPage(value) {
  return Math.max(1, Number.parseInt(value, 10) || 1);
}

export function validateCategoryInput(input) {
  const name = String(input.name || "").trim();
  const slug = String(input.slug || "").trim().toLowerCase();
  const seoTitle = optionalSeoText(input.seoTitle, 70);
  const seoDescription = optionalSeoText(input.seoDescription, 170);
  if (name.length < 2 || name.length > 120) return { error: "Ingresa un nombre válido." };
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) return { error: "El slug solo puede contener letras minúsculas, números y guiones." };
  if (input.seoTitle && seoTitle == null) return { error: "El título SEO no puede superar 70 caracteres." };
  if (input.seoDescription && seoDescription == null) return { error: "La descripción SEO no puede superar 170 caracteres." };
  return { data: { name, slug, description: String(input.description || "").trim() || null, seo_title: seoTitle, seo_description: seoDescription, active: Boolean(input.active) } };
}

export function validateProductInput(input) {
  const name = String(input.name || "").trim();
  const slug = String(input.slug || "").trim().toLowerCase();
  const seoTitle = optionalSeoText(input.seoTitle, 70);
  const seoDescription = optionalSeoText(input.seoDescription, 170);
  if (name.length < 2 || name.length > 180) return { error: "Ingresa un nombre válido." };
  if (!SLUG_PATTERN.test(slug) || slug.length > 180) return { error: "El slug no tiene un formato válido." };
  if (input.seoTitle && seoTitle == null) return { error: "El título SEO no puede superar 70 caracteres." };
  if (input.seoDescription && seoDescription == null) return { error: "La descripción SEO no puede superar 170 caracteres." };
  return { data: { name, slug, description: String(input.description || "").trim() || null, seoTitle, seoDescription, active: Boolean(input.active) } };
}

export function validateVariantInput(input) {
  const sku = String(input.sku || "").trim().toUpperCase();
  const variantName = String(input.variantName || "").trim();
  const price = Number(input.price);
  const compareAt = input.compareAtPrice === "" || input.compareAtPrice == null ? null : Number(input.compareAtPrice);
  const threshold = Number.parseInt(input.lowStockThreshold, 10);
  if (!SKU_PATTERN.test(sku)) return { error: "El SKU debe tener entre 2 y 64 caracteres válidos." };
  if (!variantName || variantName.length > 120) return { error: "Ingresa un nombre de variante válido." };
  if (!Number.isFinite(price) || price < 0) return { error: "El precio debe ser igual o mayor que cero." };
  if (compareAt != null && (!Number.isFinite(compareAt) || compareAt < price)) return { error: "El precio comparativo debe ser igual o mayor al precio." };
  if (!Number.isInteger(threshold) || threshold < 0) return { error: "El umbral de stock no es válido." };
  return { data: { sku, variantName, price, compareAtPrice: compareAt, lowStockThreshold: threshold, active: Boolean(input.active) } };
}

export function validateInventoryAdjustment(input) {
  const quantity = Number.parseInt(input.quantity, 10);
  const movementType = String(input.movementType || "");
  const reason = String(input.reason || "").trim();
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: "La cantidad debe ser un entero mayor que cero." };
  if (!["in", "out", "adjustment"].includes(movementType)) return { error: "Selecciona un tipo de movimiento válido." };
  if (reason.length < 3 || reason.length > 300) return { error: "El motivo es obligatorio y debe ser claro." };
  return { data: { quantity, movementType, reason } };
}

export function allowedOrderTransitions(status) {
  return ORDER_TRANSITIONS[status] || [];
}
