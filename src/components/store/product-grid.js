import { ProductCard } from "./product-card";

export function ProductGrid({ products }) {
  return (
    <div className="product-grid">
      {products.map((product, index) => <ProductCard key={product.id} product={product} priority={index < 4} />)}
    </div>
  );
}
