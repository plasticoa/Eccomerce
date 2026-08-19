import { CategoryCard } from "@/components/store/category-card";
import { getCategories } from "@/repositories/categories";
import { getPublicSettings } from "@/repositories/settings";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export async function generateMetadata() { const settings = await getPublicSettings(); return buildPublicMetadata({ settings, title: "Categorías", description: `Navega el catálogo de ${settings.storeName} por categorías activas.`, path: "/categorias" }); }

export default async function CategoriesPage() {
  const categories = await getCategories();
  return <main className="catalog-page shell"><header className="catalog-header"><p className="eyebrow">Explora a tu manera</p><h1>Categorías</h1><p>Encuentra productos relacionados con el espacio o proyecto que tienes en mente.</p></header><div className="category-grid category-grid-page">{categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div></main>;
}
