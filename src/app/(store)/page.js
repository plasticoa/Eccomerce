import Link from "next/link";
import { CategoryCard } from "@/components/store/category-card";
import { CategoryNavigation } from "@/components/store/category-navigation";
import { ProductGrid } from "@/components/store/product-grid";
import { SearchBar } from "@/components/store/search-bar";
import { getCategories } from "@/repositories/categories";
import { getProducts } from "@/repositories/products";
import { HomeBanners } from "@/components/store/home-banners";
import { getPublicBanners, getPublicSettings } from "@/repositories/settings";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(){const settings=await getPublicSettings();return buildPublicMetadata({settings,title:settings.seo.title,description:settings.seo.description,path:"/"});}

export default async function HomePage() {
  const [categories, catalog,settings,banners] = await Promise.all([
    getCategories({ limit: 4 }),
    getProducts({ pageSize: 8 }),
    getPublicSettings(),
    getPublicBanners(),
  ]);
  return (
    <>
      <section className="home-hero">
        <div className="shell home-hero-grid">
          <div><p className="eyebrow">{settings.home.eyebrow}</p><h1>{settings.home.title}</h1><p className="hero-copy">{settings.home.subtitle}</p><div className="hero-actions">{settings.home.buttonText&&settings.home.buttonUrl?<Link className="button button-primary" href={settings.home.buttonUrl}>{settings.home.buttonText}</Link>:null}<Link className="button button-secondary" href="/categorias">Ver categorías</Link></div>{settings.home.additionalMessage?<p className="home-additional">{settings.home.additionalMessage}</p>:null}</div>
          <aside className="hero-search-card"><span>Encuentra lo que necesitas</span><h2>Busca por producto o código</h2><SearchBar /><p>Prueba “taladro”, “LED” o un SKU.</p></aside>
        </div>
      </section>
      <HomeBanners banners={banners}/>
      <div className="shell"><CategoryNavigation categories={categories} /></div>
      <section className="store-section shell"><div className="section-heading"><div><p className="eyebrow">Explora por espacio</p><h2>Categorías principales</h2></div><Link href="/categorias">Ver todas</Link></div><div className="category-grid">{categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div></section>
      <section className="store-section store-section-products"><div className="shell"><div className="section-heading"><div><p className="eyebrow">Recién incorporados</p><h2>Productos para descubrir</h2></div><Link href="/productos">Ver catálogo completo</Link></div><ProductGrid products={catalog.products} /></div></section>
      <section className="trust-strip shell" aria-label="Compromisos de Importadora Valiente"><div><strong>Selección útil</strong><span>Productos pensados para resolver.</span></div><div><strong>Información clara</strong><span>Precio y disponibilidad por variante.</span></div><div><strong>Compra segura</strong><span>Base preparada para la próxima etapa.</span></div></section>
    </>
  );
}
