import Link from "next/link";
import { formatCurrency } from "@/features/catalog/catalog-utils";

export function CartSummary({ subtotal, authenticated }) {
  const checkoutHref = authenticated ? "/checkout" : "/auth/login?next=/checkout";
  return <aside className="cart-summary"><h2>Resumen</h2><dl><div><dt>Subtotal</dt><dd>{formatCurrency(subtotal)}</dd></div><div><dt>Descuento</dt><dd>{formatCurrency(0)}</dd></div><div><dt>Envío</dt><dd>Se calcula en checkout</dd></div><div className="cart-total"><dt>Total provisional</dt><dd>{formatCurrency(subtotal)}</dd></div></dl><Link className="button button-primary" href={checkoutHref}>Continuar al checkout</Link><Link className="summary-link" href="/productos">Continuar comprando</Link><p>El precio y las existencias se validarán nuevamente antes de crear el pedido.</p></aside>;
}
