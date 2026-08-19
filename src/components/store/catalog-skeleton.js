export function CatalogSkeleton({ detail = false }) {
  if (detail) return <div className="detail-skeleton" aria-label="Cargando producto"><div /><section><i /><i /><i /><i /></section></div>;
  return <div className="catalog-skeleton" aria-label="Cargando productos">{Array.from({ length: 8 }, (_, index) => <div key={index}><i /><span /><span /></div>)}</div>;
}
