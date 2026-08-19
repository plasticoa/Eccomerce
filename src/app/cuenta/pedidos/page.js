import Link from "next/link";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { OrderStatus } from "@/components/orders/order-status";
import { getOrders } from "@/repositories/orders";

export const metadata = { title: "Mis pedidos" };

function formatDate(value) { return new Intl.DateTimeFormat("es-GT", { dateStyle: "medium" }).format(new Date(value)); }

export default async function OrdersPage() {
  const orders = await getOrders();
  return <><header className="section-heading"><p className="eyebrow">Historial</p><h1>Mis pedidos</h1><p>Consulta los pedidos creados con tu cuenta.</p></header>{orders.length ? <div className="orders-list">{orders.map((order) => <Link href={`/cuenta/pedidos/${order.order_number}`} key={order.id}><div><strong>{order.order_number}</strong><span>{formatDate(order.created_at)}</span></div><div className="order-list-status"><small>Pedido</small><OrderStatus status={order.status} /></div><div className="order-list-status"><small>Pago</small><OrderStatus status={order.payment_status} /></div><strong>{formatCurrency(order.total, order.currency)}</strong><span aria-hidden="true">→</span></Link>)}</div> : <div className="empty-state"><h2>Aún no tienes pedidos</h2><p>Los pedidos que crees aparecerán aquí.</p><Link className="button button-primary" href="/productos">Ver productos</Link></div>}</>;
}
