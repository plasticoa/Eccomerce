import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { OrderDetail } from "@/components/orders/order-detail";
import { getCurrentUser } from "@/lib/auth";
import { getOrderByNumber } from "@/repositories/orders";
import { paymentPublicConfig } from "@/services/payment/payment-config";

export const metadata = { title: "Pedido confirmado", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmationPage({ params }) {
  if (!(await getCurrentUser())) redirect("/auth/login");
  const { orderNumber } = await params;
  const order = await getOrderByNumber(decodeURIComponent(orderNumber));
  if (!order) notFound();
  return <main className="confirmation-page shell"><OrderDetail order={order} confirmation paymentIdempotencyKey={randomUUID()} paymentConfig={paymentPublicConfig()} /></main>;
}
