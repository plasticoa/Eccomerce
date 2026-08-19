import { AddressesManager } from "@/components/account/addresses-manager";
import { getAddresses } from "@/repositories/addresses";

export const metadata = { title: "Mis direcciones" };

export default async function AddressesPage() {
  const addresses = await getAddresses();
  return <><header className="section-heading"><p className="eyebrow">Entrega</p><h1>Mis direcciones</h1><p>Administra los destinos disponibles para tus pedidos.</p></header><AddressesManager addresses={addresses} /></>;
}
