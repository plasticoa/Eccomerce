import { StoreFooter } from "@/components/store/footer";
import { StoreHeader } from "@/components/store/header";
import { CartProvider } from "@/components/cart/cart-provider";
import { getCurrentUser } from "@/lib/auth";

export default async function StoreLayout({ children }) {
  const user = await getCurrentUser();
  return (
    <CartProvider userId={user?.id || null}>
      <div className="store-frame">
        <StoreHeader />
        <main>{children}</main>
        <StoreFooter />
      </div>
    </CartProvider>
  );
}
