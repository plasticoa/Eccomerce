import Link from "next/link";

export default function UnauthorizedPage() {
  return <main className="center-page"><section className="auth-card"><p className="eyebrow">Acceso restringido</p><h1>No tienes autorización</h1><p>El panel administrativo está disponible solo para personal autorizado.</p><Link className="button button-primary" href="/cuenta">Volver a mi cuenta</Link></section></main>;
}
