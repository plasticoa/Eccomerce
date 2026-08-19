import { ProfileForm } from "@/components/account/profile-form";
import { getCurrentProfile } from "@/lib/auth";

export const metadata = { title: "Mi perfil" };

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  return <><header className="section-heading"><p className="eyebrow">Datos personales</p><h1>Mi perfil</h1><p>Solo puedes modificar tu nombre y teléfono. El rol y la identidad de la cuenta están protegidos.</p></header><ProfileForm profile={profile} /></>;
}
