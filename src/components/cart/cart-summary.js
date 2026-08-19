"use client";
import Link from "next/link";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { useStoreSettings } from "@/components/store/store-settings-provider";

export function CartSummary({ subtotal, authenticated }) {
  const {currency}=useStoreSettings();
  const checkoutHref = authenticated ? "/checkout" : "/auth/login?next=/checkout";
  return <aside className="cart-summary"><h2>Resumen</h2><dl><div><dt>Subtotal</dt><dd>{formatCurrency(subtotal,currency)}</dd></div><div><dt>Descuento</dt><dd>{formatCurrency(0,currency)}</dd></div><div><dt>Envío</dt><dd>Se calcula en checkout</dd></div><div className="cart-total"><dt>Total provisional</dt><dd>{formatCurrency(subtotal,currency)}</dd></div></dl><Link className="button button-primary" href={checkoutHref}>Continuar al checkout</Link><Link className="summary-link" href="/productos">Continuar comprando</Link><p>El precio y las existencias se validarán nuevamente antes de crear el pedido.</p></aside>;
}
