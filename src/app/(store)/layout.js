import { StoreFooter } from "@/components/store/footer";
import { StoreHeader } from "@/components/store/header";
import { CartProvider } from "@/components/cart/cart-provider";
import { getCurrentUser } from "@/lib/auth";
import { getPublicSettings } from "@/repositories/settings";
import { getStorageAssetUrl } from "@/features/settings/settings-utils";
import { StoreSettingsProvider } from "@/components/store/store-settings-provider";
import { resolveCanonicalBase } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function generateMetadata(){const settings=await getPublicSettings();const favicon=getStorageAssetUrl("branding",settings.faviconUrl);const metadataBase=new URL(resolveCanonicalBase(settings));return{metadataBase,title:{default:settings.seo.title||settings.storeName,template:`%s | ${settings.storeName}`},description:settings.seo.description,icons:favicon?{icon:favicon}:undefined,openGraph:{siteName:settings.storeName,locale:"es_GT",type:"website"},twitter:{card:settings.seo.socialImage?"summary_large_image":"summary"}};}

export default async function StoreLayout({ children }) {
  const [user,settings] = await Promise.all([getCurrentUser(),getPublicSettings()]);
  return (
    <StoreSettingsProvider currency={settings.currency}><CartProvider userId={user?.id || null}>
      <div className="store-frame" style={{"--green":settings.primaryColor,"--green-2":settings.secondaryColor,"--gold":settings.accentColor,"--color-primary":settings.primaryColor,"--color-secondary":settings.secondaryColor,"--color-accent":settings.accentColor}}>
        <StoreHeader settings={settings} />
        <main>{children}</main>
        <StoreFooter settings={settings} />
      </div>
    </CartProvider></StoreSettingsProvider>
  );
}
