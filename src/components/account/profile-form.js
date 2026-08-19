"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/features/account/actions";
import { SubmitButton } from "@/components/ui/submit-button";

export function ProfileForm({ profile }) {
  const [state, action] = useActionState(updateProfileAction, {});
  return <form action={action} className="panel-form"><div className="form-grid"><div className="field"><label htmlFor="fullName">Nombre completo</label><input id="fullName" name="fullName" defaultValue={profile?.full_name || ""} required /></div><div className="field"><label htmlFor="phone">Teléfono</label><input id="phone" name="phone" type="tel" defaultValue={profile?.phone || ""} autoComplete="tel" /></div><div className="field field-wide"><label>Correo electrónico</label><input value={profile?.email || ""} disabled /></div></div>{state?.error ? <p className="form-message error" role="alert">{state.error}</p> : null}{state?.success ? <p className="form-message success" role="status">{state.success}</p> : null}<SubmitButton pendingLabel="Guardando…">Guardar cambios</SubmitButton></form>;
}
