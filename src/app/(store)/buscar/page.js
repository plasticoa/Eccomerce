import { EmptyState } from "@/components/store/empty-state";
import { Pagination } from "@/components/store/pagination";
import { ProductGrid } from "@/components/store/product-grid";
import { SearchBar } from "@/components/store/search-bar";
import { parseCatalogParams } from "@/features/catalog/catalog-utils";
import { getProducts } from "@/repositories/products";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buscar productos", description: "Busca productos por nombre o SKU en Importadora Valiente.", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }) {
  const values = parseCatalogParams(await searchParams);
  const catalog = values.query ? await getProducts(values) : null;
  return (
    <main className="search-page shell"><header className="catalog-header"><p className="eyebrow">Búsqueda pública</p><h1>¿Qué necesitas?</h1><p>Busca por nombre de producto o por el SKU de una presentación.</p><SearchBar defaultValue={values.query} /></header>
      {!values.query ? <EmptyState title="Escribe un término para comenzar" description="Puedes buscar herramientas, productos del hogar, iluminación o un código SKU." href="/productos" /> : catalog.products.length ? <section><div className="results-heading"><h2>{catalog.total} resultados para “{values.query}”</h2></div><ProductGrid products={catalog.products} /><Pagination page={catalog.page} totalPages={catalog.totalPages} basePath="/buscar" params={{ q: values.query }} /></section> : <EmptyState title="No encontramos productos para esta búsqueda" description={`No hay coincidencias públicas para “${values.query}”. Prueba con un término más general.`} href="/buscar" action="Limpiar búsqueda" />}
    </main>
  );
}
