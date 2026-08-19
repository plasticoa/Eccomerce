import Link from "next/link";

export function CategoryNavigation({ categories }) {
  return (
    <nav className="category-navigation" aria-label="Categorías destacadas">
      {categories.map((category) => <Link key={category.id} href={`/categorias/${category.slug}`}>{category.name}</Link>)}
    </nav>
  );
}
