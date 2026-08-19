import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/observability/logger";
import {
  CATALOG_PAGE_SIZE,
  normalizeProduct,
  sanitizeSearchTerm,
} from "@/features/catalog/catalog-utils";

const PRODUCT_SELECT = `
  id,
  name,
  slug,
  description,
  seo_title,
  seo_description,
  created_at,
  updated_at,
  product_variants!inner(
    id,
    sku,
    variant_name,
    price,
    compare_at_price,
    active,
    inventory(quantity, low_stock_threshold)
  ),
  product_images(id, storage_path, alt_text, sort_order, is_primary),
  product_categories(category_id, categories(id, name, slug))
`;

function reportCatalogError(operation, error) {
  logServerError("catalog.query.failed", error, { repository: "products", operation });
}

async function fetchProductsByIds(supabase, ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .in("id", ids)
    .eq("active", true)
    .eq("product_variants.active", true);

  if (error) {
    reportCatalogError("fetch-products", error);
    throw new Error("CATALOG_PRODUCTS_UNAVAILABLE");
  }

  const order = new Map(ids.map((id, index) => [id, index]));
  return (data || [])
    .map(normalizeProduct)
    .filter((product) => product.variants.length > 0)
    .sort((a, b) => order.get(a.id) - order.get(b.id));
}

export async function getProducts({
  query = "",
  category = "",
  minPrice = null,
  maxPrice = null,
  availableOnly = false,
  page = 1,
  pageSize = CATALOG_PAGE_SIZE,
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(24, Math.max(1, Number(pageSize) || CATALOG_PAGE_SIZE));
  const supabase = createPublicClient();
  const { data: pageRows, error } = await supabase.rpc("catalog_product_page", {
    search_term: sanitizeSearchTerm(query) || null,
    category_slug: category || null,
    min_price: minPrice,
    max_price: maxPrice,
    available_only: Boolean(availableOnly),
    page_limit: safePageSize,
    page_offset: (safePage - 1) * safePageSize,
  });

  if (error) {
    reportCatalogError("product-page", error);
    throw new Error("CATALOG_PRODUCTS_UNAVAILABLE");
  }

  const rows = pageRows || [];
  let total = Number(rows[0]?.total_count || 0);
  if (!rows.length && safePage > 1) {
    const { data: countRows, error: countError } = await supabase.rpc("catalog_product_page", {
      search_term: sanitizeSearchTerm(query) || null,
      category_slug: category || null,
      min_price: minPrice,
      max_price: maxPrice,
      available_only: Boolean(availableOnly),
      page_limit: 1,
      page_offset: 0,
    });
    if (countError) {
      reportCatalogError("product-page-count", countError);
      throw new Error("CATALOG_PRODUCTS_UNAVAILABLE");
    }
    total = Number(countRows?.[0]?.total_count || 0);
  }
  const ids = rows.map((row) => row.product_id);
  const products = await fetchProductsByIds(supabase, ids);

  return {
    products,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.ceil(total / safePageSize),
  };
}

const getCachedProductBySlug = unstable_cache(async function getCachedProductBySlug(slug) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("active", true)
    .eq("product_variants.active", true)
    .maybeSingle();

  if (error) {
    reportCatalogError("product-detail", error);
    throw new Error("CATALOG_PRODUCT_UNAVAILABLE");
  }
  if (!data) return null;
  const product = normalizeProduct(data);
  return product.variants.length ? product : null;
}, ["public-product-by-slug"], { revalidate: 300, tags: ["catalog-products"] });
export const getProductBySlug = cache(getCachedProductBySlug);

export async function getRelatedProducts(product, limit = 4) {
  const category = product.categories[0]?.slug;
  if (!category) return [];
  const result = await getProducts({ category, pageSize: Math.min(limit + 1, 12) });
  return result.products.filter((candidate) => candidate.id !== product.id).slice(0, limit);
}
