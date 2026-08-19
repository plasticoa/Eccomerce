import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { AdminPagination } from "@/components/admin/pagination";
import { AdminStatus } from "@/components/admin/admin-ui";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { getAdminProducts } from "@/repositories/admin";

export const metadata = { title: "Productos · Administración" };

export default async function ProductsPage({ searchParams }) {
  const params = await searchParams;
  const data = await getAdminProducts({ query: params?.q, status: params?.estado, page: params?.page });
  return <section><AdminPageHeader title="Productos" description="Publica y mantiene el catálogo y sus variantes." actionHref="/admin/productos/nuevo" actionLabel="Nuevo producto" /><form className="admin-filters"><label className="field"><span>Buscar por nombre, slug o SKU</span><input name="q" defaultValue={params?.q || ""} /></label><label className="field"><span>Estado</span><select name="estado" defaultValue={params?.estado || "all"}><option value="all">Todos</option><option value="active">Publicados</option><option value="inactive">No publicados</option></select></label><button className="button button-secondary">Filtrar</button></form>
    {data.items.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Producto</th><th>Categoría</th><th>SKU / precio</th><th>Stock</th><th>Estado</th><th /></tr></thead><tbody>{data.items.map((product) => { const variants = product.product_variants || []; const stock = variants.reduce((sum, variant) => sum + Number(variant.inventory?.quantity || 0), 0); return <tr key={product.id}><td><strong>{product.name}</strong><small>/{product.slug}</small></td><td>{product.product_categories?.map((row) => row.categories?.name).filter(Boolean).join(", ") || "Sin categoría"}</td><td><strong>{variants[0]?.sku || "Sin variante"}</strong><small>{variants.length ? `${formatCurrency(variants[0].price)} · ${variants.length} variante(s)` : ""}</small></td><td>{stock}</td><td><AdminStatus active={product.active} trueLabel="Publicado" falseLabel="Borrador" /></td><td><Link className="table-link" href={`/admin/productos/${product.id}`}>Editar</Link></td></tr>; })}</tbody></table></div> : <AdminEmptyState title="No encontramos productos">Ajusta los filtros o crea el primer producto.</AdminEmptyState>}<AdminPagination page={data.page} totalPages={data.totalPages} params={{ q: params?.q, estado: params?.estado }} /></section>;
}
