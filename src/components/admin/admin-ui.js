"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";

export function AdminActionForm({ action, children, className = "admin-form", submitLabel = "Guardar", pendingLabel = "Guardando…", encType }) {
  const [state, formAction] = useActionState(action, {});
  return <form action={formAction} className={className} encType={encType}>{children}{state?.error ? <p className="form-message error" role="alert">{state.error}</p> : null}{state?.success ? <p className="form-message success" role="status">{state.success}</p> : null}<SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton></form>;
}

export function AdminStatus({ active, trueLabel = "Activo", falseLabel = "Inactivo" }) {
  return <span className={`status-badge status-${active ? "success" : "danger"}`}>{active ? trueLabel : falseLabel}</span>;
}

