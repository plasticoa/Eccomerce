import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PaymentService } from "../src/services/payment/payment-service.js";
import { InventoryService } from "../src/services/inventory/inventory-service.js";
import { OrderService } from "../src/services/orders/order-service.js";
import { TestPaymentProvider } from "../src/services/payment/providers/development-payment-provider.js";
import { normalizeCurrency, normalizeMoney, normalizePaymentStatus } from "../src/services/payment/payment-status.js";
import { configuredProviderName, isTestSimulationEnabled } from "../src/services/payment/payment-config.js";

const migration = readFileSync(new URL("../supabase/migrations/202608100004_payments_inventory.sql", import.meta.url), "utf8");
const initial = readFileSync(new URL("../supabase/migrations/202608100001_initial_schema.sql", import.meta.url), "utf8");
const secret = "test-secret-at-least-16-characters";
const fixedNow = Date.parse("2026-08-10T20:00:00.000Z");

test("normaliza estados externos, monto decimal y moneda", () => {
  assert.equal(normalizePaymentStatus("AUTHORIZED"), "approved");
  assert.equal(normalizePaymentStatus("DECLINED"), "failed");
  assert.equal(normalizePaymentStatus("CANCELED"), "cancelled");
  assert.equal(normalizePaymentStatus("unexpected"), "ignored");
  assert.equal(normalizeMoney("125.5"), "125.50");
  assert.equal(normalizeCurrency("gtq"), "GTQ");
  assert.throws(() => normalizeMoney("1.234"), /INVALID_PAYMENT_AMOUNT/);
});

test("proveedor test crea referencia sin realizar cobro real", async () => {
  const provider = new TestPaymentProvider({ secret, now: () => fixedNow });
  const result = await provider.createPayment({ paymentId: "123e4567-e89b-42d3-a456-426614174000", amount: "260.00", currency: "GTQ" });
  assert.equal(result.provider, "test");
  assert.equal(result.status, "processing");
  assert.equal(result.testMode, true);
  assert.match(result.providerReference, /^test_[0-9a-f]+$/);
  assert.equal(result.redirectUrl, undefined);
});

test("webhook de prueba exige firma vigente y verifica raw body", () => {
  const provider = new TestPaymentProvider({ secret, now: () => fixedNow });
  const rawBody = JSON.stringify({ eventId: "evt_123456", reference: "test_123456", status: "APPROVED", amount: "20.00", currency: "GTQ" });
  const timestamp = Math.floor(fixedNow / 1000);
  const headers = provider.signedHeaders(rawBody, timestamp);
  assert.equal(provider.verifyWebhook({ rawBody, headers }), true);
  assert.equal(provider.verifyWebhook({ rawBody: `${rawBody} `, headers }), false);
  assert.equal(provider.verifyWebhook({ rawBody, headers: { ...headers, "x-test-signature": "00".repeat(32) } }), false);
  assert.equal(provider.verifyWebhook({ rawBody, headers: provider.signedHeaders(rawBody, timestamp - 301) }), false);
});

test("parseWebhook valida estructura, monto, moneda y estado", () => {
  const provider = new TestPaymentProvider({ secret, now: () => fixedNow });
  const event = provider.parseWebhook(JSON.stringify({ eventId: "evt_123456", type: "payment.updated", reference: "test_123456", status: "APPROVED", amount: "20", currency: "gtq" }));
  assert.equal(event.status, "approved");
  assert.equal(event.amount, "20.00");
  assert.equal(event.currency, "GTQ");
  const ignored = provider.parseWebhook(JSON.stringify({ eventId: "evt_654321", type: "customer.updated", reference: "test_123456", status: "APPROVED" }));
  assert.equal(ignored.status, "ignored");
  assert.equal(ignored.amount, null);
  assert.throws(() => provider.parseWebhook("{}"), /INVALID_WEBHOOK_EVENT_ID/);
});

test("PaymentService inicia intento con monto retornado por servidor y adjunta referencia", async () => {
  const calls = [];
  const provider = new TestPaymentProvider({ secret, now: () => fixedNow });
  const repository = {
    async createPaymentAttempt(input) { calls.push(["create", input]); return { paymentId: "123e4567-e89b-42d3-a456-426614174000", orderNumber: "IV-2026-000001", amount: "85.00", currency: "GTQ", status: "pending", provider: "test" }; },
    async setPaymentProviderReference(input) { calls.push(["attach", input]); return { paymentId: input.paymentId, provider: "test", providerReference: input.providerReference, status: "processing" }; },
  };
  const service = new PaymentService({ providerResolver: () => provider, paymentRepository: repository, orderService: {} });
  const result = await service.startPayment({ orderNumber: "IV-2026-000001", idempotencyKey: "123e4567-e89b-42d3-a456-426614174001", amount: "0.01" });
  assert.equal(result.amount, "85.00");
  assert.equal(calls[0][1].amount, undefined);
  assert.equal(calls[1][1].paymentId, "123e4567-e89b-42d3-a456-426614174000");
});

test("PaymentService rechaza webhook inválido antes de llamar OrderService", async () => {
  let processed = 0;
  const provider = new TestPaymentProvider({ secret, now: () => fixedNow });
  const service = new PaymentService({ providerResolver: () => provider, paymentRepository: {}, orderService: { async processPaymentEvent() { processed += 1; } } });
  await assert.rejects(() => service.handleWebhook("test", { rawBody: "{}", headers: {} }), /INVALID_WEBHOOK_SIGNATURE/);
  assert.equal(processed, 0);
});

