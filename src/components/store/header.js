import Link from "next/link";
import { SearchBar } from "./search-bar";
import { CartIndicator } from "@/components/cart/cart-indicator";
import Image from "next/image";
import { getStorageAssetUrl } from "@/features/settings/settings-utils";

const links = [
  ["Inicio", "/"],
  ["Productos", "/productos"],
  ["Categorías", "/categorias"],
  ["Buscar", "/buscar"],
];

export function StoreHeader({ settings }) {
  const logo=getStorageAssetUrl("branding",settings?.logoUrl);
  const storeName=settings?.storeName||"Importadora Valiente";
  return (
    <header className="store-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label={`${storeName}, inicio`}>
          {logo?<Image className="store-logo" src={logo} alt="" width={150} height={48} priority/>:<span className="brand-mark" aria-hidden="true">IV</span>}
          <span>{storeName}</span>
        </Link>
        <nav className="desktop-nav" aria-label="Navegación principal">
          {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
          <CartIndicator />
          <Link className="nav-account" href="/cuenta">Cuenta</Link>
        </nav>
        <details className="mobile-nav">
          <summary aria-label="Abrir menú de navegación">Menú</summary>
          <div>
            <nav aria-label="Navegación móvil">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}<CartIndicator /><Link href="/cuenta">Cuenta</Link></nav>
            <SearchBar compact />
          </div>
        </details>
      </div>
    </header>
  );
}
