"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/services/admin/authorization";
import { validateBannerInput, validateSiteSettingsInput } from "@/lib/validation/settings";
import { normalizeSettings } from "@/features/settings/settings-utils";
import { isAdminUuid } from "@/lib/validation/admin";

const IMAGE_TYPES=new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"]]);
const SITE_SETTINGS_SELECT="id,store_name,logo_url,favicon_url,primary_color,secondary_color,accent_color,currency,contact_data,social_links,home_content,footer_content,seo_title,seo_description,social_image_url,canonical_domain,created_at,updated_at";
const bool=(formData,name)=>formData.get(name)==="on"||formData.get(name)==="true";
const value=(formData,name)=>String(formData.get(name)||"");
function dateValue(raw){return raw?new Date(raw).toISOString():null;}
function settingsPaths(){updateTag("site-settings");updateTag("storefront-banners");revalidatePath("/","layout");revalidatePath("/admin/personalizacion");revalidatePath("/admin/configuracion");}
function friendly(error,fallback){const message=String(error?.message||"");if(message.includes("INVALID_DATE_RANGE"))return"El rango de fechas no es válido.";if(message.includes("BANNER_ACTIVE"))return"Desactiva el banner antes de eliminarlo.";if(message.includes("FORBIDDEN"))return"No tienes permisos para realizar esta operación.";return fallback;}

export async function saveSiteSettingsAction(_state,formData){
  try{
    const {supabase}=await requireAdmin();
    const current=await supabase.from("site_settings").select(SITE_SETTINGS_SELECT).order("created_at").limit(1).maybeSingle();
    if(current.error)throw current.error;
    const settings=normalizeSettings(current.data);const raw=Object.fromEntries(formData);const has=(key)=>formData.has(key);const pick=(key,fallback)=>has(key)?raw[key]:fallback;
    const merged={storeName:pick("storeName",settings.storeName),primaryColor:pick("primaryColor",settings.primaryColor),secondaryColor:pick("secondaryColor",settings.secondaryColor),accentColor:pick("accentColor",settings.accentColor),currency:pick("currency",settings.currency),phone:pick("phone",settings.contact.phone),whatsappNumber:pick("whatsappNumber",settings.contact.whatsapp),email:pick("email",settings.contact.email),address:pick("address",settings.contact.address),hours:pick("hours",settings.contact.hours),facebook:pick("facebook",settings.socialLinks.facebook),instagram:pick("instagram",settings.socialLinks.instagram),tiktok:pick("tiktok",settings.socialLinks.tiktok),whatsapp:pick("whatsapp",settings.socialLinks.whatsapp),other:pick("other",settings.socialLinks.other),eyebrow:pick("eyebrow",settings.home.eyebrow),homeTitle:pick("homeTitle",settings.home.title),homeSubtitle:pick("homeSubtitle",settings.home.subtitle),buttonText:pick("buttonText",settings.home.buttonText),buttonUrl:pick("buttonUrl",settings.home.buttonUrl),additionalMessage:pick("additionalMessage",settings.home.additionalMessage),footerDescription:pick("footerDescription",settings.footer.description),seoTitle:pick("seoTitle",settings.seo.title),seoDescription:pick("seoDescription",settings.seo.description),socialImage:pick("socialImage",settings.seo.socialImage),canonicalDomain:pick("canonicalDomain",settings.seo.canonicalDomain)};
    for(let index=1;index<=3;index++){merged[`footerLinkLabel${index}`]=pick(`footerLinkLabel${index}`,settings.footer.links?.[index-1]?.label||"");merged[`footerLinkUrl${index}`]=pick(`footerLinkUrl${index}`,settings.footer.links?.[index-1]?.url||"");}
    const validation=validateSiteSettingsInput(merged);
    if(validation.error)return{error:validation.error};
    const data=validation.data;
    const {error}=await supabase.rpc("admin_save_site_settings",{p_store_name:data.storeName,p_logo_url:current.data?.logo_url||"",p_favicon_url:current.data?.favicon_url||"",p_primary_color:data.primaryColor,p_secondary_color:data.secondaryColor,p_accent_color:data.accentColor,p_currency:data.currency,p_contact_data:data.contactData,p_social_links:data.socialLinks,p_home_content:data.homeContent,p_footer_content:data.footerContent,p_seo_title:data.seo.title,p_seo_description:data.seo.description,p_social_image_url:data.seo.socialImage,p_canonical_domain:data.seo.canonicalDomain});
    if(error)throw error;settingsPaths();return{success:"Configuración actualizada."};
  }catch(error){return{error:friendly(error,"No se pudo actualizar la configuración.")};}
}

