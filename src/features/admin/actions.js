"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireInternal } from "@/services/admin/authorization";
import { ADMIN_ROLES, allowedOrderTransitions, isAdminUuid, validateCategoryInput, validateInventoryAdjustment, validateProductInput, validateVariantInput } from "@/lib/validation/admin";

function bool(formData, name) { return formData.get(name) === "on" || formData.get(name) === "true"; }
function refreshCatalog() { updateTag("catalog-products"); updateTag("catalog-categories"); }
function selectedIds(formData) {
  return [...new Set(formData.getAll("ids").map(String).filter(isAdminUuid))].slice(0, 100);
}
function resultCount(data, key) { return Array.isArray(data?.[key]) ? data[key].length : 0; }
function friendly(error, fallback) {
  const text = String(error?.message || "");
  if (text.includes("duplicate") || text.includes("23505")) return "El slug o SKU ya existe.";
  if (text.includes("INSUFFICIENT_STOCK")) return "El inventario disponible es insuficiente.";
  if (text.includes("INVALID_ORDER_TRANSITION")) return "La transición de estado no está permitida.";
  if (text.includes("AMOUNT_MISMATCH")) return "El monto recibido debe coincidir con el total del pedido.";
  if (text.includes("PAID_ORDER_REQUIRES_RETURN")) return "Un pedido pagado requiere una devolución explícita; no se puede cancelar aquí.";
  if (text.includes("LEGACY_ORDER_REQUIRES_REVIEW")) return "Este pedido histórico requiere revisar su pago e inventario antes de continuar.";
  if (text.includes("LAST_ADMIN")) return "No puedes quitar el acceso al último administrador.";
  if (text.includes("FORBIDDEN")) return "No tienes permisos para realizar esta operación.";
  if (text.includes("23503") || text.includes("foreign key")) return "No se puede eliminar porque existen pedidos, movimientos de inventario u otros registros relacionados.";
  return fallback;
}

export async function deleteProductsAction(_state, formData) {
  try {
    const ids = selectedIds(formData);
    if (!ids.length) return { error: "Selecciona al menos un producto." };
    const { supabase } = await requireAdmin();
    const { data, error } = await supabase.rpc("admin_delete_products", { p_ids: ids });
    if (error) throw error;
    const paths = Array.isArray(data?.imagePaths) ? data.imagePaths.filter(Boolean) : [];
    const storage = paths.length ? await supabase.storage.from("products").remove(paths) : { error: null };
    refreshCatalog(); revalidatePath("/admin/productos"); revalidatePath("/admin/inventario"); revalidatePath("/productos");
    const deleted = resultCount(data, "hardDeleted");
    const retired = resultCount(data, "retired");
    const failed = resultCount(data, "failed");
    const parts = [`${deleted} eliminado(s) definitivamente`, `${retired} retirado(s) del catálogo`];
    if (storage.error) parts.push("algunas imágenes no pudieron limpiarse de Storage");
    return {
      success: parts.join(" · ") + ".",
      warning: failed ? `${failed} producto(s) no se pudieron procesar por restricciones o porque ya no existen.` : "",
    };
  } catch (error) { return { error: friendly(error, "No se pudieron eliminar los productos seleccionados.") }; }
}

export async function deleteCategoriesAction(_state, formData) {
  try {
    const ids = selectedIds(formData);
    if (!ids.length) return { error: "Selecciona al menos una categoría." };
    const { supabase } = await requireAdmin();
    const { data, error } = await supabase.rpc("admin_delete_categories", { p_ids: ids });
    if (error) throw error;
    refreshCatalog(); revalidatePath("/admin/categorias"); revalidatePath("/categorias");
    return { success: `${Number(data || 0)} categoría(s) eliminada(s).` };
  } catch (error) { return { error: friendly(error, "No se pudieron eliminar las categorías seleccionadas.") }; }
}

export async function deleteUsersAction(_state, formData) {
  try {
    const ids = selectedIds(formData);
    if (!ids.length) return { error: "Selecciona al menos un usuario." };
    const { supabase } = await requireAdmin();
    const { data, error } = await supabase.rpc("admin_delete_users", { p_ids: ids });
    if (error) throw error;
    revalidatePath("/admin/usuarios"); revalidatePath("/admin/clientes");
    const deleted = resultCount(data, "hardDeleted");
    const failed = resultCount(data, "failed");
    return {
      success: `${deleted} usuario(s) eliminado(s) definitivamente.`,
      warning: failed ? `${failed} usuario(s) se conservaron: no se puede eliminar la cuenta actual, el último administrador ni usuarios con pedidos.` : "",
    };
  } catch (error) { return { error: friendly(error, "No se pudieron eliminar los usuarios seleccionados.") }; }
}

