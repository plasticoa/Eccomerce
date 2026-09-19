import { redirect } from "next/navigation";
export default async function PaymentResultPage({ searchParams }) {
  const query = await searchParams;
  const number = String(query?.pedido || "");
  redirect(/^IV-\d{4}-\d{6,}$/.test(number) ? '/cuenta/pedidos/' + encodeURIComponent(number) : '/cuenta/pedidos');
}
