import { getPublicSettings } from "@/repositories/settings";
import { absoluteSiteUrl, resolveCanonicalBase } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function robots() {
  const settings = await getPublicSettings();
  const base = resolveCanonicalBase(settings);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/cuenta/", "/checkout", "/carrito", "/pedido/", "/pago/", "/api/", "/auth/"] }],
    sitemap: absoluteSiteUrl("/sitemap.xml", base),
    host: base,
  };
}
