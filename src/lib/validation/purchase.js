const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

export function parseQuantity(value, max = 999) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) return null;
  return quantity;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function validateProfileInput(input) {
  const fullName = cleanText(input.fullName, 100);
  const phone = cleanText(input.phone, 30);
  if (fullName.length < 2) return { error: "Ingresa un nombre válido." };
  if (phone && phone.length < 7) return { error: "Ingresa un teléfono válido." };
  return { data: { full_name: fullName, phone: phone || null } };
}

export function validateAddressInput(input) {
  const data = {
    label: cleanText(input.label, 40) || null,
    recipient_name: cleanText(input.recipientName, 100),
    phone: cleanText(input.phone, 30) || null,
    line_1: cleanText(input.line1, 160),
    line_2: cleanText(input.line2, 160) || null,
    city: cleanText(input.city, 100),
    state_region: cleanText(input.stateRegion, 100) || null,
    postal_code: cleanText(input.postalCode, 20) || null,
    country_code: "GT",
    delivery_notes: cleanText(input.deliveryNotes, 240) || null,
    is_default: input.isDefault === true || input.isDefault === "true" || input.isDefault === "on",
  };
  if (data.recipient_name.length < 2) return { error: "Ingresa el nombre de quien recibe." };
  if (data.line_1.length < 5) return { error: "Ingresa una dirección completa." };
  if (data.city.length < 2) return { error: "Ingresa el municipio o ciudad." };
  if (data.phone && data.phone.length < 7) return { error: "Ingresa un teléfono válido." };
  return { data };
}

export function safeInternalPath(value, fallback = "/cuenta") {
  const path = String(value || "");
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
