import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/store/product-gallery";
import { ProductGrid } from "@/components/store/product-grid";
import { ProductPrice } from "@/components/store/product-price";
import { ProductVariantSelector } from "@/components/store/product-variant-selector";
import { getProductBySlug, getRelatedProducts } from "@/repositories/products";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };
  return { title: product.name, description: (product.description || `Conoce ${product.name} en Importadora Valiente.`).slice(0, 155) };
}

export default async function ProductDetailPage({ params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const related = await getRelatedProducts(product);
  return (
    <main className="product-detail-page shell">
      <nav className="breadcrumb" aria-label="Migas de pan"><Link href="/">Inicio</Link><span>/</span><Link href="/productos">Productos</Link><span>/</span><span aria-current="page">{product.name}</span></nav>
      <div className="product-detail-grid">
        <ProductGallery images={product.images} productName={product.name} />
        <section className="product-summary">
          {product.categories.length ? <div className="detail-categories">{product.categories.map((category) => <Link key={category.id} href={`/categorias/${category.slug}`}>{category.name}</Link>)}</div> : null}
          <h1>{product.name}</h1>
          <ProductPrice price={product.minPrice} compareAtPrice={product.compareAtPrice} from={product.hasPriceRange} size="large" />
          <p className="product-description">{product.description || "Consulta las presentaciones disponibles para este producto."}</p>
          <ProductVariantSelector variants={product.variants} />
          <div className="product-notes"><div><strong>Información transparente</strong><span>Precio y existencias se actualizan al elegir una variante.</span></div><div><strong>Catálogo público seguro</strong><span>Solo mostramos productos y presentaciones activas.</span></div></div>
        </section>
      </div>
      {related.length ? <section className="related-products"><div className="section-heading"><div><p className="eyebrow">También podría servirte</p><h2>Productos relacionados</h2></div></div><ProductGrid products={related} /></section> : null}
    </main>
  );
}
