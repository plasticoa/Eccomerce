import { notFound } from "next/navigation";
import { CatalogFilters } from "@/components/store/catalog-filters";
import { EmptyState } from "@/components/store/empty-state";
import { Pagination } from "@/components/store/pagination";
import { ProductGrid } from "@/components/store/product-grid";
import { parseCatalogParams } from "@/features/catalog/catalog-utils";
import { getCategories, getCategoryBySlug } from "@/repositories/categories";
import { getProducts } from "@/repositories/products";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  return category ? { title: category.name, description: category.description || `Productos de ${category.name} en Importadora Valiente.` } : { title: "Categoría no encontrada" };
}

export default async function CategoryPage({ params, searchParams }) {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const values = parseCatalogParams(rawSearchParams);
  const [category, categories] = await Promise.all([getCategoryBySlug(slug), getCategories()]);
  if (!category) notFound();
  const catalog = await getProducts({ ...values, category: slug });
  const paginationParams = { min: values.minPrice, max: values.maxPrice, disponible: values.availableOnly || "" };
  return (
    <main className="catalog-page shell"><header className="catalog-header"><p className="eyebrow">Categoría</p><h1>{category.name}</h1><p>{category.description || "Productos disponibles en esta categoría."}</p></header>
      <div className="catalog-layout"><aside><CatalogFilters categories={categories} values={values} action={`/categorias/${slug}`} fixedCategory={slug} /></aside><section><div className="results-heading"><h2>{catalog.total} {catalog.total === 1 ? "producto" : "productos"}</h2></div>{catalog.products.length ? <><ProductGrid products={catalog.products} /><Pagination page={catalog.page} totalPages={catalog.totalPages} basePath={`/categorias/${slug}`} params={paginationParams} /></> : <EmptyState title="No hay productos disponibles" description="Esta categoría no tiene resultados para los filtros elegidos." href={`/categorias/${slug}`} action="Limpiar filtros" />}</section></div>
    </main>
  );
}
