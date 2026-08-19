import { createPaymentService } from "@/services/payment/payment-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { provider } = await params;
  const providerName = String(provider || "").toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(providerName)) return Response.json({ error: "Proveedor no válido." }, { status: 404 });
  const rawBody = await request.text();
  if (!rawBody || rawBody.length > 64_000) return Response.json({ error: "Payload no válido." }, { status: 400 });

  try {
    const result = await createPaymentService().handleWebhook(providerName, { rawBody, headers: request.headers });
    return Response.json({ received: true, duplicate: Boolean(result?.duplicate), state: result?.state || result?.eventStatus || "processed" });
  } catch (error) {
    const code = error?.message || "WEBHOOK_ERROR";
    if (code === "INVALID_WEBHOOK_SIGNATURE") return Response.json({ error: "Firma no válida." }, { status: 401 });
    if (code.startsWith("INVALID_") || code === "PAYMENT_PROVIDER_UNAVAILABLE" || code === "PAYMENT_TEST_WEBHOOK_SECRET_MISSING") {
      return Response.json({ error: "Evento no válido." }, { status: 400 });
    }
    console.error("[payment:webhook]", { provider: providerName, code: error?.code || code });
    return Response.json({ error: "Error temporal al procesar el evento." }, { status: 500 });
  }
}
