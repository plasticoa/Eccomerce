"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html lang="es">
      <body>
        <main className="error-page shell">
          <p className="eyebrow">Error inesperado</p>
          <h1>No pudimos cargar la aplicación</h1>
          <p>Intenta nuevamente. Si el problema continúa, comparte este identificador con soporte: {error?.digest || "sin-identificador"}.</p>
          <button className="button button-primary" type="button" onClick={reset}>Intentar de nuevo</button>
        </main>
      </body>
    </html>
  );
}
