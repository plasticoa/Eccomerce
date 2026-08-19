"use client";

export default function AdminError({ reset }) {
  return <section className="admin-empty" role="alert"><strong>No pudimos cargar esta sección</strong><p>La información no se reemplazó por valores aproximados. Intenta nuevamente.</p><button className="button button-primary" onClick={reset}>Reintentar</button></section>;
}
