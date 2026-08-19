import { redirect } from "next/navigation";
import { AuthForm, AuthLink } from "@/components/ui/auth-form";
import { updatePasswordAction } from "@/features/auth/actions";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Nueva contraseña" };

export default async function UpdatePasswordPage() {
  if (!(await getCurrentUser())) redirect("/auth/recuperar");
  return (
    <section className="auth-card">
      <p className="eyebrow">Último paso</p><h1>Define tu contraseña</h1>
      <p>Utiliza al menos 8 caracteres.</p>
      <AuthForm
        action={updatePasswordAction}
        fields={[
          { name: "password", label: "Nueva contraseña", type: "password", autoComplete: "new-password", minLength: 8 },
          { name: "confirmation", label: "Confirmar contraseña", type: "password", autoComplete: "new-password", minLength: 8 },
        ]}
        submitLabel="Actualizar contraseña"
        pendingLabel="Actualizando…"
        footer={<AuthLink href="/cuenta">Ir a mi cuenta</AuthLink>}
      />
    </section>
  );
}
