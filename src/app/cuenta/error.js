"use client";

export default function AccountError({ reset }) {
  return <section role="alert"><h2>No pudimos cargar tu información</h2><p>Ocurrió un error al consultar o guardar tus datos. Intenta nuevamente.</p><button className="button button-primary" onClick={reset}>Reintentar</button></section>;
}
