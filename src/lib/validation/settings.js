const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const COUPON_CODE = /^[A-Z0-9_-]{3,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value, max = 300) { return String(value || "").trim().slice(0, max); }
function optionalUrl(value, { internal = false } = {}) {
  const raw = text(value, 500);
  if (!raw) return "";
  if (internal && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try { const url = new URL(raw); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : null; } catch { return null; }
}
function optionalDate(value) {
  const raw = String(value || "");
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function optionalOrigin(value) {
  const raw = text(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.pathname !== "/" && url.pathname !== "")) return null;
    return url.origin;
  } catch { return null; }
}

export function validateSiteSettingsInput(input) {
  const storeName = text(input.storeName, 120);
  const primaryColor = text(input.primaryColor, 7).toLowerCase();
  const secondaryColor = text(input.secondaryColor, 7).toLowerCase();
  const accentColor = text(input.accentColor, 7).toLowerCase();
  const currency = text(input.currency, 3).toUpperCase();
  const email = text(input.email, 180);
  const seoTitle = text(input.seoTitle, 71);
  const seoDescription = text(input.seoDescription, 171);
  const socialImage = optionalUrl(input.socialImage);
  const canonicalDomain = optionalOrigin(input.canonicalDomain);
  if (!storeName) return { error: "El nombre comercial es obligatorio." };
  if (![primaryColor, secondaryColor, accentColor].every((color) => HEX_COLOR.test(color))) return { error: "Los colores deben usar formato hexadecimal, por ejemplo #174c35." };
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "La moneda debe ser un código ISO de tres letras." };
  if (email && !EMAIL.test(email)) return { error: "Ingresa un correo electrónico válido." };
  if (seoTitle.length > 70) return { error: "El título SEO no puede superar 70 caracteres." };
  if (seoDescription.length > 170) return { error: "La descripción SEO no puede superar 170 caracteres." };
  if (input.socialImage && !socialImage) return { error: "La imagen social debe usar una URL HTTP o HTTPS válida." };
  if (input.canonicalDomain && !canonicalDomain) return { error: "El dominio canónico debe contener únicamente el origen, por ejemplo https://tienda.example." };
  for(const [label,value] of [["teléfono",text(input.phone,40)],["WhatsApp",text(input.whatsappNumber,40)]]) if(value&&!/^[+0-9 ()-]{7,30}$/.test(value)) return { error: `El ${label} no tiene un formato válido.` };
  const buttonUrl = optionalUrl(input.buttonUrl, { internal: true });
  if (input.buttonUrl && !buttonUrl) return { error: "El destino del botón principal no es válido." };
  const social = {};
  for (const key of ["facebook", "instagram", "tiktok", "whatsapp", "other"]) {
    const value = optionalUrl(input[key]);
    if (input[key] && !value) return { error: `El enlace de ${key} no es válido.` };
    if (value) social[key] = value;
  }
  const footerLinks = [1, 2, 3].map((position) => ({ label: text(input[`footerLinkLabel${position}`], 60), url: optionalUrl(input[`footerLinkUrl${position}`], { internal: true }) })).filter((link) => link.label && link.url);
  return { data: {
    storeName, primaryColor, secondaryColor, accentColor, currency,
    contactData: { phone: text(input.phone, 40), whatsapp: text(input.whatsappNumber, 40), email, address: text(input.address, 300), hours: text(input.hours, 300) },
    socialLinks: social,
    seo: { title: seoTitle || storeName, description: seoDescription, socialImage: socialImage || "", canonicalDomain: canonicalDomain || "" },
    homeContent: { eyebrow: text(input.eyebrow, 100), title: text(input.homeTitle, 180), subtitle: text(input.homeSubtitle, 500), buttonText: text(input.buttonText, 80), buttonUrl: buttonUrl || "", additionalMessage: text(input.additionalMessage, 300) },
    footerContent: { description: text(input.footerDescription, 300), links: footerLinks },
  } };
}

export function validateBannerInput(input) {
  const title = text(input.title, 180); const imageUrl = text(input.imageUrl, 500);
  const linkUrl = optionalUrl(input.linkUrl, { internal: true });
  const sortOrder = Number.parseInt(input.sortOrder, 10); const startsAt = optionalDate(input.startsAt); const endsAt = optionalDate(input.endsAt);
  if (!title) return { error: "El título del banner es obligatorio." };
  if (!imageUrl) return { error: "Selecciona una imagen para el banner." };
  if (input.linkUrl && !linkUrl) return { error: "El enlace del banner no es válido." };
  if (!Number.isInteger(sortOrder) || sortOrder < 0) return { error: "El orden debe ser un entero igual o mayor que cero." };
  if (startsAt === undefined || endsAt === undefined || (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt))) return { error: "El rango de fechas no es válido." };
  return { data: { title, subtitle: text(input.subtitle, 500), imageUrl, buttonText: text(input.buttonText, 80), linkUrl: linkUrl || "", sortOrder, active: Boolean(input.active), startsAt, endsAt } };
}

export function validateCouponInput(input) {
  const code = text(input.code, 40).toUpperCase(); const discountType = String(input.discountType || "");
  const discountValue = Number(input.discountValue); const minimumOrder = Number(input.minimumOrder);
  const usageLimit = input.usageLimit === "" || input.usageLimit == null ? null : Number.parseInt(input.usageLimit, 10);
  const startsAt = optionalDate(input.startsAt); const endsAt = optionalDate(input.endsAt);
  if (!COUPON_CODE.test(code)) return { error: "El código debe tener entre 3 y 40 letras, números, guiones o guion bajo." };
  if (!["fixed", "percentage"].includes(discountType) || !Number.isFinite(discountValue) || discountValue <= 0) return { error: "El descuento no es válido." };
  if (discountType === "percentage" && discountValue > 100) return { error: "El porcentaje no puede superar 100%." };
  if (!Number.isFinite(minimumOrder) || minimumOrder < 0) return { error: "El monto mínimo no es válido." };
  if (usageLimit != null && (!Number.isInteger(usageLimit) || usageLimit <= 0)) return { error: "El límite de usos debe ser mayor que cero." };
  if (startsAt === undefined || endsAt === undefined || (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt))) return { error: "El rango de vigencia no es válido." };
  return { data: { code, description: text(input.description, 300), discountType, discountValue, minimumOrder, usageLimit, active: Boolean(input.active), startsAt, endsAt } };
}

export function calculateCouponDiscount(subtotal, type, value) {
  const amount = type === "percentage" ? Math.round(Number(subtotal) * Number(value)) / 100 : Number(value);
  return Math.max(0, Math.min(Number(subtotal), Math.round(amount * 100) / 100));
}

export function isBannerVisible(banner, now = new Date()) {
  return Boolean(banner?.active) && (!banner.starts_at || new Date(banner.starts_at) <= now) && (!banner.ends_at || new Date(banner.ends_at) >= now);
}
