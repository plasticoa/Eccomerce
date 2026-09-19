
import { notFound } from "next/navigation";
import { OrderDetail } from "@/components/orders/order-detail";
import { getOrderByNumber } from "@/repositories/orders";


export const dynamic = "force-dynamic";

export default async function AccountOrderPage({ params }) {
  const { orderNumber } = await params;
  const order = await getOrderByNumber(decodeURIComponent(orderNumber));
  if (!order) notFound();
  return <OrderDetail order={order} />;
}
