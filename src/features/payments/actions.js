"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/validation/purchase";
import { getPaymentForCurrentUser } from "@/repositories/payments";
import { createPaymentService } from "@/services/payment/payment-service.server";
import { createPaymentProvider, isTestSimulationEnabled } from "@/services/payment/payment-config";
import { logServerError } from "@/lib/observability/logger";

const ORDER_NUMBER_PATTERN = /^IV-\d{4}-\d{6,}$/;
const TEST_OUTCOMES = new Set(["approved", "failed", "cancelled", "pending"]);

function friendlyPaymentError(error) {
  const detail = `${error?.message || ""} ${error?.databaseMessage || ""}`;
  if (detail.includes("ORDER_ALREADY_PAID")) return "Este pedido ya fue pagado.";
  if (detail.includes("ORDER_NOT_FOUND")) return "No encontramos un pedido disponible para pagar.";
  if (detail.includes("ORDER_NOT_PAYABLE")) return "Este pedido no admite un nuevo intento de pago.";
  if (detail.includes("PAYMENT_PROVIDER_NOT_CONFIGURED")) return "El proveedor de pago aún no está configurado.";
  if (detail.includes("PAYMENT_TEST_WEBHOOK_SECRET_MISSING")) return "Falta configurar el proveedor de pago de prueba.";
  if (detail.includes("PAYMENT_TEST_PROVIDER_DISABLED")) return "El proveedor de prueba no está disponible en producción.";
  return "No pudimos iniciar el pago. Intenta nuevamente.";
}

export async function startPaymentAction(_state, formData) {
  if (!(await getCurrentUser())) return { error: "Tu sesión expiró. Inicia sesión nuevamente." };
  const orderNumber = String(formData.get("orderNumber") || "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") || "");
  if (!ORDER_NUMBER_PATTERN.test(orderNumber) || !isUuid(idempotencyKey)) return { error: "Solicitud de pago no válida." };
  try {
    const payment = await createPaymentService().startPayment({ orderNumber, idempotencyKey });
    revalidatePath(`/cuenta/pedidos/${orderNumber}`);
    revalidatePath(`/pedido/confirmacion/${orderNumber}`);
    return { success: "Intento de pago creado.", payment };
  } catch (error) {
    logServerError("payment.start.failed", error, { action: "startPayment", orderNumber });
    return { error: friendlyPaymentError(error) };
  }
}

export async function simulateTestPaymentAction(_state, formData) {
  if (!(await getCurrentUser())) return { error: "Tu sesión expiró." };
  if (!isTestSimulationEnabled()) return { error: "La simulación de pagos está deshabilitada." };
  const paymentId = String(formData.get("paymentId") || "");
  const outcome = String(formData.get("outcome") || "").toLowerCase();
  if (!isUuid(paymentId) || !TEST_OUTCOMES.has(outcome)) return { error: "Simulación no válida." };

  try {
    const payment = await getPaymentForCurrentUser(paymentId);
    if (!payment || payment.provider !== "test" || !payment.providerReference) return { error: "Intento de pago no disponible." };
    if (payment.status === "approved") return { success: "Este pago ya fue aprobado.", orderNumber: payment.orderNumber };
    const providerStatus = { approved: "APPROVED", failed: "DECLINED", cancelled: "CANCELLED", pending: "PENDING" }[outcome];
    const rawBody = JSON.stringify({
      eventId: `evt_${randomUUID().replaceAll("-", "")}`,
      type: "payment.updated",
      reference: payment.providerReference,
      status: providerStatus,
      amount: payment.amount,
      currency: payment.currency,
      occurredAt: new Date().toISOString(),
    });
    const provider = createPaymentProvider("test");
    const result = await createPaymentService().handleWebhook("test", {
      rawBody,
      headers: provider.signedHeaders(rawBody),
    });
    revalidatePath(`/cuenta/pedidos/${payment.orderNumber}`);
    revalidatePath(`/pedido/confirmacion/${payment.orderNumber}`);
    revalidatePath("/cuenta/pedidos");
    if (result.state === "payment_review") return { error: "El pago fue aprobado, pero el pedido requiere revisión por inventario o consistencia.", orderNumber: payment.orderNumber };
    return { success: `Evento ${outcome} procesado.`, orderNumber: payment.orderNumber, result };
  } catch (error) {
    logServerError("payment.test_simulation.failed", error, { action: "simulateTestPayment", paymentId });
    return { error: "No pudimos procesar el evento de prueba." };
  }
}
