"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingLabel = "Procesando…" }) {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
