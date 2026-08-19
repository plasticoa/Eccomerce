import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getAddresses } from "@/repositories/addresses";
import { getOrders } from "@/repositories/orders";
import { ProfileForm } from "@/components/account/profile-form";

export const metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const [profile, addresses, orders] = await Promise.all([getCurrentProfile(), getAddresses(), getOrders()]);
  return <><header className="section-heading"><p className="eyebrow">Datos personales</p><h1>Mi cuenta</h1><p>Actualiza la información que utilizaremos para coordinar tus pedidos.</p></header><ProfileForm profile={profile} /><div className="account-overview"><Link href="/cuenta/direcciones"><strong>{addresses.length}</strong><span>Direcciones guardadas</span></Link><Link href="/cuenta/pedidos"><strong>{orders.length}</strong><span>Pedidos creados</span></Link></div></>;
}
