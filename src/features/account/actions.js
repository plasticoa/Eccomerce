"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { isUuid, validateAddressInput, validateProfileInput } from "@/lib/validation/purchase";

async function currentUserOrError() {
  const user = await getCurrentUser();
  return user || null;
}

function addressPayload(formData) {
  return validateAddressInput({
    label: formData.get("label"), recipientName: formData.get("recipientName"), phone: formData.get("phone"),
    line1: formData.get("line1"), line2: formData.get("line2"), city: formData.get("city"),
    stateRegion: formData.get("stateRegion"), postalCode: formData.get("postalCode"),
    deliveryNotes: formData.get("deliveryNotes"), isDefault: formData.get("isDefault"),
  });
}

export async function updateProfileAction(_state, formData) {
  const user = await currentUserOrError();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión nuevamente." };
  const validation = validateProfileInput({ fullName: formData.get("fullName"), phone: formData.get("phone") });
  if (validation.error) return { error: validation.error };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(validation.data).eq("id", user.id);
  if (error) return { error: "No pudimos guardar tu perfil." };
  revalidatePath("/cuenta");
  return { success: "Perfil actualizado." };
}

export async function createAddressAction(_state, formData) {
  const user = await currentUserOrError();
  if (!user) return { error: "Tu sesión expiró. Inicia sesión nuevamente." };
  const validation = addressPayload(formData);
  if (validation.error) return { error: validation.error };
  const supabase = await createClient();
  const { error } = await supabase.from("addresses").insert({ ...validation.data, profile_id: user.id });
  if (error) return { error: "No pudimos guardar la dirección." };
  revalidatePath("/cuenta/direcciones"); revalidatePath("/checkout");
  return { success: "Dirección guardada." };
}

export async function updateAddressAction(_state, formData) {
  const user = await currentUserOrError();
  const id = String(formData.get("id") || "");
  if (!user || !isUuid(id)) return { error: "Solicitud no válida." };
  const validation = addressPayload(formData);
  if (validation.error) return { error: validation.error };
  const supabase = await createClient();
  const { error } = await supabase.from("addresses").update(validation.data).eq("id", id).eq("profile_id", user.id);
  if (error) return { error: "No pudimos actualizar la dirección." };
  revalidatePath("/cuenta/direcciones"); revalidatePath("/checkout");
  return { success: "Dirección actualizada." };
}

export async function deleteAddressAction(formData) {
  const user = await currentUserOrError();
  const id = String(formData.get("id") || "");
  if (!user || !isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("addresses").delete().eq("id", id).eq("profile_id", user.id);
  revalidatePath("/cuenta/direcciones"); revalidatePath("/checkout");
}

export async function setDefaultAddressAction(formData) {
  const user = await currentUserOrError();
  const id = String(formData.get("id") || "");
  if (!user || !isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("addresses").update({ is_default: true }).eq("id", id).eq("profile_id", user.id);
  revalidatePath("/cuenta/direcciones"); revalidatePath("/checkout");
}
