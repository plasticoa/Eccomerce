import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/observability/logger";

const CATEGORY_SELECT = `
  id,
  name,
  slug,
  description,
  seo_title,
  seo_description,
  updated_at,
  product_categories(
    products(id, product_variants(id, active))
  )
`;

function normalizeCategory(row) {
  const productCount = new Set(
    (row.product_categories || [])
      .map((relation) => Array.isArray(relation.products) ? relation.products[0] : relation.products)
      .filter((product) => product && (product.product_variants || []).some((variant) => variant.active))
      .map((product) => product.id),
  ).size;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    seoTitle: row.seo_title || "",
    seoDescription: row.seo_description || "",
    updatedAt: row.updated_at || null,
    productCount,
  };
}

const getCachedCategories = unstable_cache(async function getCachedCategories(limit = null) {
  const supabase = createPublicClient();
  let query = supabase.from("categories").select(CATEGORY_SELECT).eq("active", true).order("name");
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) {
    logServerError("catalog.query.failed", error, { repository: "categories", operation: "list" });
    throw new Error("CATALOG_CATEGORIES_UNAVAILABLE");
  }
  return (data || []).map(normalizeCategory);
}, ["public-categories"], { revalidate: 300, tags: ["catalog-categories"] });

export function getCategories({ limit } = {}) { return getCachedCategories(limit || null); }

const getCachedCategoryBySlug = unstable_cache(async function getCachedCategoryBySlug(slug) {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_SELECT)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    logServerError("catalog.query.failed", error, { repository: "categories", operation: "detail" });
    throw new Error("CATALOG_CATEGORY_UNAVAILABLE");
  }
  return data ? normalizeCategory(data) : null;
}, ["public-category-by-slug"], { revalidate: 300, tags: ["catalog-categories"] });
export const getCategoryBySlug = cache(getCachedCategoryBySlug);
