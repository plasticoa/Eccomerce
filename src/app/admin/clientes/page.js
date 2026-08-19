import Link from "next/link";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { getCustomers } from "@/repositories/admin";

export const metadata = { title: "Clientes · Administración" };
const date = (value) => new Intl.DateTimeFormat("es-GT", { dateStyle: "medium" }).format(new Date(value));

export default async function CustomersPage({ searchParams }) {
  const params = await searchParams; const data = await getCustomers({ query: params?.q, page: params?.page });
  return <section><AdminPageHeader title="Clientes" description="Información operativa mínima y actividad de compra." /><form className="admin-filters"><label className="field"><span>Nombre o correo</span><input name="q" defaultValue={params?.q || ""} /></label><button className="button button-secondary">Buscar</button></form>{data.items.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Cliente</th><th>Correo</th><th>Teléfono</th><th>Registro</th><th>Pedidos</th><th>Total aprobado</th><th /></tr></thead><tbody>{data.items.map((customer) => { const orders = customer.orders || []; const bought = orders.filter((order) => ["approved","paid"].includes(order.payment_status)).reduce((sum, order) => sum + Number(order.total), 0); return <tr key={customer.id}><td><strong>{customer.full_name || "Sin nombre"}</strong></td><td>{customer.email || "—"}</td><td>{customer.phone || "—"}</td><td>{date(customer.created_at)}</td><td>{orders.length}</td><td>{formatCurrency(bought)}</td><td><Link className="table-link" href={`/admin/clientes/${customer.id}`}>Detalle</Link></td></tr>; })}</tbody></table></div> : <AdminEmptyState title="No encontramos clientes" />}<AdminPagination page={data.page} totalPages={data.totalPages} params={{ q: params?.q }} /></section>;
}

