import { AdminActionForm } from "@/components/admin/admin-ui";
import { AdminDeleteButton, BulkSelection, BulkSelectionCheckbox, BulkSelectAllCheckbox } from "@/components/admin/bulk-selection";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { changeRoleAction, deleteUsersAction } from "@/features/admin/actions";
import { getCurrentUser } from "@/lib/auth";
import { getInternalUsers } from "@/repositories/admin";

export const metadata = { title: "Usuarios · Administración" };
const date = (value) => new Intl.DateTimeFormat("es-GT", { dateStyle: "medium" }).format(new Date(value));

export default async function UsersPage({ searchParams }) {
  const params = await searchParams;
  const [data, currentUser] = await Promise.all([
    getInternalUsers({ query: params?.q, page: params?.page }),
    getCurrentUser(),
  ]);
  const deletableIds = data.items.filter((profile) => profile.id !== currentUser?.id).map((profile) => profile.id);

  return <section>
    <AdminPageHeader title="Usuarios registrados" description="Clientes, operadores y administradores. Los usuarios con pedidos se conservan para proteger el historial." />
    <form className="admin-filters"><label className="field"><span>Nombre o correo</span><input name="q" defaultValue={params?.q || ""} /></label><button className="button button-secondary">Buscar</button></form>
    {data.items.length ? <BulkSelection action={deleteUsersAction} visibleIds={deletableIds} entityLabel="usuario(s)">
      <label className="bulk-select-all-line"><BulkSelectAllCheckbox /> Seleccionar todos los usuarios eliminables visibles</label>
      <div className="admin-card-list">{data.items.map((profile) => {
        const isCurrent = profile.id === currentUser?.id;
        return <article className="user-card" key={profile.id}>
          <BulkSelectionCheckbox id={profile.id} label={profile.full_name || profile.email || "usuario"} disabled={isCurrent} />
          <div><strong>{profile.full_name || profile.email || "Usuario"}</strong><span>{profile.email || "Sin correo"} · desde {date(profile.created_at)}{isCurrent ? " · sesión actual" : ""}</span></div>
          <AdminActionForm action={changeRoleAction} className="role-form" submitLabel="Actualizar rol">
            <input type="hidden" name="profileId" value={profile.id} />
            <label className="field"><span>Rol</span><select name="role" defaultValue={profile.role}><option value="customer">Cliente</option><option value="operator">Operador</option><option value="admin">Administrador</option></select></label>
          </AdminActionForm>
          {!isCurrent ? <AdminDeleteButton action={deleteUsersAction} id={profile.id} entityLabel="usuario">Eliminar usuario</AdminDeleteButton> : null}
        </article>;
      })}</div>
    </BulkSelection> : <AdminEmptyState title="No encontramos usuarios" />}
    <AdminPagination page={data.page} totalPages={data.totalPages} params={{ q: params?.q }} />
  </section>;
}
