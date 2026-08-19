"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createOrderAction } from "@/features/checkout/actions";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { calculateCheckoutTotals, DELIVERY_METHODS, PAYMENT_METHODS } from "@/services/checkout/calculations";
import { SubmitButton } from "@/components/ui/submit-button";

export function CheckoutForm({ addresses, cart, checkoutToken, profile }) {
  const [state, action] = useActionState(createOrderAction, {});
  const [delivery, setDelivery] = useState("local_delivery");
  const selectedAddress = addresses.find((address) => address.is_default) || addresses[0];
  const totals = calculateCheckoutTotals(cart.items, delivery);

  return <form action={action} className="checkout-layout">
    <input type="hidden" name="checkoutToken" value={checkoutToken} />
    <input type="hidden" name="paymentMethod" value="pending_gateway" />
    <div className="checkout-main">
      <section className="checkout-section">
        <div className="checkout-section-heading"><span>1</span><div><h2>Datos del cliente</h2><p>{profile?.full_name || "Cliente"} · {profile?.email}{profile?.phone ? ` · ${profile.phone}` : ""}</p></div></div>
        <Link className="inline-link" href="/cuenta/perfil">Editar perfil</Link>
      </section>
      <section className="checkout-section">
        <div className="checkout-section-heading"><span>2</span><div><h2 id="checkout-address-title">Dirección</h2><p>Selecciona dónde coordinaremos la entrega.</p></div></div>
        <div className="option-grid" role="radiogroup" aria-labelledby="checkout-address-title">{addresses.map((address) => <label className="checkout-option" key={address.id}><input type="radio" name="addressId" value={address.id} defaultChecked={address.id === selectedAddress?.id} required /><span><strong>{address.label || "Dirección"}{address.is_default ? " · Predeterminada" : ""}</strong><small>{address.recipient_name} · {address.line_1}, {address.city}</small></span></label>)}</div>
        <Link className="inline-link" href="/cuenta/direcciones">Administrar direcciones</Link>
      </section>
      <section className="checkout-section">
        <div className="checkout-section-heading"><span>3</span><div><h2 id="checkout-delivery-title">Método de entrega</h2><p>El costo se confirma antes de crear el pedido.</p></div></div>
        <div className="option-grid" role="radiogroup" aria-labelledby="checkout-delivery-title">{Object.values(DELIVERY_METHODS).map((method) => <label className="checkout-option" key={method.id}><input type="radio" name="deliveryMethod" value={method.id} checked={delivery === method.id} onChange={() => setDelivery(method.id)} /><span><strong>{method.label} · {method.price ? formatCurrency(method.price) : "Gratis"}</strong><small>{method.description}</small></span></label>)}</div>
      </section>
      <section className="checkout-section">
        <div className="checkout-section-heading"><span>4</span><div><h2>Pago</h2><p>Esta iteración no procesa cobros.</p></div></div>
        <div className="checkout-option payment-pending"><span><strong>{PAYMENT_METHODS.pending_gateway.label}</strong><small>{PAYMENT_METHODS.pending_gateway.description}</small></span></div>
      </section>
    </div>
    <aside className="checkout-summary"><h2>Tu pedido</h2><ul>{cart.items.map((item) => <li key={item.variantId}><span>{item.productName}<small>{item.variantName} × {item.quantity}</small></span><strong>{formatCurrency(item.lineTotal)}</strong></li>)}</ul><dl><div><dt>Subtotal</dt><dd>{formatCurrency(totals.subtotal)}</dd></div><div><dt>Entrega</dt><dd>{formatCurrency(totals.shipping)}</dd></div><div><dt>Descuento</dt><dd>{formatCurrency(totals.discount)}</dd></div><div className="cart-total"><dt>Total</dt><dd>{formatCurrency(totals.total)}</dd></div></dl>{state?.error ? <p className="form-message error" role="alert">{state.error}</p> : null}<SubmitButton pendingLabel="Creando pedido…">Crear pedido</SubmitButton><p className="checkout-disclaimer">Al continuar se crea un pedido pendiente. No se realizará ningún cargo ni se descontará inventario.</p></aside>
  </form>;
}
