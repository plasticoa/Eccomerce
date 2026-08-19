export const DEFAULT_SETTINGS = {
  storeName: "Importadora Valiente", logoUrl: "", faviconUrl: "", primaryColor: "#174c35", secondaryColor: "#246c4b", accentColor: "#d8a93f", currency: "GTQ",
  contact: { phone: "", whatsapp: "", email: "", address: "", hours: "" }, socialLinks: {},
  seo: { title: "Importadora Valiente", description: "Productos para el hogar y el trabajo en Importadora Valiente.", socialImage: "", canonicalDomain: "" },
  home: { eyebrow: "Importadora Valiente", title: "Soluciones valientes para cada proyecto.", subtitle: "Productos útiles para el hogar, el trabajo y esos planes que merecen empezar hoy.", buttonText: "Explorar productos", buttonUrl: "/productos", additionalMessage: "" },
  footer: { description: "Productos útiles, seleccionados con confianza.", links: [] },
};

export function getStorageAssetUrl(bucket, path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function normalizeSettings(row) {
  if (!row) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS, id: row.id, storeName: row.store_name || DEFAULT_SETTINGS.storeName,
    logoUrl: row.logo_url || "", faviconUrl: row.favicon_url || "",
    primaryColor: row.primary_color || DEFAULT_SETTINGS.primaryColor, secondaryColor: row.secondary_color || DEFAULT_SETTINGS.secondaryColor,
    accentColor: row.accent_color || DEFAULT_SETTINGS.accentColor, currency: row.currency || DEFAULT_SETTINGS.currency,
    contact: { ...DEFAULT_SETTINGS.contact, ...(row.contact_data || {}) }, socialLinks: row.social_links || {},
    seo: { ...DEFAULT_SETTINGS.seo, title: row.seo_title || row.store_name || DEFAULT_SETTINGS.seo.title,
      description: row.seo_description || DEFAULT_SETTINGS.seo.description, socialImage: row.social_image_url || "",
      canonicalDomain: row.canonical_domain || "" },
    home: { ...DEFAULT_SETTINGS.home, ...(row.home_content || {}) }, footer: { ...DEFAULT_SETTINGS.footer, ...(row.footer_content || {}) },
  };
}
