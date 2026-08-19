import Link from "next/link";

export default function StoreNotFound() {
  return <main className="center-page"><section className="auth-card"><p className="eyebrow">Página no encontrada</p><h1>Este producto o categoría no está disponible</h1><p>Puede que la dirección no exista o que el contenido ya no esté publicado.</p><Link className="button button-primary" href="/productos">Volver al catálogo</Link></section></main>;
}
