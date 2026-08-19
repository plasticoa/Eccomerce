"use client";

import { CartList } from "@/components/cart/cart-list";
import { CartSummary } from "@/components/cart/cart-summary";
import { useCart } from "@/components/cart/cart-provider";
import { EmptyState } from "@/components/store/empty-state";

export default function CartPage() {
  const { cart, ready, message, authenticated } = useCart();
  if (!ready) return <main className="cart-page shell"><div className="loading-heading" /></main>;
  if (!cart.items.length) return <main className="cart-page shell"><header className="catalog-header"><p className="eyebrow">Tu selección</p><h1>Carrito</h1></header><EmptyState title="Tu carrito está vacío" description="Explora el catálogo y agrega una variante para comenzar." /></main>;
  return <main className="cart-page shell"><header className="catalog-header"><p className="eyebrow">Tu selección</p><h1>Carrito</h1><p>Revisa cantidades y disponibilidad antes de continuar.</p></header>{message ? <p className="cart-page-message" role="status">{message}</p> : null}{cart.warnings?.length ? <div className="cart-warnings" role="alert">{[...new Set(cart.warnings)].map((warning) => <p key={warning}>{warning}</p>)}</div> : null}<div className="cart-layout"><CartList items={cart.items} /><CartSummary subtotal={cart.subtotal} authenticated={authenticated} /></div></main>;
}
