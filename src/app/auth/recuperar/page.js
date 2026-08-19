import { AuthForm, AuthLink } from "@/components/ui/auth-form";
import { recoverAction } from "@/features/auth/actions";

export const metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <section className="auth-card">
      <p className="eyebrow">Recuperación segura</p><h1>Recupera tu acceso</h1>
      <p>Te enviaremos un enlace para elegir una nueva contraseña.</p>
      <AuthForm
        action={recoverAction}
        fields={[{ name: "email", label: "Correo electrónico", type: "email", autoComplete: "email" }]}
        submitLabel="Enviar instrucciones"
        pendingLabel="Enviando…"
        footer={<AuthLink href="/auth/login">Volver a iniciar sesión</AuthLink>}
      />
    </section>
  );
}
