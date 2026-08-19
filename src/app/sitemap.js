import { getPublicSettings } from "@/repositories/settings";
import { getIndexableCatalogEntries } from "@/repositories/seo";
import { absoluteSiteUrl, resolveCanonicalBase } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const [settings, entries] = await Promise.all([getPublicSettings(), getIndexableCatalogEntries()]);
  const base = resolveCanonicalBase(settings);
  const fixed = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/productos", changeFrequency: "daily", priority: 0.9 },
    { path: "/categorias", changeFrequency: "weekly", priority: 0.7 },
  ];
  return [
    ...fixed.map((entry) => ({ url: absoluteSiteUrl(entry.path, base), changeFrequency: entry.changeFrequency, priority: entry.priority })),
    ...entries.categories.map((category) => ({ url: absoluteSiteUrl(`/categorias/${category.slug}`, base), lastModified: category.updated_at, changeFrequency: "weekly", priority: 0.7 })),
    ...entries.products.map((product) => ({ url: absoluteSiteUrl(`/productos/${product.slug}`, base), lastModified: product.updated_at, changeFrequency: "weekly", priority: 0.8 })),
  ];
}
