import Link from "next/link";

export function CategoryCard({ category }) {
  return (
    <article className="category-card">
      <span className="category-monogram" aria-hidden="true">{category.name.slice(0, 2).toUpperCase()}</span>
      <div>
        <h2><Link href={`/categorias/${category.slug}`}>{category.name}</Link></h2>
        <p>{category.description || "Explora productos seleccionados para esta categoría."}</p>
        <span>{category.productCount} {category.productCount === 1 ? "producto" : "productos"}</span>
      </div>
    </article>
  );
}
