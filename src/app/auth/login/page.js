import { redirect } from "next/navigation";
import { AuthForm, AuthLink } from "@/components/ui/auth-form";
import { loginAction } from "@/features/auth/actions";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = typeof params?.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/cuenta";
  if (await getCurrentUser()) {
    const profile = await getCurrentProfile();
    redirect(profile?.role === "admin" ? "/admin/dashboard" : next);
  }
  return (
    <section className="auth-card">
      <p className="eyebrow">Bienvenido de nuevo</p>
      <h1>Inicia sesión</h1>
      <p>Accede a tu cuenta de Importadora Valiente.</p>
      <AuthForm
        action={loginAction}
        hiddenFields={[{ name: "next", value: next }]}
        fields={[
          { name: "email", label: "Correo electrónico", type: "email", autoComplete: "email" },
          { name: "password", label: "Contraseña", type: "password", autoComplete: "current-password" },
        ]}
        submitLabel="Iniciar sesión"
        pendingLabel="Ingresando…"
        footer={<><AuthLink href="/auth/recuperar">¿Olvidaste tu contraseña?</AuthLink><br />¿Aún no tienes cuenta? <AuthLink href="/auth/registro">Regístrate</AuthLink></>}
      />
    </section>
  );
}
