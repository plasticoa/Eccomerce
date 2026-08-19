import Link from "next/link";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { OrderStatus } from "@/components/orders/order-status";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { getAdminOrders } from "@/repositories/admin";

export const metadata = { title: "Pedidos · Administración" };
const date = (value) => new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default async function OrdersPage({ searchParams }) {
  const params = await searchParams;
  const data = await getAdminOrders({ query: params?.q, status: params?.estado, payment: params?.pago, from: params?.desde, to: params?.hasta, page: params?.page });
  return <section><AdminPageHeader title="Pedidos" description="Consulta el estado comercial, pago y entrega sin alterar la autoridad del proveedor de pagos." /><form className="admin-filters multi"><label className="field"><span>Número</span><input name="q" defaultValue={params?.q || ""} /></label><label className="field"><span>Pedido</span><select name="estado" defaultValue={params?.estado || ""}><option value="">Todos</option>{["pending","confirmed","payment_review","processing","shipped","delivered","cancelled"].map((status) => <option key={status}>{status}</option>)}</select></label><label className="field"><span>Pago</span><select name="pago" defaultValue={params?.pago || ""}><option value="">Todos</option>{["pending","processing","approved","failed","cancelled"].map((status) => <option key={status}>{status}</option>)}</select></label><label className="field"><span>Desde</span><input name="desde" type="date" defaultValue={params?.desde || ""} /></label><label className="field"><span>Hasta</span><input name="hasta" type="date" defaultValue={params?.hasta || ""} /></label><button className="button button-secondary">Filtrar</button></form>
    {data.items.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Pedido</th><th>Pago</th><th>Entrega</th><th /></tr></thead><tbody>{data.items.map((order) => <tr key={order.id}><td><strong>{order.order_number}</strong></td><td>{order.profiles?.full_name || "Sin perfil"}</td><td>{date(order.created_at)}</td><td>{formatCurrency(order.total, order.currency)}</td><td><OrderStatus status={order.status} /></td><td><OrderStatus status={order.payment_status} /></td><td>{order.delivery_method === "store_pickup" ? "Retiro" : "Entrega local"}</td><td><Link className="table-link" href={`/admin/pedidos/${order.id}`}>Detalle</Link></td></tr>)}</tbody></table></div> : <AdminEmptyState title="No hay pedidos">Ajusta los filtros para buscar nuevamente.</AdminEmptyState>}<AdminPagination page={data.page} totalPages={data.totalPages} params={{ q: params?.q, estado: params?.estado, pago: params?.pago, desde: params?.desde, hasta: params?.hasta }} /></section>;
}

