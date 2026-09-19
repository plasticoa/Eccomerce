import { AdminActionForm } from "@/components/admin/admin-ui";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { changeRoleAction } from "@/features/admin/actions";
import { getInternalUsers } from "@/repositories/admin";

export const metadata = { title: "Usuarios · Administración" };
const date = (value) => new Intl.DateTimeFormat("es-GT", { dateStyle: "medium" }).format(new Date(value));

export default async function UsersPage({ searchParams }) {
  const params = await searchParams;
  const data = await getInternalUsers({ query: params?.q, page: params?.page });
  return <section>
    <AdminPageHeader title="Usuarios registrados" description="Clientes, operadores y administradores. Solo administradores pueden asignar roles; cada cambio queda auditado." />
    <form className="admin-filters"><label className="field"><span>Nombre o correo</span><input name="q" defaultValue={params?.q || ""} /></label><button className="button button-secondary">Buscar</button></form>
    {data.items.length ? <div className="admin-card-list">{data.items.map((profile) => <article className="user-card" key={profile.id}>
      <div><strong>{profile.full_name || profile.email || "Usuario"}</strong><span>{profile.email || "Sin correo"} · desde {date(profile.created_at)}</span></div>
      <AdminActionForm action={changeRoleAction} className="role-form" submitLabel="Actualizar rol">
        <input type="hidden" name="profileId" value={profile.id} />
        <label className="field"><span>Rol</span><select name="role" defaultValue={profile.role}><option value="customer">Cliente</option><option value="operator">Operador</option><option value="admin">Administrador</option></select></label>
      </AdminActionForm>
    </article>)}</div> : <AdminEmptyState title="No encontramos usuarios" />}
    <AdminPagination page={data.page} totalPages={data.totalPages} params={{ q: params?.q }} />
  </section>;
}
