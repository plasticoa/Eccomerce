export const PAYMENT_STATUSES = Object.freeze({
  pending: "pending",
  processing: "processing",
  approved: "approved",
  failed: "failed",
  cancelled: "cancelled",
  ignored: "ignored",
});

const STATUS_ALIASES = new Map([
  ["pending", PAYMENT_STATUSES.pending],
  ["created", PAYMENT_STATUSES.pending],
  ["processing", PAYMENT_STATUSES.processing],
  ["in_process", PAYMENT_STATUSES.processing],
  ["authorized", PAYMENT_STATUSES.approved],
  ["approved", PAYMENT_STATUSES.approved],
  ["paid", PAYMENT_STATUSES.approved],
  ["succeeded", PAYMENT_STATUSES.approved],
  ["failed", PAYMENT_STATUSES.failed],
  ["declined", PAYMENT_STATUSES.failed],
  ["rejected", PAYMENT_STATUSES.failed],
  ["cancelled", PAYMENT_STATUSES.cancelled],
  ["canceled", PAYMENT_STATUSES.cancelled],
]);

export function normalizePaymentStatus(value) {
  return STATUS_ALIASES.get(String(value || "").trim().toLowerCase()) || PAYMENT_STATUSES.ignored;
}

export function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_PAYMENT_CURRENCY");
  return currency;
}

export function normalizeMoney(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw)) throw new Error("INVALID_PAYMENT_AMOUNT");
  return Number(raw).toFixed(2);
}

export function isTerminalPaymentStatus(status) {
  return [PAYMENT_STATUSES.approved, PAYMENT_STATUSES.failed, PAYMENT_STATUSES.cancelled].includes(status);
}
