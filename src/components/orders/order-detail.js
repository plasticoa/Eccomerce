import Link from "next/link";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { OrderStatus } from "./order-status";
import { PaymentPanel } from "@/components/payments/payment-panel";

function formatDate(value) { return new Intl.DateTimeFormat("es-GT", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)); }

export function OrderDetail({ order, confirmation = false, paymentIdempotencyKey, paymentConfig }) {
  const address = order.shipping_address || {};
  const shipment = order.shipments?.[0];
  const approved = ["approved", "paid"].includes(order.payment_status);
  const review = order.status === "payment_review";
  const couponCode=order.coupon_redemptions?.[0]?.coupons?.code;
  const confirmationCopy = approved
    ? { eyebrow: "Pedido confirmado", title: "Pago aprobado", body: "La venta quedó confirmada y el inventario fue actualizado." }
    : review
      ? { eyebrow: "Revisión necesaria", title: "Estamos revisando tu pedido", body: "El pago fue reportado como aprobado, pero existe una inconsistencia que requiere atención." }
      : { eyebrow: "Pedido recibido", title: "Completa el pago", body: "Tu pedido quedó pendiente y todavía no se ha realizado ningún cobro." };

  return <div className="order-detail">
    {confirmation ? <div className="confirmation-banner"><span aria-hidden="true">{approved ? "✓" : review ? "!" : "→"}</span><div><p className="eyebrow">{confirmationCopy.eyebrow}</p><h1>{confirmationCopy.title}</h1><p>{confirmationCopy.body}</p></div></div> : <header className="section-heading"><p className="eyebrow">Detalle del pedido</p><h1>{order.order_number}</h1></header>}
    <section className="order-meta"><div><span>Número</span><strong>{order.order_number}</strong></div><div><span>Fecha</span><strong>{formatDate(order.created_at)}</strong></div><div><span>Estado</span><OrderStatus status={order.status} /></div><div><span>Pago</span><OrderStatus status={order.payment_status} /></div></section>
    {paymentConfig && paymentIdempotencyKey ? <PaymentPanel orderNumber={order.order_number} orderStatus={order.status} paymentStatus={order.payment_status} total={order.total} currency={order.currency} payments={order.payments || []} idempotencyKey={paymentIdempotencyKey} paymentConfig={paymentConfig} /> : null}
    <div className="order-detail-grid">
      <section className="order-lines"><h2>Productos</h2>{order.order_items.map((item) => <article key={item.id}><div><strong>{item.name_snapshot}</strong><span>{item.variant_name_snapshot} · {item.sku_snapshot}</span><small>{formatCurrency(item.unit_price,order.currency)} × {item.quantity}</small></div><strong>{formatCurrency(item.line_total,order.currency)}</strong></article>)}<dl><div><dt>Subtotal</dt><dd>{formatCurrency(order.subtotal,order.currency)}</dd></div><div><dt>Entrega</dt><dd>{formatCurrency(order.shipping_total,order.currency)}</dd></div><div><dt>{couponCode?`Cupón ${couponCode}`:"Descuento"}</dt><dd>{formatCurrency(order.discount,order.currency)}</dd></div><div className="cart-total"><dt>Total</dt><dd>{formatCurrency(order.total, order.currency)}</dd></div></dl></section>
      <aside className="order-side"><section><h2>Entrega</h2><p><strong>{order.delivery_method === "store_pickup" ? "Retiro en tienda" : "Entrega local"}</strong></p>{shipment ? <div className="shipment-state"><span>Estado del envío</span><OrderStatus status={shipment.status} />{shipment.tracking_number ? <small>Guía {shipment.tracking_number}</small> : null}</div> : null}<address>{address.recipient_name}<br />{address.line_1}{address.line_2 ? <><br />{address.line_2}</> : null}<br />{address.city}{address.state_region ? `, ${address.state_region}` : ""}<br />{address.phone}</address></section><section><h2>¿Qué sigue?</h2><p>{approved ? "El equipo preparará el pedido para entrega." : review ? "El equipo debe resolver la inconsistencia antes de preparar el pedido." : "Inicia el pago. La orden solo se confirmará después del webhook verificado."}</p></section></aside>
    </div>
    {confirmation ? <div className="confirmation-actions"><Link className="button button-primary" href={`/cuenta/pedidos/${order.order_number}`}>Ver en mi cuenta</Link><Link className="button button-secondary" href="/productos">Seguir comprando</Link></div> : null}
  </div>;
}
