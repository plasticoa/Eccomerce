import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

const CATEGORY_SELECT = `
  id,
  name,
  slug,
  description,
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
    productCount,
  };
}

export async function getCategories({ limit } = {}) {
  const supabase = await createClient();
  let query = supabase.from("categories").select(CATEGORY_SELECT).eq("active", true).order("name");
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) {
    console.error("[catalog:categories]", { code: error.code, message: error.message });
    throw new Error("CATALOG_CATEGORIES_UNAVAILABLE");
  }
  return (data || []).map(normalizeCategory);
}

export const getCategoryBySlug = cache(async function getCategoryBySlug(slug) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_SELECT)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error("[catalog:category]", { code: error.code, message: error.message });
    throw new Error("CATALOG_CATEGORY_UNAVAILABLE");
  }
  return data ? normalizeCategory(data) : null;
});
