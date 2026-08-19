import Link from "next/link";

export function AdminPagination({ page, totalPages, params = {} }) {
  if (totalPages <= 1) return null;
  const href = (next) => { const query = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => { if (value) query.set(key, String(value)); }); query.set("page", String(next)); return `?${query}`; };
  return <nav className="admin-pagination" aria-label="Paginación"><span>Página {page} de {totalPages}</span><div>{page > 1 ? <Link className="button button-secondary" href={href(page - 1)}>Anterior</Link> : null}{page < totalPages ? <Link className="button button-secondary" href={href(page + 1)}>Siguiente</Link> : null}</div></nav>;
}

