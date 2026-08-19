import Link from "next/link";

function pageHref(basePath, params, page) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value != null && value !== false) query.set(key, String(value));
  });
  if (page > 1) query.set("page", String(page));
  else query.delete("page");
  const value = query.toString();
  return value ? `${basePath}?${value}` : basePath;
}

export function Pagination({ page, totalPages, basePath, params = {} }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((value) => value === 1 || value === totalPages || Math.abs(value - page) <= 1);
  return (
    <nav className="pagination" aria-label="Paginación del catálogo">
      {page > 1 ? <Link href={pageHref(basePath, params, page - 1)} rel="prev">Anterior</Link> : <span aria-disabled="true">Anterior</span>}
      <div>
        {pages.map((value, index) => (
          <span key={value}>
            {index > 0 && pages[index - 1] !== value - 1 ? <i aria-hidden="true">…</i> : null}
            {value === page ? <strong aria-current="page">{value}</strong> : <Link href={pageHref(basePath, params, value)}>{value}</Link>}
          </span>
        ))}
      </div>
      {page < totalPages ? <Link href={pageHref(basePath, params, page + 1)} rel="next">Siguiente</Link> : <span aria-disabled="true">Siguiente</span>}
    </nav>
  );
}