test("error al contactar proveedor conserva intento pendiente y no inventa fallo", async () => {
  let attached = 0;
  const repository = {
    async createPaymentAttempt() { return { paymentId: "123e4567-e89b-42d3-a456-426614174000", orderNumber: "IV-2026-000001", amount: "85.00", currency: "GTQ", status: "pending", provider: "test" }; },
    async setPaymentProviderReference() { attached += 1; },
  };
  const provider = { id: "test", async createPayment() { throw new Error("NETWORK_UNCERTAIN"); } };
  const service = new PaymentService({ providerResolver: () => provider, paymentRepository: repository, orderService: {} });
  await assert.rejects(() => service.startPayment({ orderNumber: "IV-2026-000001", idempotencyKey: "123e4567-e89b-42d3-a456-426614174001" }), /NETWORK_UNCERTAIN/);
  assert.equal(attached, 0);
});

test("webhook firmado válido entrega un evento normalizado al OrderService", async () => {
  const provider = new TestPaymentProvider({ secret, now: () => fixedNow });
  const rawBody = JSON.stringify({ eventId: "evt_123456", type: "payment.updated", reference: "test_123456", status: "APPROVED", amount: "20.00", currency: "GTQ" });
  let received;
  const service = new PaymentService({ providerResolver: () => provider, paymentRepository: {}, orderService: { async processPaymentEvent(event) { received = event; return { state: event.status }; } } });
  const result = await service.handleWebhook("test", { rawBody, headers: provider.signedHeaders(rawBody, Math.floor(fixedNow / 1000)) });
  assert.equal(received.status, "approved");
  assert.equal(received.amount, "20.00");
  assert.deepEqual(result, { state: "approved" });
});

test("OrderService confirma solo eventos aprobados y conserva fallos sin inventario", async () => {
  let commits = 0;
  let regular = 0;
  const repository = { async processPaymentEvent() { regular += 1; return { state: "failed" }; } };
  const inventory = { async commitSale() { commits += 1; return { state: "approved" }; } };
  const service = new OrderService({ paymentRepository: repository, inventoryService: inventory });
  await service.processPaymentEvent({ eventId: "evt_1", reference: "ref_1", status: "failed" });
  await service.processPaymentEvent({ eventId: "evt_2", reference: "ref_1", status: "approved" });
  assert.equal(regular, 1);
  assert.equal(commits, 1);
  await assert.rejects(() => service.confirmPayment({ status: "failed" }), /PAYMENT_NOT_APPROVED/);
});

test("InventoryService distingue stock suficiente e insuficiente", () => {
  const service = new InventoryService({ paymentRepository: { processPaymentEvent() {} } });
  assert.deepEqual(service.validateStock([{ quantity: 2, stock: 2 }]), { valid: true });
  assert.deepEqual(service.validateStock([{ quantity: 3, stock: 2 }]), { valid: false, error: "INSUFFICIENT_STOCK" });
  assert.deepEqual(service.validateStock([{ quantity: 0, stock: 2 }]), { valid: false, error: "INVALID_QUANTITY" });
});

test("proveedor test y simulación quedan fuera de producción", () => {
  assert.equal(configuredProviderName({ NODE_ENV: "development" }), "test");
  assert.equal(configuredProviderName({ NODE_ENV: "production" }), null);
  assert.equal(configuredProviderName({ NODE_ENV: "production", PAYMENT_PROVIDER: "test" }), null);
  assert.equal(isTestSimulationEnabled({ NODE_ENV: "production", PAYMENT_PROVIDER: "test", PAYMENT_TEST_MODE_ENABLED: "true", PAYMENT_TEST_WEBHOOK_SECRET: secret }), false);
  assert.equal(isTestSimulationEnabled({ NODE_ENV: "development", PAYMENT_PROVIDER: "test", PAYMENT_TEST_MODE_ENABLED: "true", PAYMENT_TEST_WEBHOOK_SECRET: secret }), true);
});

test("contrato SQL mantiene idempotencia persistente de intento, evento y movimiento", () => {
  assert.match(migration, /payments_order_provider_idempotency_unique/);
  assert.match(migration, /unique\(provider, provider_event_id\)/i);
  assert.match(migration, /inventory_movements_one_sale_per_order_variant/);
  assert.match(migration, /on conflict \(provider, provider_event_id\) do nothing/i);
  assert.match(migration, /if v_order\.status = 'confirmed'/i);
});

test("confirmación SQL valida monto/moneda, bloquea concurrencia y evita stock negativo", () => {
  assert.match(migration, /round\(p_amount, 2\) <> round\(v_order\.total, 2\)/i);
  assert.match(migration, /upper\(coalesce\(p_currency, ''\)\) <> upper\(v_order\.currency\)/i);
  assert.match(migration, /where id = v_payment\.order_id\s+for update/i);
  assert.match(migration, /order by item\.variant_id\s+for update of stock/i);
  assert.match(migration, /where variant_id = v_line\.variant_id and quantity >= v_line\.quantity/i);
  assert.match(initial, /quantity integer not null default 0 check \(quantity >= 0\)/i);
});

test("venta usa salida negativa, revisión por falta de stock y función solo backend", () => {
  assert.match(migration, /v_line\.variant_id, -v_line\.quantity, 'out'/i);
  assert.match(migration, /v_error_code := 'INSUFFICIENT_STOCK'/i);
  assert.match(migration, /status = 'payment_review'/i);
  assert.match(migration, /revoke all on function public\.process_payment_webhook[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.process_payment_webhook[\s\S]*to service_role/i);
  assert.match(migration, /revoke insert, update, delete on public\.payments from authenticated/i);
});
