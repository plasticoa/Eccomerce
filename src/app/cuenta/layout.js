import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/features/auth/actions";

const links = [["Resumen", "/cuenta"], ["Perfil", "/cuenta/perfil"], ["Direcciones", "/cuenta/direcciones"], ["Pedidos", "/cuenta/pedidos"]];

export const metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }) {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);
  if (!user) redirect("/auth/login");
  return <main className="account-shell shell"><header className="account-header"><Link className="brand" href="/"><span className="brand-mark">IV</span><span>Importadora Valiente</span></Link><div><span>{profile?.full_name || user.email}</span><form action={logoutAction}><button type="submit">Cerrar sesión</button></form></div></header><div className="account-layout"><aside className="account-sidebar"><p className="eyebrow">Mi cuenta</p><nav aria-label="Secciones de mi cuenta">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav><Link className="account-store-link" href="/">Volver a la tienda</Link></aside><section className="account-content">{children}</section></div></main>;
}