export async function uploadBrandAssetAction(_state,formData){
  try{
    const {supabase}=await requireAdmin();const kind=value(formData,"kind");const file=formData.get("image");
    if(!["logo","favicon"].includes(kind)||!(file instanceof File)||!file.size)return{error:"Selecciona una imagen válida."};
    const extension=IMAGE_TYPES.get(file.type);const limit=kind==="logo"?5*1024*1024:1024*1024;
    if(!extension||file.size>limit)return{error:`Usa JPG, PNG o WebP de hasta ${kind==="logo"?"5 MB":"1 MB"}.`};
    const path=`identidad/${kind}/${randomUUID()}.${extension}`;
    const upload=await supabase.storage.from("branding").upload(path,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;
    const result=await supabase.rpc("admin_set_brand_asset",{p_kind:kind,p_path:path});
    if(result.error){await supabase.storage.from("branding").remove([path]);throw result.error;}
    const oldPath=result.data;if(oldPath&&!/^https?:\/\//i.test(oldPath))await supabase.storage.from("branding").remove([oldPath]);
    settingsPaths();return{success:kind==="logo"?"Logotipo actualizado.":"Favicon actualizado."};
  }catch(error){return{error:friendly(error,"No se pudo subir la imagen.")};}
}

export async function saveBannerAction(_state,formData){
  let uploadedPath="";
  try{
    const {supabase}=await requireAdmin();const id=value(formData,"id");const oldImage=value(formData,"existingImage");const file=formData.get("image");let imageUrl=oldImage;
    if(file instanceof File&&file.size){const extension=IMAGE_TYPES.get(file.type);if(!extension||file.size>10*1024*1024)return{error:"Usa JPG, PNG o WebP de hasta 10 MB."};uploadedPath=`promociones/${randomUUID()}.${extension}`;const upload=await supabase.storage.from("banners").upload(uploadedPath,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;imageUrl=uploadedPath;}
    const validation=validateBannerInput({title:formData.get("title"),subtitle:formData.get("subtitle"),imageUrl,buttonText:formData.get("buttonText"),linkUrl:formData.get("linkUrl"),sortOrder:formData.get("sortOrder"),active:bool(formData,"active"),startsAt:formData.get("startsAt"),endsAt:formData.get("endsAt")});
    if(validation.error){if(uploadedPath)await supabase.storage.from("banners").remove([uploadedPath]);return{error:validation.error};}
    const data=validation.data;const result=await supabase.rpc("admin_save_banner",{p_id:id||null,p_title:data.title,p_subtitle:data.subtitle,p_image_url:data.imageUrl,p_button_text:data.buttonText,p_link_url:data.linkUrl,p_sort_order:data.sortOrder,p_active:data.active,p_starts_at:data.startsAt,p_ends_at:data.endsAt});
    if(result.error)throw result.error;if(uploadedPath&&oldImage&&!/^https?:\/\//i.test(oldImage))await supabase.storage.from("banners").remove([oldImage]);
    settingsPaths();return{success:id?"Banner actualizado.":"Banner creado."};
  }catch(error){if(uploadedPath){try{const {supabase}=await requireAdmin();await supabase.storage.from("banners").remove([uploadedPath]);}catch{}}return{error:friendly(error,"No se pudo guardar el banner.")};}
}

export async function deleteBannerAction(formData){
  const {supabase}=await requireAdmin();const id=value(formData,"id");if(!id)return;
  const result=await supabase.rpc("admin_delete_banner",{p_id:id});if(result.error)return;
  if(result.data&&!/^https?:\/\//i.test(result.data))await supabase.storage.from("banners").remove([result.data]);settingsPaths();
}

export async function deleteBannersAction(_state,formData){
  try{const ids=[...new Set(formData.getAll("ids").map(String).filter(isAdminUuid))].slice(0,100);if(!ids.length)return{error:"Selecciona al menos un banner."};const {supabase}=await requireAdmin();const {data,error}=await supabase.rpc("admin_delete_banners",{p_ids:ids});if(error)throw error;const paths=Array.isArray(data?.imagePaths)?data.imagePaths.filter((path)=>path&&!/^https?:\/\//i.test(path)):[];const storage=paths.length?await supabase.storage.from("banners").remove(paths):{error:null};settingsPaths();const count=Number(data?.count||0);return{success:storage.error?`${count} banner(s) eliminado(s); algunas imágenes no pudieron limpiarse de Storage.`:`${count} banner(s) eliminado(s).`};}
  catch(error){return{error:friendly(error,"No se pudieron eliminar los banners seleccionados.")};}
}

export async function saveShippingMethodAction(_state,formData){
  try{const {supabase}=await requireAdmin();const code=value(formData,"code");const price=Number(formData.get("price"));const sortOrder=Number.parseInt(formData.get("sortOrder"),10);const name=value(formData,"name").trim();
    if(!["local_delivery","store_pickup"].includes(code)||!name||!Number.isFinite(price)||price<0||!Number.isInteger(sortOrder)||sortOrder<0)return{error:"Revisa los datos del método de entrega."};
    const {error}=await supabase.rpc("admin_save_shipping_method",{p_code:code,p_name:name,p_description:value(formData,"description"),p_price:price,p_instructions:value(formData,"instructions"),p_active:bool(formData,"active"),p_sort_order:sortOrder});if(error)throw error;
    updateTag("shipping-methods");revalidatePath("/checkout");revalidatePath("/admin/configuracion");return{success:"Método de entrega actualizado."};
  }catch(error){return{error:friendly(error,"No se pudo actualizar el método de entrega.")};}
}
