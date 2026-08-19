"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  ["Dashboard", "/admin/dashboard", true],
  ["Productos", "/admin/productos", false],
  ["Categorías", "/admin/categorias", false],
  ["Inventario", "/admin/inventario", true],
  ["Pedidos", "/admin/pedidos", true],
  ["Clientes", "/admin/clientes", true],
  ["Usuarios", "/admin/usuarios", false],
  ["Promociones", "/admin/promociones", false],
  ["Personalización", "/admin/personalizacion", false],
  ["Configuración", "/admin/configuracion", false],
];

export function AdminSidebar({ role }) {
  const pathname = usePathname();
  return (
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/admin">Importadora Valiente</Link>
      <nav aria-label="Navegación administrativa">
        {sections.filter(([, , operator]) => role === "admin" || operator).map(([label, href]) => (
          <Link className={pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(`${href}/`)) ? "admin-nav-active" : ""} href={href} key={href}>{label}</Link>
        ))}
      </nav>
    </aside>
  );
}
