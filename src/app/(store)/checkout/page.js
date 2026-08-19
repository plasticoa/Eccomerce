import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { getAddresses } from "@/repositories/addresses";
import { getAuthenticatedCart } from "@/repositories/carts";

export const metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  if (!(await getCurrentUser())) redirect("/auth/login?next=/checkout");
  const [addresses, cart, profile] = await Promise.all([getAddresses(), getAuthenticatedCart(), getCurrentProfile()]);
  if (!cart?.items?.length) return <div className="checkout-page shell"><header className="catalog-header"><p className="eyebrow">Finalizar compra</p><h1>Checkout</h1></header><div className="empty-state"><h2>Tu carrito está vacío.</h2><p>Si acabas de iniciar sesión, esperaremos la fusión automática. Si continúa vacío, vuelve al catálogo para agregar productos.</p><Link className="button button-primary" href="/productos">Volver al catálogo</Link></div></div>;
  if (cart.items.some((item) => !item.available)) redirect("/carrito");
  return <div className="checkout-page shell"><header className="catalog-header"><p className="eyebrow">Finalizar compra</p><h1>Checkout</h1><p>Revisa la entrega y crea tu pedido pendiente.</p></header>{addresses.length ? <CheckoutForm addresses={addresses} cart={cart} checkoutToken={randomUUID()} profile={profile} /> : <div className="empty-state"><h2>Agrega una dirección</h2><p>Necesitamos una dirección guardada para crear el pedido, incluso si eliges retiro en tienda.</p><Link className="button button-primary" href="/cuenta/direcciones">Agregar dirección</Link></div>}</div>;
}