export async function saveCategoryAction(_state, formData) {
  try {
    const { supabase } = await requireAdmin();
    const id = String(formData.get("id") || "");
    const validation = validateCategoryInput({ name: formData.get("name"), slug: formData.get("slug"), description: formData.get("description"), seoTitle: formData.get("seoTitle"), seoDescription: formData.get("seoDescription"), active: bool(formData, "active") });
    if (validation.error) return { error: validation.error };
    const query = id ? supabase.from("categories").update(validation.data).eq("id", id) : supabase.from("categories").insert(validation.data);
    const { error } = await query;
    if (error) throw error;
    refreshCatalog(); revalidatePath("/admin/categorias"); revalidatePath("/categorias");
    return { success: id ? "Categoría actualizada." : "Categoría creada." };
  } catch (error) { return { error: friendly(error, "No se pudo guardar la categoría.") }; }
}

export async function createProductAction(_state, formData) {
  try {
    const { supabase } = await requireAdmin();
    const product = validateProductInput({ name: formData.get("name"), slug: formData.get("slug"), description: formData.get("description"), seoTitle: formData.get("seoTitle"), seoDescription: formData.get("seoDescription"), active: bool(formData, "active") });
    const variant = validateVariantInput({ sku: formData.get("sku"), variantName: formData.get("variantName"), price: formData.get("price"), compareAtPrice: formData.get("compareAtPrice"), lowStockThreshold: formData.get("lowStockThreshold"), active: bool(formData, "variantActive") });
    const stock = Number.parseInt(formData.get("stock"), 10);
    const categoryId = String(formData.get("categoryId") || "");
    if (product.error || variant.error) return { error: product.error || variant.error };
    if (!Number.isInteger(stock) || stock < 0) return { error: "El stock inicial no es válido." };
    const { data, error } = await supabase.rpc("admin_create_product", {
      p_name: product.data.name, p_slug: product.data.slug, p_description: product.data.description,
      p_seo_title: product.data.seoTitle, p_seo_description: product.data.seoDescription, p_active: product.data.active,
      p_category_id: isAdminUuid(categoryId) ? categoryId : null, p_sku: variant.data.sku, p_variant_name: variant.data.variantName,
      p_price: variant.data.price, p_compare_at_price: variant.data.compareAtPrice, p_stock: stock,
      p_low_stock_threshold: variant.data.lowStockThreshold, p_variant_active: variant.data.active,
    });
    if (error) throw error;
    refreshCatalog(); revalidatePath("/admin/productos"); revalidatePath("/productos");
    redirect(`/admin/productos/${data}?created=1`);
  } catch (error) { if (String(error?.message).includes("NEXT_REDIRECT")) throw error; return { error: friendly(error, "No se pudo crear el producto.") }; }
}

export async function updateProductAction(_state, formData) {
  try {
    const { supabase } = await requireAdmin();
    const id = String(formData.get("id") || "");
    if (!isAdminUuid(id)) return { error: "Producto no válido." };
    const validation = validateProductInput({ name: formData.get("name"), slug: formData.get("slug"), description: formData.get("description"), seoTitle: formData.get("seoTitle"), seoDescription: formData.get("seoDescription"), active: bool(formData, "active") });
    if (validation.error) return { error: validation.error };
    const categoryId = String(formData.get("categoryId") || "");
    const { error } = await supabase.rpc("admin_update_product", { p_product_id: id, p_name: validation.data.name, p_slug: validation.data.slug, p_description: validation.data.description || "", p_seo_title: validation.data.seoTitle, p_seo_description: validation.data.seoDescription, p_active: validation.data.active, p_category_id: isAdminUuid(categoryId) ? categoryId : null });
    if (error) throw error;
    refreshCatalog(); revalidatePath(`/admin/productos/${id}`); revalidatePath("/admin/productos"); revalidatePath("/productos");
    return { success: "Producto actualizado." };
  } catch (error) { return { error: friendly(error, "No se pudo actualizar el producto.") }; }
}

