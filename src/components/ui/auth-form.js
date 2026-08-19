"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "./submit-button";

const initialState = { error: "", success: "" };

export function AuthForm({ action, fields, hiddenFields = [], submitLabel, pendingLabel, footer }) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="auth-form">
      {hiddenFields.map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value} />)}
      {fields.map((field) => (
        <div className="field" key={field.name}>
          <label htmlFor={field.name}>{field.label}</label>
          <input
            id={field.name}
            name={field.name}
            type={field.type || "text"}
            autoComplete={field.autoComplete}
            minLength={field.minLength}
            required
          />
        </div>
      ))}
      {state?.error ? <p className="form-message error" role="alert">{state.error}</p> : null}
      {state?.success ? <p className="form-message success" role="status">{state.success}</p> : null}
      <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      {footer ? <p className="form-footer">{footer}</p> : null}
    </form>
  );
}

export function AuthLink({ href, children }) {
  return <Link href={href}>{children}</Link>;
}
