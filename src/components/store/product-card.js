import Image from "next/image";
import Link from "next/link";
import { getProductImageUrl } from "@/features/catalog/catalog-utils";
import { ProductAvailability } from "./product-availability";
import { ProductPrice } from "./product-price";
import { ProductImageFallback } from "./product-image-fallback";

export function ProductCard({ product, priority = false }) {
  const image = product.images[0];
  const imageUrl = getProductImageUrl(image?.path);
  return (
    <article className="product-card">
      <Link className="product-card-image" href={`/productos/${product.slug}`} tabIndex={-1} aria-hidden="true">
        {imageUrl ? <Image
          src={imageUrl}
          alt={image?.alt || product.name}
          fill
          priority={priority}
          sizes="(max-width: 540px) 50vw, (max-width: 900px) 33vw, 25vw"
        /> : <ProductImageFallback />}
      </Link>
      <div className="product-card-body">
        {product.categories[0] ? <Link className="product-category-link" href={`/categorias/${product.categories[0].slug}`}>{product.categories[0].name}</Link> : null}
        <h2><Link href={`/productos/${product.slug}`}>{product.name}</Link></h2>
        <ProductPrice price={product.minPrice} compareAtPrice={product.compareAtPrice} from={product.hasPriceRange} />
        <ProductAvailability availability={product.availability} compact />
      </div>
    </article>
  );
}
