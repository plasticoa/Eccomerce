"use client";
import Link from "next/link";
import { useCart } from "./cart-provider";

export function CartIndicator() {
  const { unitCount, ready } = useCart();
  return <Link className="cart-indicator" href="/carrito" aria-label={`Carrito con ${ready ? unitCount : 0} unidades`}>Carrito <span className="cart-count">{ready ? unitCount : "…"}</span></Link>;
}
