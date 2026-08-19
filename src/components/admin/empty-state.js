export function AdminEmptyState({ title = "Sin resultados", children }) {
  return <div className="admin-empty"><strong>{title}</strong>{children ? <p>{children}</p> : null}</div>;
}

