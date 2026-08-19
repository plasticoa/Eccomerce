"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createOrderAction } from "@/features/checkout/actions";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { calculateCheckoutTotals, PAYMENT_METHODS } from "@/services/checkout/calculations";
import { SubmitButton } from "@/components/ui/submit-button";
import { previewCouponAction } from "@/features/promotions/actions";

export function CheckoutForm({ addresses, cart, checkoutToken, profile,shippingMethods,currency="GTQ" }) {
  const [state, action] = useActionState(createOrderAction, {});
  const [couponState,couponAction,couponPending]=useActionState(previewCouponAction,{});
  const [delivery, setDelivery] = useState(shippingMethods[0].id);
  const [couponCode,setCouponCode]=useState("");
  const selectedAddress = addresses.find((address) => address.is_default) || addresses[0];
  const appliedCoupon=couponState?.code&&couponState.code===couponCode.trim().toUpperCase()?couponState:null;
  const totals = calculateCheckoutTotals(cart.items, delivery,shippingMethods,appliedCoupon?.discount||0);

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
        <div className="option-grid" role="radiogroup" aria-labelledby="checkout-delivery-title">{shippingMethods.map((method) => <label className="checkout-option" key={method.id}><input type="radio" name="deliveryMethod" value={method.id} checked={delivery === method.id} onChange={() => setDelivery(method.id)} /><span><strong>{method.label} · {method.price ? formatCurrency(method.price,currency) : "Gratis"}</strong><small>{method.description}{method.instructions?` · ${method.instructions}`:""}</small></span></label>)}</div>
      </section>
      <section className="checkout-section">
        <div className="checkout-section-heading"><span>4</span><div><h2>Cupón</h2><p>La vigencia, monto mínimo y usos se validan nuevamente al crear el pedido.</p></div></div><div className="coupon-apply"><label className="field"><span>Código de cupón</span><input name="couponCode" value={couponCode} onChange={(event)=>setCouponCode(event.target.value)} autoComplete="off"/></label><button className="button button-secondary" type="submit" formAction={couponAction} disabled={couponPending}>{couponPending?"Validando…":"Aplicar"}</button></div>{couponState?.error?<p className="form-message error" role="alert">{couponState.error}</p>:null}{appliedCoupon?.success?<p className="form-message success" role="status">{appliedCoupon.success}</p>:null}
      </section>
      <section className="checkout-section">
        <div className="checkout-section-heading"><span>5</span><div><h2>Pago</h2><p>El proveedor confirmará el pago mediante webhook seguro.</p></div></div>
        <div className="checkout-option payment-pending"><span><strong>{PAYMENT_METHODS.pending_gateway.label}</strong><small>{PAYMENT_METHODS.pending_gateway.description}</small></span></div>
      </section>
    </div>
    <aside className="checkout-summary"><h2>Tu pedido</h2><ul>{cart.items.map((item) => <li key={item.variantId}><span>{item.productName}<small>{item.variantName} × {item.quantity}</small></span><strong>{formatCurrency(item.lineTotal,currency)}</strong></li>)}</ul><dl><div><dt>Subtotal</dt><dd>{formatCurrency(totals.subtotal,currency)}</dd></div>{appliedCoupon?.code&&totals.discount?<div className="coupon-discount"><dt>Cupón {appliedCoupon.code}</dt><dd>-{formatCurrency(totals.discount,currency)}</dd></div>:<div><dt>Descuento</dt><dd>{formatCurrency(0,currency)}</dd></div>}<div><dt>Entrega</dt><dd>{formatCurrency(totals.shipping,currency)}</dd></div><div className="cart-total"><dt>Total</dt><dd>{formatCurrency(totals.total,currency)}</dd></div></dl>{state?.error ? <p className="form-message error" role="alert">{state.error}</p> : null}<SubmitButton pendingLabel="Creando pedido…">Crear pedido</SubmitButton><p className="checkout-disclaimer">Los precios, el cupón, la entrega y el total se recalculan en servidor antes de crear el pedido.</p></aside>
  </form>;
}
