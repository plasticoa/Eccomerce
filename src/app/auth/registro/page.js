import { redirect } from "next/navigation";
import { AuthForm, AuthLink } from "@/components/ui/auth-form";
import { registerAction } from "@/features/auth/actions";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Crear cuenta" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/cuenta");
  return (
    <section className="auth-card">
      <p className="eyebrow">Cuenta personal</p><h1>Crea tu cuenta</h1>
      <p>Regístrate para preparar tu acceso a la tienda.</p>
      <AuthForm
        action={registerAction}
        fields={[
          { name: "fullName", label: "Nombre completo", autoComplete: "name", minLength: 2 },
          { name: "email", label: "Correo electrónico", type: "email", autoComplete: "email" },
          { name: "password", label: "Contraseña", type: "password", autoComplete: "new-password", minLength: 8 },
        ]}
        submitLabel="Crear cuenta"
        pendingLabel="Creando cuenta…"
        footer={<>¿Ya tienes cuenta? <AuthLink href="/auth/login">Inicia sesión</AuthLink></>}
      />
    </section>
  );
}
