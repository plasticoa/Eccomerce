import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateCheckoutTotals } from "../src/services/checkout/calculations.js";
import { calculateCouponDiscount,isBannerVisible,validateBannerInput,validateCouponInput,validateSiteSettingsInput } from "../src/lib/validation/settings.js";

const migration=readFileSync(new URL("../supabase/migrations/202608100006_customization_promotions.sql",import.meta.url),"utf8");
const initial=readFileSync(new URL("../supabase/migrations/202608100001_initial_schema.sql",import.meta.url),"utf8");

test("configuración acepta colores, contacto y URLs seguras",()=>{
  const valid=validateSiteSettingsInput({storeName:"Importadora Valiente",primaryColor:"#174c35",secondaryColor:"#246c4b",accentColor:"#d8a93f",currency:"GTQ",email:"ventas@example.com",buttonUrl:"/productos",facebook:"https://facebook.com/valiente"});
  assert.equal(valid.data.storeName,"Importadora Valiente");
  assert.match(validateSiteSettingsInput({storeName:"Tienda",primaryColor:"red",secondaryColor:"#246c4b",accentColor:"#d8a93f",currency:"GTQ"}).error,/colores/i);
  assert.match(validateSiteSettingsInput({storeName:"Tienda",primaryColor:"#174c35",secondaryColor:"#246c4b",accentColor:"#d8a93f",currency:"GTQ",buttonUrl:"javascript:alert(1)"}).error,/destino/i);
});

test("cupón valida código, porcentaje, mínimo, límite y fechas",()=>{
  assert.ok(validateCouponInput({code:"bienvenido10",discountType:"percentage",discountValue:"10",minimumOrder:"100",usageLimit:"50",active:true}).data);
  assert.match(validateCouponInput({code:"x",discountType:"percentage",discountValue:"10",minimumOrder:"0"}).error,/código/i);
  assert.match(validateCouponInput({code:"PROMO",discountType:"percentage",discountValue:"101",minimumOrder:"0"}).error,/100/);
  assert.match(validateCouponInput({code:"PROMO",discountType:"fixed",discountValue:"20",minimumOrder:"0",usageLimit:"0"}).error,/límite/i);
  assert.match(validateCouponInput({code:"PROMO",discountType:"fixed",discountValue:"20",minimumOrder:"0",startsAt:"2026-09-02",endsAt:"2026-09-01"}).error,/vigencia/i);
});

test("descuento porcentual, fijo y limitado por subtotal",()=>{
  assert.equal(calculateCouponDiscount(500,"percentage",10),50);
  assert.equal(calculateCouponDiscount(500,"fixed",50),50);
  assert.equal(calculateCouponDiscount(40,"fixed",100),40);
  const totals=calculateCheckoutTotals([{price:100,quantity:2}],"custom",[{id:"custom",price:25}],50);
  assert.deepEqual(totals,{subtotal:200,discount:50,shipping:25,total:175});
});

test("visibilidad de banner respeta estado y vigencia",()=>{
  const now=new Date("2026-08-19T12:00:00Z");
  assert.equal(isBannerVisible({active:true,starts_at:null,ends_at:null},now),true);
  assert.equal(isBannerVisible({active:false},now),false);
  assert.equal(isBannerVisible({active:true,starts_at:"2026-08-20T00:00:00Z"},now),false);
  assert.equal(isBannerVisible({active:true,ends_at:"2026-08-18T00:00:00Z"},now),false);
  assert.ok(validateBannerInput({title:"Oferta",imageUrl:"promociones/a.webp",sortOrder:"1",linkUrl:"/productos",active:true}).data);
});

test("SQL valida todos los rechazos críticos de cupón",()=>{
  for(const code of ["COUPON_NOT_FOUND","COUPON_INACTIVE","COUPON_EXPIRED","COUPON_NOT_STARTED","COUPON_MINIMUM","COUPON_LIMIT_REACHED"])assert.match(migration,new RegExp(code));
  assert.match(migration,/for update[\s\S]*v_coupon\.usage_limit/i);
  assert.match(migration,/least\(v_subtotal[\s\S]*discount_type='percentage'/i);
  assert.match(migration,/greatest\(0,v_subtotal-v_discount\)\+v_shipping/i);
});

test("orden registra redención única y conserva cálculo servidor",()=>{
  assert.match(initial,/order_id uuid not null unique references public\.orders/i);
  assert.match(migration,/insert into public\.coupon_redemptions\(coupon_id,profile_id,order_id,amount_discounted\)/i);
  assert.match(migration,/variant\.price\*item\.quantity/i);
  assert.match(migration,/select \* into v_shipping_method[\s\S]*and active for share/i);
  assert.match(migration,/p_coupon_code text default null/i);
});

test("RLS y privilegios impiden mutaciones públicas o de clientes",()=>{
  assert.match(migration,/create policy shipping_methods_public_read[\s\S]*using\(active\)/i);
  assert.match(migration,/shipping_methods_admin_all[\s\S]*public\.is_admin/i);
  assert.match(migration,/revoke insert,update,delete on public\.site_settings,public\.banners,public\.coupons/i);
  assert.doesNotMatch(initial,/grant select[\s\S]*public\.coupons[\s\S]*to anon/i);
  assert.match(migration,/admin_save_coupon[\s\S]*if not public\.is_admin\(\)/i);
});

test("cambios relevantes generan auditoría",()=>{
  for(const action of ["site_settings.updated","banner.created","banner.updated","banner.deleted","coupon.created","coupon.updated","shipping.updated"])assert.match(migration,new RegExp(action.replace(".","\\.")));
});

