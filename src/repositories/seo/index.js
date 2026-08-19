import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

const getCachedIndexableCatalogEntries = unstable_cache(async function getCachedIndexableCatalogEntries() {
  const supabase = createPublicClient();
  const [productsResult, categoriesResult] = await Promise.all([
    supabase.from("products").select("slug,updated_at,product_variants!inner(id,active)").eq("active", true).eq("product_variants.active", true).order("updated_at", { ascending: false }).limit(5000),
    supabase.from("categories").select("slug,updated_at").eq("active", true).order("name").limit(1000),
  ]);
  if (productsResult.error || categoriesResult.error) throw new Error("SITEMAP_DATA_UNAVAILABLE");
  return { products: productsResult.data || [], categories: categoriesResult.data || [] };
}, ["indexable-catalog-entries"], { revalidate: 3600, tags: ["catalog-products", "catalog-categories"] });
export const getIndexableCatalogEntries = cache(getCachedIndexableCatalogEntries);
