"use client";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { useStoreSettings } from "./store-settings-provider";

export function ProductPrice({ price, compareAtPrice, from = false, currency = "GTQ", size = "normal" }) {
  const settings=useStoreSettings();const displayCurrency=currency==="GTQ"?settings.currency:currency;
  const showCompare = compareAtPrice != null && Number(compareAtPrice) > Number(price);
  return (
    <div className={`product-price product-price-${size}`}>
      <span>{from ? "Desde " : ""}{formatCurrency(price, displayCurrency)}</span>
      {showCompare ? <del>{formatCurrency(compareAtPrice, displayCurrency)}</del> : null}
    </div>
  );
}
