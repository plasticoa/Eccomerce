import { formatCurrency } from "@/features/catalog/catalog-utils";

export function ProductPrice({ price, compareAtPrice, from = false, currency = "GTQ", size = "normal" }) {
  const showCompare = compareAtPrice != null && Number(compareAtPrice) > Number(price);
  return (
    <div className={`product-price product-price-${size}`}>
      <span>{from ? "Desde " : ""}{formatCurrency(price, currency)}</span>
      {showCompare ? <del>{formatCurrency(compareAtPrice, currency)}</del> : null}
    </div>
  );
}
