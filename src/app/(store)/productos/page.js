import { CatalogFilters } from "@/components/store/catalog-filters";
import { EmptyState } from "@/components/store/empty-state";
import { Pagination } from "@/components/store/pagination";
import { ProductGrid } from "@/components/store/product-grid";
import { getCategories } from "@/repositories/categories";
import { getProducts } from "@/repositories/products";
import { parseCatalogParams } from "@/features/catalog/catalog-utils";
import { getPublicSettings } from "@/repositories/settings";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }) {
  const [settings, params] = await Promise.all([getPublicSettings(), searchParams]);
  const hasFilters = Object.values(params || {}).some(Boolean);
  return buildPublicMetadata({ settings, title: "Productos", description: `Explora el catálogo público de ${settings.storeName} por categoría, precio y disponibilidad.`, path: "/productos", noIndex: hasFilters });
}

export default async function ProductsPage({ searchParams }) {
  const values = parseCatalogParams(await searchParams);
  const [categories, catalog] = await Promise.all([getCategories(), getProducts(values)]);
  const paginationParams = { categoria: values.category, min: values.minPrice, max: values.maxPrice, disponible: values.availableOnly || "" };
  return (
    <main className="catalog-page shell">
      <header className="catalog-header"><p className="eyebrow">Catálogo público</p><h1>Productos</h1><p>Encuentra la opción adecuada y consulta precio y disponibilidad por presentación.</p></header>
      <div className="catalog-layout">
        <aside><CatalogFilters categories={categories} values={values} /></aside>
        <section aria-labelledby="results-title">
          <div className="results-heading"><h2 id="results-title">{catalog.total} {catalog.total === 1 ? "producto" : "productos"}</h2>{values.category ? <span>Filtrado por {categories.find((category) => category.slug === values.category)?.name || values.category}</span> : null}</div>
          {catalog.products.length ? <><ProductGrid products={catalog.products} /><Pagination page={catalog.page} totalPages={catalog.totalPages} basePath="/productos" params={paginationParams} /></> : <EmptyState title="No encontramos productos" description="Prueba otro rango de precio, categoría o disponibilidad." action="Limpiar filtros" />}
        </section>
      </div>
    </main>
  );
}
