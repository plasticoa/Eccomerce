import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentProvider } from "./payment-provider.js";
import { normalizeCurrency, normalizeMoney, normalizePaymentStatus } from "../payment-status.js";

function headerValue(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name);
  return headers?.[name] || headers?.[name.toLowerCase()] || null;
}

function safeEqualHex(left, right) {
  if (!/^[0-9a-f]+$/i.test(left || "") || !/^[0-9a-f]+$/i.test(right || "")) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class TestPaymentProvider extends PaymentProvider {
  constructor({ secret, now = () => Date.now(), maxAgeSeconds = 300 } = {}) {
    super({ id: "test", label: "Proveedor de pago de prueba" });
    if (!secret || String(secret).length < 16) throw new Error("PAYMENT_TEST_WEBHOOK_SECRET_MISSING");
    this.secret = String(secret);
    this.now = now;
    this.maxAgeSeconds = maxAgeSeconds;
  }

  async createPayment(order) {
    const amount = normalizeMoney(order?.amount);
    const currency = normalizeCurrency(order?.currency);
    if (!/^[0-9a-f-]{36}$/i.test(String(order?.paymentId || ""))) throw new Error("INVALID_PAYMENT_ID");
    return {
      provider: this.id,
      providerReference: `test_${order.paymentId.replaceAll("-", "")}`,
      providerStatus: "PROCESSING",
      status: "processing",
      amount,
      currency,
      testMode: true,
    };
  }

  signature(rawBody, timestamp) {
    return createHmac("sha256", this.secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  }

  signedHeaders(rawBody, timestamp = Math.floor(this.now() / 1000)) {
    return {
      "x-test-timestamp": String(timestamp),
      "x-test-signature": this.signature(rawBody, timestamp),
    };
  }

  verifyWebhook({ rawBody, headers }) {
    const timestamp = Number(headerValue(headers, "x-test-timestamp"));
    const signature = String(headerValue(headers, "x-test-signature") || "");
    if (!Number.isInteger(timestamp) || !signature) return false;
    const age = Math.abs(Math.floor(this.now() / 1000) - timestamp);
    if (age > this.maxAgeSeconds) return false;
    return safeEqualHex(signature, this.signature(rawBody, timestamp));
  }

  parseWebhook(rawBody) {
    let payload;
    try { payload = JSON.parse(rawBody); }
    catch { throw new Error("INVALID_WEBHOOK_JSON"); }
    const eventId = String(payload?.eventId || "").trim();
    const reference = String(payload?.reference || "").trim();
    const providerStatus = String(payload?.status || "").trim();
    if (!/^[A-Za-z0-9_-]{6,200}$/.test(eventId)) throw new Error("INVALID_WEBHOOK_EVENT_ID");
    if (!/^[A-Za-z0-9_-]{6,200}$/.test(reference)) throw new Error("INVALID_PAYMENT_REFERENCE");
    const eventType = String(payload?.type || "payment.updated").slice(0, 100);
    const status = eventType === "payment.updated" ? normalizePaymentStatus(providerStatus) : "ignored";
    return {
      provider: this.id,
      eventId,
      eventType,
      reference,
      providerStatus: providerStatus.slice(0, 100),
      status,
      amount: status === "ignored" ? null : normalizeMoney(payload?.amount),
      currency: status === "ignored" ? null : normalizeCurrency(payload?.currency),
      occurredAt: typeof payload?.occurredAt === "string" ? payload.occurredAt.slice(0, 40) : null,
    };
  }

  async getPaymentStatus(reference) {
    return { reference, status: "processing" };
  }
}