export async function saveVariantAction(_state, formData) {
  try {
    const { supabase } = await requireAdmin();
    const productId = String(formData.get("productId") || "");
    const variantId = String(formData.get("variantId") || "");
    if (!isAdminUuid(productId) || (variantId && !isAdminUuid(variantId))) return { error: "Variante no válida." };
    const validation = validateVariantInput({ sku: formData.get("sku"), variantName: formData.get("variantName"), price: formData.get("price"), compareAtPrice: formData.get("compareAtPrice"), lowStockThreshold: formData.get("lowStockThreshold"), active: bool(formData, "active") });
    if (validation.error) return { error: validation.error };
    const { error } = await supabase.rpc("admin_upsert_variant", { p_product_id: productId, p_variant_id: variantId || null, p_sku: validation.data.sku, p_variant_name: validation.data.variantName, p_price: validation.data.price, p_compare_at_price: validation.data.compareAtPrice, p_active: validation.data.active, p_low_stock_threshold: validation.data.lowStockThreshold });
    if (error) throw error;
    refreshCatalog(); revalidatePath(`/admin/productos/${productId}`); revalidatePath("/admin/inventario"); revalidatePath("/productos");
    return { success: variantId ? "Variante actualizada." : "Variante creada." };
  } catch (error) { return { error: friendly(error, "No se pudo guardar la variante.") }; }
}

export async function adjustInventoryAction(_state, formData) {
  try {
    const { supabase } = await requireAdmin();
    const variantId = String(formData.get("variantId") || "");
    if (!isAdminUuid(variantId)) return { error: "Variante no válida." };
    const validation = validateInventoryAdjustment({ quantity: formData.get("quantity"), movementType: formData.get("movementType"), reason: formData.get("reason") });
    if (validation.error) return { error: validation.error };
    const { data, error } = await supabase.rpc("admin_adjust_inventory", { p_variant_id: variantId, p_quantity: validation.data.quantity, p_movement_type: validation.data.movementType, p_reason: validation.data.reason });
    if (error) throw error;
    refreshCatalog(); revalidatePath("/admin/inventario"); revalidatePath("/productos");
    return { success: `Inventario actualizado. Nueva existencia: ${data}.` };
  } catch (error) { return { error: friendly(error, "No se pudo ajustar el inventario.") }; }
}

export async function changeOrderStatusAction(_state, formData) {
  try {
    const { supabase } = await requireInternal();
    const orderId = String(formData.get("orderId") || "");
    const currentStatus = String(formData.get("currentStatus") || "");
    const nextStatus = String(formData.get("nextStatus") || "");
    if (!isAdminUuid(orderId) || !allowedOrderTransitions(currentStatus).includes(nextStatus)) return { error: "La transición de estado no está permitida." };
    const { error } = await supabase.rpc("admin_change_order_status", { p_order_id: orderId, p_next_status: nextStatus });
    if (error) throw error;
    revalidatePath(`/admin/pedidos/${orderId}`); revalidatePath("/admin/pedidos");
    refreshCatalog(); revalidatePath("/", "layout");
    return { success: "Estado del pedido actualizado." };
  } catch (error) { return { error: friendly(error, "No se pudo actualizar el pedido.") }; }
}

export async function updateShipmentAction(_state, formData) {
  try {
    const { supabase } = await requireInternal();
    const orderId = String(formData.get("orderId") || "");
    const status = String(formData.get("status") || "");
    const estimated = String(formData.get("estimatedAt") || "");
    if (!isAdminUuid(orderId) || !["pending","ready","shipped","delivered","returned"].includes(status)) return { error: "Datos de entrega no válidos." };
    const { error } = await supabase.rpc("admin_update_shipment", { p_order_id: orderId, p_status: status, p_carrier: String(formData.get("carrier") || ""), p_tracking_number: String(formData.get("trackingNumber") || ""), p_estimated_at: estimated ? new Date(estimated).toISOString() : null, p_notes: String(formData.get("notes") || "") });
    if (error) throw error;
    revalidatePath(`/admin/pedidos/${orderId}`);
    return { success: "Información de entrega actualizada." };
  } catch (error) { return { error: friendly(error, "No se pudo actualizar la entrega.") }; }
}

export async function changeRoleAction(_state, formData) {
  try {
    const { supabase } = await requireAdmin();
    const profileId = String(formData.get("profileId") || "");
    const role = String(formData.get("role") || "");
    if (!isAdminUuid(profileId) || !ADMIN_ROLES.includes(role)) return { error: "Solicitud no válida." };
    const { error } = await supabase.rpc("admin_change_user_role", { p_profile_id: profileId, p_role: role });
    if (error) throw error;
    revalidatePath("/admin/usuarios"); revalidatePath("/admin/clientes");
    return { success: "Rol actualizado." };
  } catch (error) { return { error: friendly(error, "No se pudo cambiar el rol.") }; }
}

