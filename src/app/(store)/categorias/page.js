import { CategoryCard } from "@/components/store/category-card";
import { getCategories } from "@/repositories/categories";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categorías", description: "Navega el catálogo de Importadora Valiente por categorías activas." };

export default async function CategoriesPage() {
  const categories = await getCategories();
  return <main className="catalog-page shell"><header className="catalog-header"><p className="eyebrow">Explora a tu manera</p><h1>Categorías</h1><p>Encuentra productos relacionados con el espacio o proyecto que tienes en mente.</p></header><div className="category-grid category-grid-page">{categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div></main>;
}
