import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { OrderStatus } from "@/components/orders/order-status";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { getDashboard } from "@/repositories/admin";

export const metadata = { title: "Dashboard · Administración" };
const date = (value) => new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  const dashboard = await getDashboard(params?.periodo);
  const metrics = dashboard.metrics;
  return <section><AdminPageHeader title="Dashboard" description="Una vista operativa del negocio, calculada en la base de datos." />
    <nav className="period-tabs" aria-label="Período del dashboard">{[[1,"Hoy"],[7,"7 días"],[30,"30 días"]].map(([days,label]) => <Link className={dashboard.days === days ? "active" : ""} href={`?periodo=${days}`} key={days}>{label}</Link>)}</nav>
    <div className="metric-grid"><article><span>Ventas</span><strong>{formatCurrency(metrics.sales)}</strong><small>Pagos aprobados</small></article><article><span>Pedidos</span><strong>{metrics.orders}</strong><small>En el período</small></article><article><span>Ticket promedio</span><strong>{formatCurrency(metrics.averageTicket)}</strong><small>Sobre pedidos del período</small></article><article><span>Pendientes</span><strong>{metrics.pendingOrders}</strong><small>Requieren operación</small></article></div>
    <div className="admin-dashboard-grid"><section className="admin-panel"><header><h2>Pedidos recientes</h2><Link href="/admin/pedidos">Ver todos</Link></header>{dashboard.recentOrders.length ? <div className="admin-list">{dashboard.recentOrders.map((order) => <Link href={`/admin/pedidos/${order.id}`} key={order.id}><div><strong>{order.order_number}</strong><span>{order.profiles?.full_name || "Cliente"} · {date(order.created_at)}</span></div><OrderStatus status={order.status} /><strong>{formatCurrency(order.total, order.currency)}</strong></Link>)}</div> : <AdminEmptyState title="Sin pedidos en este período">Cuando haya actividad aparecerá aquí.</AdminEmptyState>}</section>
      <section className="admin-panel"><header><h2>Stock bajo</h2><Link href="/admin/inventario?bajo=true">Gestionar</Link></header>{dashboard.lowStock.length ? <div className="admin-list compact">{dashboard.lowStock.map((stock) => <Link href={`/admin/productos/${stock.productId}`} key={stock.variantId}><div><strong>{stock.productName}</strong><span>{stock.sku} · umbral {stock.lowStockThreshold}</span></div><strong className="stock-danger">{stock.quantity}</strong></Link>)}</div> : <AdminEmptyState title="Sin alertas">No hay variantes por debajo de su umbral.</AdminEmptyState>}</section></div>
    <section className="admin-panel admin-section"><header><h2>Productos más vendidos</h2></header>{dashboard.topProducts.length ? <div className="admin-list compact">{dashboard.topProducts.map((product) => <div className="admin-ranking" key={`${product.sku}-${product.name}`}><div><strong>{product.name}</strong><span>{product.sku}</span></div><strong>{product.quantity} uds.</strong></div>)}</div> : <AdminEmptyState title="Aún no hay ventas aprobadas en el período" />}</section>
  </section>;
}
