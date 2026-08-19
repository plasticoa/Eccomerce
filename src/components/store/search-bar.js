export function SearchBar({ defaultValue = "", compact = false }) {
  return (
    <form className={compact ? "search-bar search-bar-compact" : "search-bar"} action="/buscar" method="get" role="search">
      <label className="sr-only" htmlFor={compact ? "header-search" : "catalog-search"}>Buscar productos por nombre o SKU</label>
      <input id={compact ? "header-search" : "catalog-search"} type="search" name="q" defaultValue={defaultValue} maxLength={80} placeholder="Buscar por producto o SKU" />
      <button className="button button-primary" type="submit">Buscar</button>
    </form>
  );
}
