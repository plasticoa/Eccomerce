import Link from "next/link";
import { CategoryCard } from "@/components/store/category-card";
import { CategoryNavigation } from "@/components/store/category-navigation";
import { ProductGrid } from "@/components/store/product-grid";
import { SearchBar } from "@/components/store/search-bar";
import { getCategories } from "@/repositories/categories";
import { getProducts } from "@/repositories/products";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Importadora Valiente | Productos para cada proyecto",
  description: "Descubre herramientas, soluciones para el hogar, iluminación, organización y jardín en Importadora Valiente.",
};

export default async function HomePage() {
  const [categories, catalog] = await Promise.all([
    getCategories({ limit: 4 }),
    getProducts({ pageSize: 8 }),
  ]);
  return (
    <>
      <section className="home-hero">
        <div className="shell home-hero-grid">
          <div><p className="eyebrow">Importadora Valiente</p><h1>Soluciones valientes para cada proyecto.</h1><p className="hero-copy">Productos útiles para el hogar, el trabajo y esos planes que merecen empezar hoy.</p><div className="hero-actions"><Link className="button button-primary" href="/productos">Explorar productos</Link><Link className="button button-secondary" href="/categorias">Ver categorías</Link></div></div>
          <aside className="hero-search-card"><span>Encuentra lo que necesitas</span><h2>Busca por producto o código</h2><SearchBar /><p>Prueba “taladro”, “LED” o un SKU.</p></aside>
        </div>
      </section>
      <div className="shell"><CategoryNavigation categories={categories} /></div>
      <section className="store-section shell"><div className="section-heading"><div><p className="eyebrow">Explora por espacio</p><h2>Categorías principales</h2></div><Link href="/categorias">Ver todas</Link></div><div className="category-grid">{categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div></section>
      <section className="store-section store-section-products"><div className="shell"><div className="section-heading"><div><p className="eyebrow">Recién incorporados</p><h2>Productos para descubrir</h2></div><Link href="/productos">Ver catálogo completo</Link></div><ProductGrid products={catalog.products} /></div></section>
      <section className="trust-strip shell" aria-label="Compromisos de Importadora Valiente"><div><strong>Selección útil</strong><span>Productos pensados para resolver.</span></div><div><strong>Información clara</strong><span>Precio y disponibilidad por variante.</span></div><div><strong>Compra segura</strong><span>Base preparada para la próxima etapa.</span></div></section>
    </>
  );
}
