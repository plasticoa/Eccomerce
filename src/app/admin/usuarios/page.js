import { AdminActionForm } from "@/components/admin/admin-ui";
import { AdminPageHeader } from "@/components/admin/page-header";
import { changeRoleAction } from "@/features/admin/actions";
import { getInternalUsers } from "@/repositories/admin";

export const metadata = { title: "Usuarios internos · Administración" };
const date = (value) => new Intl.DateTimeFormat("es-GT", { dateStyle: "medium" }).format(new Date(value));

export default async function UsersPage() {
  const profiles = await getInternalUsers(); const internal = profiles.filter((profile) => profile.role !== "customer"); const candidates = profiles.filter((profile) => profile.role === "customer");
  return <section><AdminPageHeader title="Usuarios internos" description="Solo administradores pueden asignar permisos. Cada cambio queda auditado y el último admin está protegido." /><div className="admin-card-list">{internal.map((profile) => <article className="user-card" key={profile.id}><div><strong>{profile.full_name || profile.email || "Usuario"}</strong><span>{profile.email || "Sin correo"} · desde {date(profile.created_at)}</span></div><AdminActionForm action={changeRoleAction} className="role-form" submitLabel="Actualizar rol"><input type="hidden" name="profileId" value={profile.id} /><label className="field"><span>Rol</span><select name="role" defaultValue={profile.role}><option value="operator">Operador</option><option value="admin">Administrador</option><option value="customer">Convertir en cliente</option></select></label></AdminActionForm></article>)}</div><details className="admin-disclosure admin-section"><summary>Agregar usuario interno desde clientes</summary><div className="admin-card-list">{candidates.map((profile) => <article className="user-card" key={profile.id}><div><strong>{profile.full_name || profile.email || "Cliente"}</strong><span>{profile.email || "Sin correo"}</span></div><AdminActionForm action={changeRoleAction} className="role-form" submitLabel="Asignar"><input type="hidden" name="profileId" value={profile.id} /><label className="field"><span>Nuevo rol</span><select name="role"><option value="operator">Operador</option><option value="admin">Administrador</option></select></label></AdminActionForm></article>)}</div></details></section>;
}
