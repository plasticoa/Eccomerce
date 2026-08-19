import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { AdminPageHeader } from "@/components/admin/page-header";
import { OrderStatus } from "@/components/orders/order-status";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { getCustomer } from "@/repositories/admin";

const date = (value) => new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default async function CustomerPage({ params }) {
  const { id } = await params; const customer = await getCustomer(id); if (!customer) notFound();
  const orders = [...(customer.orders || [])].sort((a,b) => new Date(b.created_at)-new Date(a.created_at)); const approved = orders.filter((order) => ["approved","paid"].includes(order.payment_status));
  return <section><AdminPageHeader eyebrow="Clientes" title={customer.full_name || "Cliente sin nombre"} description={`Cuenta registrada ${date(customer.created_at)}`} /><div className="metric-grid compact"><article><span>Pedidos</span><strong>{orders.length}</strong></article><article><span>Compras aprobadas</span><strong>{formatCurrency(approved.reduce((sum, order) => sum + Number(order.total), 0))}</strong></article></div><div className="admin-dashboard-grid"><section className="admin-panel"><header><h2>Contacto</h2></header><dl className="admin-details"><div><dt>Correo</dt><dd>{customer.email || "—"}</dd></div><div><dt>Teléfono</dt><dd>{customer.phone || "—"}</dd></div></dl></section><section className="admin-panel"><header><h2>Direcciones</h2></header>{customer.addresses?.length ? <div className="admin-addresses">{customer.addresses.map((address) => <address key={address.id}><strong>{address.label || address.recipient_name}{address.is_default ? " · Predeterminada" : ""}</strong><span>{address.line_1} {address.line_2}<br />{address.city}, {address.state_region} {address.postal_code}<br />{address.country_code}</span></address>)}</div> : <AdminEmptyState title="Sin direcciones" />}</section></div><section className="admin-section"><div className="admin-section-heading"><div><p className="eyebrow">Actividad</p><h2>Pedidos recientes</h2></div></div>{orders.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th>Pago</th><th>Total</th><th /></tr></thead><tbody>{orders.slice(0,20).map((order) => <tr key={order.id}><td>{order.order_number}</td><td>{date(order.created_at)}</td><td><OrderStatus status={order.status} /></td><td><OrderStatus status={order.payment_status} /></td><td>{formatCurrency(order.total, order.currency)}</td><td><Link className="table-link" href={`/admin/pedidos/${order.id}`}>Ver</Link></td></tr>)}</tbody></table></div> : <AdminEmptyState title="Sin pedidos" />}</section></section>;
}