const IMAGE_TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
export async function uploadProductImageAction(_state, formData) {
  try {
    const { supabase } = await requireAdmin();
    const productId = String(formData.get("productId") || "");
    const file = formData.get("image");
    if (!isAdminUuid(productId) || !(file instanceof File) || file.size === 0) return { error: "Selecciona una imagen válida." };
    const extension = IMAGE_TYPES.get(file.type);
    if (!extension || file.size > 10 * 1024 * 1024) return { error: "Usa JPG, PNG o WebP de hasta 10 MB." };
    const path = `catalogo/${productId}/${randomUUID()}.${extension}`;
    const upload = await supabase.storage.from("products").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const { count } = await supabase.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", productId);
    const insert = await supabase.from("product_images").insert({ product_id: productId, storage_path: path, alt_text: String(formData.get("altText") || "").trim() || null, sort_order: count || 0, is_primary: (count || 0) === 0 });
    if (insert.error) { await supabase.storage.from("products").remove([path]); throw insert.error; }
    refreshCatalog(); revalidatePath(`/admin/productos/${productId}`); revalidatePath("/productos");
    return { success: "Imagen subida." };
  } catch (error) { return { error: friendly(error, "No se pudo subir la imagen.") }; }
}

export async function updateProductImageAction(formData) {
  const { supabase } = await requireAdmin();
  const productId = String(formData.get("productId") || "");
  const imageId = String(formData.get("imageId") || "");
  const intent = String(formData.get("intent") || "");
  if (!isAdminUuid(productId) || !isAdminUuid(imageId)) return;
  if (intent === "primary") {
    await supabase.from("product_images").update({ is_primary: false }).eq("product_id", productId).eq("is_primary", true);
    await supabase.from("product_images").update({ is_primary: true }).eq("id", imageId).eq("product_id", productId);
  } else if (intent === "delete") {
    const { data } = await supabase.from("product_images").select("storage_path,is_primary").eq("id", imageId).eq("product_id", productId).maybeSingle();
    if (data?.storage_path) await supabase.storage.from("products").remove([data.storage_path]);
    await supabase.from("product_images").delete().eq("id", imageId).eq("product_id", productId);
    if (data?.is_primary) {
      const { data: next } = await supabase.from("product_images").select("id").eq("product_id", productId).order("sort_order").limit(1).maybeSingle();
      if (next) await supabase.from("product_images").update({ is_primary: true }).eq("id", next.id);
    }
  } else if (["up", "down"].includes(intent)) {
    const { data } = await supabase.from("product_images").select("id,sort_order").eq("product_id", productId).order("sort_order");
    const index = (data || []).findIndex((row) => row.id === imageId);
    const swap = intent === "up" ? index - 1 : index + 1;
    if (index >= 0 && data?.[swap]) {
      await supabase.from("product_images").update({ sort_order: data[swap].sort_order }).eq("id", data[index].id);
      await supabase.from("product_images").update({ sort_order: data[index].sort_order }).eq("id", data[swap].id);
    }
  }
  refreshCatalog(); revalidatePath(`/admin/productos/${productId}`); revalidatePath("/productos");
}

export async function recordPaymentAction(_state, formData) {
  try {
    const { supabase } = await requireAdmin();
    const orderId = String(formData.get("orderId") || "");
    const amount = Number(formData.get("amount"));
    const reference = String(formData.get("reference") || "").trim();
    const notes = String(formData.get("notes") || "").trim();
    if (!isAdminUuid(orderId) || !Number.isFinite(amount) || amount < 0 || reference.length > 200 || notes.length > 1000) return { error: "Datos de pago no válidos." };
    const { data, error } = await supabase.rpc("admin_record_payment", { p_order_id: orderId, p_amount: amount, p_reference: reference || null, p_notes: notes || null });
    if (error) throw error;
    refreshCatalog();
    revalidatePath("/", "layout");
    return { success: data.alreadyPaid ? "El pago ya estaba registrado." : "Pago registrado y salida de inventario confirmada." };
  } catch (error) { return { error: friendly(error, "No se pudo registrar el pago.") }; }
}
