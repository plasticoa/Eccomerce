"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/services/admin/authorization";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getAuthenticatedCart } from "@/repositories/carts";
import { validateCouponInput } from "@/lib/validation/settings";

const bool=(formData,name)=>formData.get(name)==="on"||formData.get(name)==="true";
const messageFor={COUPON_NOT_FOUND:"El cupón no existe.",COUPON_INACTIVE:"El cupón está inactivo.",COUPON_EXPIRED:"El cupón expiró.",COUPON_NOT_STARTED:"El cupón todavía no está vigente.",COUPON_MINIMUM:"El carrito no alcanza el monto mínimo.",COUPON_LIMIT_REACHED:"El cupón alcanzó su límite de usos."};
function friendly(error){const message=String(error?.message||"");if(message.includes("duplicate")||message.includes("23505"))return"Ya existe un cupón con ese código.";if(message.includes("INVALID_DATE_RANGE"))return"El rango de vigencia no es válido.";return"No se pudo guardar el cupón.";}

export async function saveCouponAction(_state,formData){
  try{const {supabase}=await requireAdmin();const id=String(formData.get("id")||"");const validation=validateCouponInput({code:formData.get("code"),description:formData.get("description"),discountType:formData.get("discountType"),discountValue:formData.get("discountValue"),minimumOrder:formData.get("minimumOrder"),usageLimit:formData.get("usageLimit"),active:bool(formData,"active"),startsAt:formData.get("startsAt"),endsAt:formData.get("endsAt")});if(validation.error)return{error:validation.error};const data=validation.data;
    const {error}=await supabase.rpc("admin_save_coupon",{p_id:id||null,p_code:data.code,p_description:data.description,p_discount_type:data.discountType,p_discount_value:data.discountValue,p_minimum_order:data.minimumOrder,p_usage_limit:data.usageLimit,p_active:data.active,p_starts_at:data.startsAt,p_ends_at:data.endsAt});if(error)throw error;
    revalidatePath("/admin/promociones");return{success:id?"Cupón actualizado.":"Cupón creado."};
  }catch(error){return{error:friendly(error)};}
}

export async function previewCouponAction(_state,formData){
  if(!(await getCurrentUser()))return{error:"Tu sesión expiró."};const code=String(formData.get("couponCode")||"").trim().toUpperCase();if(!code)return{error:"Ingresa un código de cupón."};
  try{const cart=await getAuthenticatedCart();if(!cart?.items?.length)return{error:"Tu carrito está vacío."};const supabase=await createClient();const {data,error}=await supabase.rpc("validate_coupon",{p_code:code,p_subtotal:cart.subtotal});if(error)return{error:"No pudimos validar el cupón."};if(!data?.valid)return{error:messageFor[data?.errorCode]||"El cupón no es válido.",code:""};return{success:`Cupón ${data.code} aplicado.`,code:data.code,discount:Number(data.discount),discountType:data.discountType,discountValue:Number(data.discountValue)};}catch{return{error:"No pudimos validar el cupón."};}
}

