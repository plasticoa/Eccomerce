import { AdminActionForm, AdminStatus } from "@/components/admin/admin-ui";
import { AdminDeleteButton, BulkSelection, BulkSelectionCheckbox, BulkSelectAllCheckbox } from "@/components/admin/bulk-selection";
import { AdminPageHeader } from "@/components/admin/page-header";
import { deleteCategoriesAction, saveCategoryAction } from "@/features/admin/actions";
import { getAdminCategories } from "@/repositories/admin";

export const metadata = { title: "Categorías · Administración" };

function CategoryFields({ category = {} }) {
  return <><input type="hidden" name="id" value={category.id || ""} /><div className="form-grid"><div className="field"><label htmlFor={`name-${category.id || "new"}`}>Nombre</label><input id={`name-${category.id || "new"}`} name="name" defaultValue={category.name || ""} required maxLength={120} /></div><div className="field"><label htmlFor={`slug-${category.id || "new"}`}>Slug</label><input id={`slug-${category.id || "new"}`} name="slug" defaultValue={category.slug || ""} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></div><div className="field field-wide"><label htmlFor={`description-${category.id || "new"}`}>Descripción</label><textarea id={`description-${category.id || "new"}`} name="description" rows="2" defaultValue={category.description || ""} /></div><div className="field"><label htmlFor={`seo-title-${category.id || "new"}`}>Título SEO</label><input id={`seo-title-${category.id || "new"}`} name="seoTitle" maxLength={70} defaultValue={category.seo_title || ""} /></div><div className="field field-wide"><label htmlFor={`seo-description-${category.id || "new"}`}>Descripción SEO</label><textarea id={`seo-description-${category.id || "new"}`} name="seoDescription" rows="2" maxLength={170} defaultValue={category.seo_description || ""} /></div></div><label className="check-field"><input type="checkbox" name="active" defaultChecked={category.id ? category.active : true} /> Categoría activa</label></>;
}

export default async function CategoriesPage() {
  const categories = await getAdminCategories();
  const visibleIds = categories.map((category) => category.id);
  return <section><AdminPageHeader title="Categorías" description="Organiza la navegación pública sin eliminar productos relacionados." /><details className="admin-disclosure"><summary>Nueva categoría</summary><AdminActionForm action={saveCategoryAction} submitLabel="Crear categoría"><CategoryFields /></AdminActionForm></details>{categories.length ? <BulkSelection action={deleteCategoriesAction} visibleIds={visibleIds} entityLabel="categoría(s)"><label className="bulk-select-all-line"><BulkSelectAllCheckbox /> Seleccionar todas las categorías visibles</label><div className="admin-card-list">{categories.map((category) => <details className="admin-disclosure" key={category.id}><summary><BulkSelectionCheckbox id={category.id} label={category.name} /><span><strong>{category.name}</strong><small>/{category.slug} · {category.product_categories?.[0]?.count || 0} productos</small></span><AdminStatus active={category.active} /></summary><AdminActionForm action={saveCategoryAction} submitLabel="Actualizar categoría"><CategoryFields category={category} /></AdminActionForm><AdminDeleteButton action={deleteCategoriesAction} id={category.id} entityLabel="categoría">Eliminar categoría</AdminDeleteButton></details>)}</div></BulkSelection> : null}</section>;
}
