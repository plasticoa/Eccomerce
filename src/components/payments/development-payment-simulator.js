"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { simulateTestPaymentAction } from "@/features/payments/actions";

export function TestPaymentSimulator({ paymentId }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(simulateTestPaymentAction, {});
  useEffect(() => { if (state?.orderNumber) router.refresh(); }, [state?.orderNumber, router]);
  return <form action={action} className="test-payment-simulator"><input type="hidden" name="paymentId" value={paymentId} /><p><strong>Simulación de desarrollo</strong><span>Estos botones generan un webhook firmado de prueba. No cobran dinero.</span></p><div><button className="button button-primary" name="outcome" value="approved" disabled={pending}>Simular aprobación</button><button className="button button-secondary" name="outcome" value="failed" disabled={pending}>Simular fallo</button><button className="button button-quiet" name="outcome" value="cancelled" disabled={pending}>Simular cancelación</button></div>{state?.error ? <p className="form-message error" role="alert">{state.error}</p> : null}{state?.success ? <p className="form-message success" role="status">{state.success}</p> : null}</form>;
}
