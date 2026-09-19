import Link from "next/link";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { OrderStatus } from "./order-status";
import { PAYMENT_METHODS } from "@/services/checkout/calculations";

function formatDate(value) { return new Intl.DateTimeFormat("es-GT", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)); }

export function OrderDetail({ order, confirmation = false }) {
  const address = order.shipping_address || {};
  const shipment = order.shipments?.[0];
  const approved = ["approved", "paid"].includes(order.payment_status);
  const cancelled = order.status === "cancelled";
  const review = order.status === "payment_review";
  const couponCode=order.coupon_redemptions?.[0]?.coupons?.code;
  const confirmationCopy = cancelled
    ? { eyebrow: "Pedido cancelado", title: "Pedido cancelado", body: "Este pedido ya no está activo." }
    : approved
    ? { eyebrow: "Pedido confirmado", title: "Pago aprobado", body: "La venta quedó confirmada y el inventario fue actualizado." }
    : review
      ? { eyebrow: "Revisión necesaria", title: "Estamos revisando tu pedido", body: "El pago fue reportado como aprobado, pero existe una inconsistencia que requiere atención." }
      : { eyebrow: "Pedido recibido", title: "Pedido creado", body: order.inventory_status === "reserved" ? "Recibimos tu pedido. Apartamos tus productos y el pago queda pendiente." : "Tu pedido está registrado. El equipo revisará su estado." };

  return <div className="order-detail">
    {confirmation ? <div className="confirmation-banner"><span aria-hidden="true">{approved ? "✓" : review ? "!" : "→"}</span><div><p className="eyebrow">{confirmationCopy.eyebrow}</p><h1>{confirmationCopy.title}</h1><p>{confirmationCopy.body}</p></div></div> : <header className="section-heading"><p className="eyebrow">Detalle del pedido</p><h1>{order.order_number}</h1></header>}
    <section className="order-meta"><div><span>Número</span><strong>{order.order_number}</strong></div><div><span>Fecha</span><strong>{formatDate(order.created_at)}</strong></div><div><span>Estado</span><OrderStatus status={order.status} /></div><div><span>Pago</span><OrderStatus status={order.payment_status} /></div></section>
    <p>Método de pago: <strong>{PAYMENT_METHODS[order.payment_method]?.label || "Pago histórico"}</strong></p>
    <div className="order-detail-grid">
      <section className="order-lines"><h2>Productos</h2>{order.order_items.map((item) => <article key={item.id}><div><strong>{item.name_snapshot}</strong><span>{item.variant_name_snapshot} · {item.sku_snapshot}</span><small>{formatCurrency(item.unit_price,order.currency)} × {item.quantity}</small></div><strong>{formatCurrency(item.line_total,order.currency)}</strong></article>)}<dl><div><dt>Subtotal</dt><dd>{formatCurrency(order.subtotal,order.currency)}</dd></div><div><dt>Entrega</dt><dd>{formatCurrency(order.shipping_total,order.currency)}</dd></div><div><dt>{couponCode?`Cupón ${couponCode}`:"Descuento"}</dt><dd>{formatCurrency(order.discount,order.currency)}</dd></div><div className="cart-total"><dt>Total</dt><dd>{formatCurrency(order.total, order.currency)}</dd></div></dl></section>
      <aside className="order-side"><section><h2>Entrega</h2><p><strong>{order.delivery_method === "store_pickup" ? "Retiro en tienda" : "Entrega local"}</strong></p>{shipment ? <div className="shipment-state"><span>Estado del envío</span><OrderStatus status={shipment.status} />{shipment.tracking_number ? <small>Guía {shipment.tracking_number}</small> : null}</div> : null}<address>{address.recipient_name}<br />{address.line_1}{address.line_2 ? <><br />{address.line_2}</> : null}<br />{address.city}{address.state_region ? `, ${address.state_region}` : ""}<br />{address.phone}</address></section><section><h2>¿Qué sigue?</h2><p>{cancelled ? "Puedes crear un nuevo pedido desde el catálogo." : approved ? "El pago está registrado. Puedes consultar aquí el estado de entrega." : review ? "El equipo debe resolver la inconsistencia antes de preparar el pedido." : "Coordinaremos tu pedido. Pagarás contra entrega o presencialmente según el método elegido."}</p></section></aside>
    </div>
    {confirmation ? <div className="confirmation-actions"><Link className="button button-primary" href={`/cuenta/pedidos/${order.order_number}`}>Ver en mi cuenta</Link><Link className="button button-secondary" href="/productos">Seguir comprando</Link></div> : null}
  </div>;
}
