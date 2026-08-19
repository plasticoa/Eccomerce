export function CatalogFilters({ categories, values, action = "/productos", fixedCategory = "" }) {
  return (
    <form className="catalog-filters" action={action} method="get">
      <div className="filter-heading"><strong>Filtrar catálogo</strong><a href={action}>Limpiar</a></div>
      {fixedCategory ? <input type="hidden" name="categoria" value={fixedCategory} /> : (
        <div className="field">
          <label htmlFor="filter-category">Categoría</label>
          <select id="filter-category" name="categoria" defaultValue={values.category}>
            <option value="">Todas las categorías</option>
            {categories.map((category) => <option value={category.slug} key={category.id}>{category.name}</option>)}
          </select>
        </div>
      )}
      <div className="filter-price-row">
        <div className="field"><label htmlFor="filter-min">Precio mínimo</label><input id="filter-min" type="number" name="min" min="0" step="0.01" defaultValue={values.minPrice ?? ""} placeholder="Q 0" /></div>
        <div className="field"><label htmlFor="filter-max">Precio máximo</label><input id="filter-max" type="number" name="max" min="0" step="0.01" defaultValue={values.maxPrice ?? ""} placeholder="Sin límite" /></div>
      </div>
      <label className="checkbox-field"><input type="checkbox" name="disponible" value="true" defaultChecked={values.availableOnly} /><span>Solo productos disponibles</span></label>
      <button className="button button-primary" type="submit">Aplicar filtros</button>
    </form>
  );
}
