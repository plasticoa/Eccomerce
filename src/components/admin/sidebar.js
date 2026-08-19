import Link from "next/link";

const futureSections = [
  "Productos",
  "Inventario",
  "Pedidos",
  "Clientes",
  "Promociones",
  "Personalización",
  "Configuración",
];

export function AdminSidebar() {
  return (
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/admin">Importadora Valiente</Link>
      <nav aria-label="Navegación administrativa">
        <Link className="admin-nav-active" href="/admin/dashboard">Dashboard</Link>
        {futureSections.map((section) => (
          <span className="admin-nav-disabled" aria-disabled="true" key={section}>
            {section}<small>Próximamente</small>
          </span>
        ))}
      </nav>
    </aside>
  );
}
