"use client";

import { useEffect } from "react";

export default function StoreError({ error, reset }) {
  useEffect(() => { console.error("Error en catálogo", error?.digest || "sin identificador"); }, [error]);
  return <main className="center-page"><section className="auth-card"><p className="eyebrow">Tuvimos un inconveniente</p><h1>No pudimos cargar el catálogo</h1><p>Intenta nuevamente. Si el problema continúa, vuelve más tarde.</p><button className="button button-primary" type="button" onClick={reset}>Intentar de nuevo</button></section></main>;
}
