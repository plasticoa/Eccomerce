export function normalizeSiteUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function getSiteUrl(environment = process.env) {
  const configured = normalizeSiteUrl(environment.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;
  if (environment.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_SITE_URL_MISSING_OR_INVALID");
  return "http://localhost:3000";
}

export function resolveCanonicalBase(settings, environment = process.env) {
  return normalizeSiteUrl(settings?.seo?.canonicalDomain) || getSiteUrl(environment);
}

export function absoluteSiteUrl(path, base) {
  return new URL(path || "/", `${base.replace(/\/$/, "")}/`).toString();
}
