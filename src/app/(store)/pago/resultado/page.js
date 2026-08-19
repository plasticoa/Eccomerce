import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderDetail } from "@/components/orders/order-detail";
import { getCurrentUser } from "@/lib/auth";
import { getOrderByNumber } from "@/repositories/orders";
import { paymentPublicConfig } from "@/services/payment/payment-config";

export const metadata = { title: "Resultado del pago", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PaymentResultPage({ searchParams }) {
  if (!(await getCurrentUser())) redirect("/auth/login");
  const query = await searchParams;
  const orderNumber = String(query?.pedido || "");
  if (!/^IV-\d{4}-\d{6,}$/.test(orderNumber)) notFound();
  const order = await getOrderByNumber(orderNumber);
  if (!order) notFound();
  const pending = !["approved", "paid"].includes(order.payment_status) && order.status !== "payment_review";
  return <main className="confirmation-page shell"><div className="payment-result-heading"><p className="eyebrow">Resultado del proveedor</p><h1>{pending ? "Estamos confirmando tu pago" : order.status === "payment_review" ? "Tu pago requiere revisión" : "Pago aprobado"}</h1><p>Esta página no aprueba pagos por parámetros del navegador. El estado mostrado proviene de la orden procesada por el webhook.</p>{pending ? <Link className="button button-secondary" href={`/pago/resultado?pedido=${encodeURIComponent(orderNumber)}`}>Actualizar estado</Link> : null}</div><OrderDetail order={order} paymentIdempotencyKey={randomUUID()} paymentConfig={paymentPublicConfig()} /></main>;
}
