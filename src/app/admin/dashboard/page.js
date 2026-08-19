export const metadata = { title: "Administración" };

export default function DashboardPage() {
  return (
    <section><p className="eyebrow">Iteración 0</p><h1>Dashboard</h1><p className="admin-lead">La base administrativa está preparada. Los módulos operativos se habilitarán en próximas iteraciones.</p>
      <div className="placeholder-grid"><article><span>01</span><h2>Acceso protegido</h2><p>Autenticación y autorización de roles activas.</p></article><article><span>02</span><h2>Datos preparados</h2><p>Esquema inicial, relaciones y políticas RLS versionadas.</p></article><article><span>03</span><h2>Siguiente etapa</h2><p>Catálogo y operaciones permanecen fuera de alcance por ahora.</p></article></div>
    </section>
  );
}
