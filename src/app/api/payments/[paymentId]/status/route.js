import { getCurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/validation/purchase";
import { getPaymentForCurrentUser } from "@/repositories/payments";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  if (!(await getCurrentUser())) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { paymentId } = await params;
  if (!isUuid(paymentId)) return Response.json({ error: "Pago no válido." }, { status: 400 });
  try {
    const payment = await getPaymentForCurrentUser(paymentId);
    if (!payment) return Response.json({ error: "Pago no encontrado." }, { status: 404 });
    return Response.json({ id: payment.id, status: payment.status, orderNumber: payment.orderNumber, processedAt: payment.processedAt });
  } catch {
    return Response.json({ error: "No pudimos consultar el pago." }, { status: 500 });
  }
}
