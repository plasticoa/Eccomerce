import { absoluteSiteUrl, resolveCanonicalBase } from "./site-url.js";

function descriptionFor(settings, description) {
  return String(description || settings?.seo?.description || `Productos para el hogar y el trabajo en ${settings?.storeName || "Importadora Valiente"}.`).trim().slice(0, 170);
}

function imageFor(settings, image, base) {
  const selected = image || settings?.seo?.socialImage || "";
  if (!selected) return undefined;
  try { return new URL(selected, `${base}/`).toString(); }
  catch { return undefined; }
}

export function buildPublicMetadata({ settings, title, description, path = "/", image = "", type = "website", noIndex = false }) {
  const base = resolveCanonicalBase(settings);
  const canonical = absoluteSiteUrl(path, base);
  const resolvedTitle = String(title || settings?.seo?.title || settings?.storeName || "Importadora Valiente").trim().slice(0, 70);
  const resolvedDescription = descriptionFor(settings, description);
  const socialImage = imageFor(settings, image, base);
  const images = socialImage ? [{ url: socialImage, alt: resolvedTitle }] : undefined;
  return {
    title: resolvedTitle,
    description: resolvedDescription,
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { type, locale: "es_GT", siteName: settings?.storeName || "Importadora Valiente", title: resolvedTitle, description: resolvedDescription, url: canonical, images },
    twitter: { card: socialImage ? "summary_large_image" : "summary", title: resolvedTitle, description: resolvedDescription, images: socialImage ? [socialImage] : undefined },
  };
}
