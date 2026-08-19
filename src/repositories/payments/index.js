import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function paymentError(error, fallback) {
  const wrapped = new Error(fallback);
  wrapped.code = error?.code || "PAYMENT_DATABASE_ERROR";
  wrapped.databaseMessage = error?.message || "";
  return wrapped;
}

export async function createPaymentAttempt({ orderNumber, provider, idempotencyKey }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_payment_attempt", {
    p_order_number: orderNumber,
    p_provider: provider,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw paymentError(error, "PAYMENT_ATTEMPT_FAILED");
  return data;
}

export async function setPaymentProviderReference({ paymentId, providerReference, providerStatus }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_payment_provider_reference", {
    p_payment_id: paymentId,
    p_provider_reference: providerReference,
    p_provider_status: providerStatus,
  });
  if (error) throw paymentError(error, "PAYMENT_REFERENCE_FAILED");
  return data;
}

export async function getPaymentForCurrentUser(paymentId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, provider, provider_reference, status, amount, currency, processed_at, created_at, orders!inner(order_number, profile_id, status, payment_status)")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw paymentError(error, "PAYMENT_READ_FAILED");
  if (!data) return null;
  const order = Array.isArray(data.orders) ? data.orders[0] : data.orders;
  return {
    id: data.id,
    provider: data.provider,
    providerReference: data.provider_reference,
    status: data.status,
    amount: String(data.amount),
    currency: data.currency,
    processedAt: data.processed_at,
    createdAt: data.created_at,
    orderNumber: order?.order_number,
    orderStatus: order?.status,
    orderPaymentStatus: order?.payment_status,
  };
}

export async function processPaymentEvent(event) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("process_payment_webhook", {
    p_provider: event.provider,
    p_event_id: event.eventId,
    p_event_type: event.eventType,
    p_payment_reference: event.reference,
    p_provider_status: event.providerStatus,
    p_internal_status: event.status,
    p_amount: event.amount,
    p_currency: event.currency,
    p_payload_metadata: {
      occurredAt: event.occurredAt,
      normalizedStatus: event.status,
    },
  });
  if (error) throw paymentError(error, "PAYMENT_EVENT_PROCESSING_FAILED");
  return data;
}

export const paymentRepository = {
  createPaymentAttempt,
  setPaymentProviderReference,
  getPaymentForCurrentUser,
  processPaymentEvent,
};
