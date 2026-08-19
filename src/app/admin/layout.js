import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/sidebar";
import { logoutAction } from "@/features/auth/actions";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Administración", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  const profile = await getCurrentProfile();
  if (!profile || !["operator", "admin"].includes(profile.role)) redirect("/no-autorizado");

  return (
    <div className="admin-frame">
      <AdminSidebar role={profile.role} />
      <div className="admin-workspace">
        <header className="admin-header"><div><span>Panel administrativo · {profile.role === "admin" ? "Administrador" : "Operador"}</span><strong>{profile.full_name || user.email}</strong></div><form action={logoutAction}><button className="button button-quiet" type="submit">Cerrar sesión</button></form></header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
