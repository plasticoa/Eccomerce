import "server-only";
import { requireAdmin } from "@/services/admin/authorization";
import { normalizeAdminPage } from "@/lib/validation/admin";

const PAGE_SIZE=20;
export async function getAdminCoupons({ query="",status="all",page=1 }={}) {
  const { supabase }=await requireAdmin(); const safePage=normalizeAdminPage(page); const from=(safePage-1)*PAGE_SIZE;
  let builder=supabase.from("coupons").select("id,code,description,discount_type,discount_value,minimum_order,usage_limit,active,starts_at,ends_at,created_at,updated_at,coupon_redemptions(count)",{count:"exact"});
  if(query) builder=builder.ilike("code",`%${String(query).replace(/[^A-Za-z0-9_-]/g,"").slice(0,40)}%`);
  if(status==="active") builder=builder.eq("active",true);
  if(status==="inactive") builder=builder.eq("active",false);
  if(status==="expired") builder=builder.lt("ends_at",new Date().toISOString());
  if(status==="current") builder=builder.eq("active",true).or(`starts_at.is.null,starts_at.lte.${new Date().toISOString()}`).or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`);
  const {data,error,count}=await builder.order("created_at",{ascending:false}).range(from,from+PAGE_SIZE-1);
  if(error) throw new Error("COUPONS_UNAVAILABLE");
  return {items:data||[],total:count||0,page:safePage,pageSize:PAGE_SIZE,totalPages:Math.max(1,Math.ceil((count||0)/PAGE_SIZE))};
}

