"use client";

import { useActionState, useEffect } from "react";
import { startPaymentAction } from "@/features/payments/actions";
import { formatCurrency } from "@/features/catalog/catalog-utils";
import { SubmitButton } from "@/components/ui/submit-button";
import { OrderStatus } from "@/components/orders/order-status";
import { TestPaymentSimulator } from "./development-payment-simulator";

function dateLabel(value) { return value ? new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Pendiente"; }

export function PaymentPanel({ orderNumber, orderStatus, paymentStatus, total, currency, payments = [], idempotencyKey, paymentConfig }) {
  const [state, action] = useActionState(startPaymentAction, {});
  useEffect(() => { if (state?.payment?.redirectUrl) window.location.assign(state.payment.redirectUrl); }, [state?.payment?.redirectUrl]);
  const latestStored = [...payments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const activePayment = state?.payment ? {
    id: state.payment.paymentId,
    provider: state.payment.provider,
    provider_reference: state.payment.providerReference,
    status: state.payment.status,
    amount: state.payment.amount,
    currency: state.payment.currency,
    created_at: new Date().toISOString(),
  } : latestStored;
  const approved = ["approved", "paid"].includes(paymentStatus);
  const review = orderStatus === "payment_review";
  const canStart = paymentConfig.configured && !approved && !review && orderStatus === "pending" && !["pending", "processing", "unknown"].includes(activePayment?.status);
  const canSimulate = paymentConfig.simulationEnabled && activePayment?.provider === "test" && ["pending", "processing", "unknown"].includes(activePayment?.status);

  return <section className={`payment-panel ${approved ? "payment-panel-approved" : review ? "payment-panel-review" : ""}`}><header><div><p className="eyebrow">Pago</p><h2>{approved ? "Pago aprobado" : review ? "Pago en revisión" : activePayment?.status === "failed" ? "El pago no pudo completarse" : "Pago pendiente"}</h2></div><OrderStatus status={paymentStatus} /></header><p>{approved ? "La venta quedó confirmada y el inventario fue actualizado por el webhook verificado." : review ? "El proveedor informó aprobación, pero la orden requiere revisión. No se descontó inventario de forma insegura." : "El pedido existe, pero solo se confirmará cuando un webhook válido apruebe el pago."}</p><div className="payment-provider-notice"><strong>{paymentConfig.providerLabel}</strong>{paymentConfig.testMode ? <span>Entorno de prueba · no es un cobro real</span> : null}</div>{canStart ? <form action={action} className="payment-start-form"><input type="hidden" name="orderNumber" value={orderNumber} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><SubmitButton pendingLabel="Procesando…">{activePayment?.status === "failed" || activePayment?.status === "cancelled" ? "Intentar nuevamente" : "Pagar pedido"}</SubmitButton>{state?.error ? <p className="form-message error" role="alert">{state.error}</p> : null}{state?.success ? <p className="form-message success" role="status">{state.success}</p> : null}</form> : null}{canSimulate ? <TestPaymentSimulator paymentId={activePayment.id} /> : null}{activePayment && !canSimulate && !approved && !review ? <p className="payment-awaiting">Estamos confirmando tu pago. El estado autoritativo llegará mediante el proveedor.</p> : null}{payments.length ? <div className="payment-history"><h3>Intentos de pago</h3>{[...payments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((payment) => <article key={payment.id}><div><strong>{payment.provider === "test" ? "Proveedor de prueba" : payment.provider}</strong><span>{payment.provider_reference || "Sin referencia"}</span><small>{payment.error_code ? `Revisión: ${payment.error_code}` : dateLabel(payment.processed_at || payment.created_at)}</small></div><OrderStatus status={payment.status} /><strong>{formatCurrency(payment.amount, payment.currency || currency)}</strong></article>)}</div> : null}<p className="payment-total">Monto del pedido: <strong>{formatCurrency(total, currency)}</strong></p></section>;
}
