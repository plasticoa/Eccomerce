export const DEFAULT_CURRENCY = "GTQ";
export const CATALOG_PAGE_SIZE = 12;
export const MAX_SEARCH_LENGTH = 80;

export function formatCurrency(value, currency = DEFAULT_CURRENCY, locale = "es-GT") {
  const amount = Number(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function sanitizeSearchTerm(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
}

function parsePrice(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(number, 1000000);
}

export function parseCatalogParams(params = {}) {
  const rawPage = Number.parseInt(params.page, 10);
  let minPrice = parsePrice(params.min);
  let maxPrice = parsePrice(params.max);
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  const rawCategory = String(params.categoria || "").trim().toLowerCase();
  const category = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawCategory) ? rawCategory : "";

  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, 10000) : 1,
    query: sanitizeSearchTerm(params.q),
    category,
    minPrice,
    maxPrice,
    availableOnly: params.disponible === "true",
  };
}

export function getVariantAvailability(variant) {
  const quantity = Number(variant?.quantity || 0);
  const threshold = Number(variant?.lowStockThreshold || 0);
  if (!variant?.active || quantity <= 0) return { key: "out", label: "Agotado" };
  if (quantity <= threshold) return { key: "low", label: "Pocas unidades" };
  return { key: "available", label: "Disponible" };
}

export function getProductAvailability(variants = []) {
  const active = variants.filter((variant) => variant.active);
  const available = active.filter((variant) => variant.quantity > 0);
  if (!available.length) return { key: "out", label: "Agotado" };
  if (available.every((variant) => variant.quantity <= variant.lowStockThreshold)) {
    return { key: "low", label: "Pocas unidades" };
  }
  return { key: "available", label: "Disponible" };
}

function unwrapRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeProduct(row) {
  const variants = (row?.product_variants || [])
    .filter((variant) => variant.active)
    .map((variant) => {
      const inventory = unwrapRelation(variant.inventory) || {};
      return {
        id: variant.id,
        sku: variant.sku,
        name: variant.variant_name,
        price: Number(variant.price),
        compareAtPrice: variant.compare_at_price == null ? null : Number(variant.compare_at_price),
        active: Boolean(variant.active),
        quantity: Math.max(0, Number(inventory.quantity || 0) - Number(inventory.reserved_quantity || 0)),
        lowStockThreshold: Number(inventory.low_stock_threshold || 0),
      };
    })
    .sort((a, b) => a.price - b.price);

  const images = (row?.product_images || [])
    .map((image) => ({
      id: image.id,
      path: image.storage_path,
      alt: image.alt_text || row.name,
      order: Number(image.sort_order || 0),
      primary: Boolean(image.is_primary),
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.order - b.order);

  const categories = (row?.product_categories || [])
    .map((relation) => unwrapRelation(relation.categories))
    .filter(Boolean)
    .map((category) => ({ id: category.id, name: category.name, slug: category.slug }));

  const minPrice = variants.length ? variants[0].price : 0;
  const maxPrice = variants.length ? variants[variants.length - 1].price : 0;
  const cheapestVariant = variants[0] || null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    seoTitle: row.seo_title || "",
    seoDescription: row.seo_description || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    variants,
    images,
    categories,
    tags: (row.product_tags || []).map((relation) => unwrapRelation(relation.tags)).filter(Boolean)
      .map((tag) => ({ id: tag.id, name: tag.name, slug: tag.slug })),
    minPrice,
    maxPrice,
    hasPriceRange: variants.length > 1 && minPrice !== maxPrice,
    compareAtPrice: cheapestVariant?.compareAtPrice || null,
    availability: getProductAvailability(variants),
  };
}

export function getProductImageUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) return null;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/products/${encodedPath}`;
}
