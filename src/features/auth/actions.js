"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/validation/purchase";
import { getSiteUrl } from "@/lib/site-url";

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export async function loginAction(_previousState, formData) {
  const email = cleanEmail(formData.get("email"));
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Ingresa tu correo y contraseña." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "No fue posible iniciar sesión. Verifica tus datos." };
  redirect(safeInternalPath(formData.get("next"), "/cuenta"));
}

export async function registerAction(_previousState, formData) {
  const fullName = String(formData.get("fullName") || "").trim();
  const email = cleanEmail(formData.get("email"));
  const password = String(formData.get("password") || "");

  if (fullName.length < 2) return { error: "Ingresa tu nombre completo." };
  if (!email) return { error: "Ingresa un correo válido." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/cuenta`,
    },
  });

  if (error) return { error: "No fue posible crear la cuenta. Revisa los datos e intenta de nuevo." };
  if (data.session) redirect("/cuenta");
  return { success: "Cuenta creada. Revisa tu correo para confirmarla." };
}

export async function recoverAction(_previousState, formData) {
  const email = cleanEmail(formData.get("email"));
  if (!email) return { error: "Ingresa el correo de tu cuenta." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=/auth/actualizar-contrasena`,
  });
  if (error) return { error: "No fue posible enviar el enlace. Intenta nuevamente." };
  return { success: "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña." };
}

export async function updatePasswordAction(_previousState, formData) {
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("confirmation") || "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== confirmation) return { error: "Las contraseñas no coinciden." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "El enlace no es válido o expiró. Solicita uno nuevo." };
  return { success: "Contraseña actualizada. Ya puedes continuar con tu cuenta." };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
