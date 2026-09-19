const labels = { pending: "Pendiente", confirmed: "Confirmado", payment_review: "Requiere revisión", processing: "Procesando", approved: "Pagado", ready: "Listo", shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado", authorized: "Autorizado", paid: "Pagado", failed: "Fallido", unknown: "Por confirmar", refunded: "Reembolsado", partially_refunded: "Reembolso parcial" };

export function OrderStatus({ status }) {
  const tone = ["delivered", "paid", "approved", "confirmed"].includes(status) ? "success" : ["cancelled", "failed", "payment_review"].includes(status) ? "danger" : "pending";
  return <span className={`status-badge status-${tone}`}>{labels[status] || status}</span>;
}
