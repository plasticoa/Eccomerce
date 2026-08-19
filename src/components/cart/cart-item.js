"use client";

import Image from "next/image";
import Link from "next/link";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { QuantitySelector } from "./quantity-selector";
import { useCart } from "./cart-provider";

export function CartItem({ item }) {
  const { updateItem, removeItem, busy } = useCart();
  if (!item.available) return <article className="cart-item cart-item-unavailable"><div><strong>Artículo no disponible</strong><p>La variante {item.variantId} ya no puede comprarse.</p></div><button className="button button-quiet" type="button" onClick={() => removeItem(item.variantId)} disabled={busy}>Eliminar</button></article>;
  return (
    <article className="cart-item">
      <Link className="cart-item-image" href={`/productos/${item.productSlug}`}><Image src={item.imageUrl} alt={item.imageAlt} fill sizes="120px" /></Link>
      <div className="cart-item-info"><h2><Link href={`/productos/${item.productSlug}`}>{item.productName}</Link></h2><p>{item.variantName} · {item.sku}</p><span>{formatCurrency(item.price)} por unidad</span></div>
      <div className="cart-item-controls"><QuantitySelector value={item.quantity} max={item.stock} onChange={(quantity) => updateItem(item.variantId, quantity)} disabled={busy} label={`Cantidad de ${item.productName}`} /><button type="button" onClick={() => removeItem(item.variantId)} disabled={busy}>Eliminar</button></div>
      <strong className="cart-line-total">{formatCurrency(item.lineTotal)}</strong>
    </article>
  );
}
