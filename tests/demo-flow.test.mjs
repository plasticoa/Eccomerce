import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { normalizeProduct, getProductImageUrl, getVariantAvailability } from "../src/features/catalog/catalog-utils.js";
import { calculateCheckoutTotals } from "../src/services/checkout/calculations.js";

const seed = readFileSync(new URL("../supabase/seed-demo.sql", import.meta.url), "utf8");

test("demo seed, public catalog, checkout, inventory and private order access", async (t) => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    grant usage on schema auth to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
  `);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file,directory), "utf8").replace("create extension if not exists pgcrypto with schema extensions;", ""));
  }
  async function asUser(id, sql, values = [], role = "authenticated") {
    assert.ok(["authenticated","anon","service_role"].includes(role));
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id || "",role]);
      return await db.query(sql,values);
    } finally { await db.exec("reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role"); }
  }
  const scalar = async (sql, values = []) => (await db.query(sql,values)).rows[0].n;
  const real = randomUUID(), home = randomUUID();
  await db.query("insert into public.products(id,name,slug,description,active) values($1,'Producto real','producto-real','Conservar',true)", [real]);
  await db.query("insert into public.categories(id,name,slug,description,active) values($1,'HOGAR','casa','Conservar categoría',false)", [home]);
  const realBefore = (await db.query("select * from public.products where id=$1", [real])).rows[0];
  const settingsBefore = (await db.query("select * from public.site_settings")).rows;
  await db.exec(seed);
  const demoProducts = "select p.* from public.products p join public.product_tags pt on pt.product_id=p.id join public.tags t on t.id=pt.tag_id where t.slug='demo'";
  let a,b,admin,addressA,addressB,variantA,variantB,orderA,orderB;

  await t.test("25 tagged products / 61 unique variants / 5 reused categories / no images", async () => {
    assert.equal((await db.query(demoProducts)).rows.length,25);
    assert.equal(await scalar("select count(*)::int n from public.product_variants where sku like 'DEMO-%'"),61);
    assert.equal(await scalar("select count(*)::int n from public.inventory"),61);
    assert.equal(await scalar("select count(*)::int n from public.inventory_movements where reference_type='demo_seed'"),61);
    assert.equal(await scalar("select count(*)::int n from public.categories"),5);
    assert.equal(await scalar("select count(*)::int n from public.categories where id=$1 and active",[home]),1);
    assert.equal(await scalar("select count(*)::int n from public.product_images"),0);
    assert.equal(await scalar("select count(*)::int n from storage.objects"),0);
    assert.equal(await scalar("select count(*)::int n from public.inventory where quantity<=low_stock_threshold"),3);
    assert.equal(await scalar("select count(*)::int n from public.product_variants where price<=0"),0);
    const counts=(await db.query("select count(*)::int n from public.product_variants group by product_id")).rows.map((r)=>r.n);
    assert.deepEqual(new Set(counts),new Set([1,2,3]));
    assert.deepEqual((await db.query("select * from public.products where id=$1",[real])).rows[0],realBefore);
    assert.deepEqual((await db.query("select * from public.site_settings")).rows,settingsBefore);
  });
  await t.test("second seed preserves all IDs, inventory and movements without duplicates",async()=>{
    const before=(await db.query("select * from public.inventory order by variant_id")).rows;
    const ids=(await db.query("select id from public.product_variants order by id")).rows;
    await db.exec(seed);
    assert.deepEqual((await db.query("select * from public.inventory order by variant_id")).rows,before);
    assert.deepEqual((await db.query("select id from public.product_variants order by id")).rows,ids);
    assert.equal((await db.query(demoProducts)).rows.length,25);
    assert.equal(await scalar("select count(*)::int n from public.tags"),1);
    assert.equal(await scalar("select count(*)::int n from public.coupons where lower(code)='pruebaestudiante'"),1);
    assert.equal(await scalar("select count(*)::int n from public.inventory_movements"),61);
  });
  await t.test("anonymous catalog: pagination, 5 category filters, name/SKU search and prices",async()=>{
    const first=await asUser(null,"select * from public.catalog_product_page('Demo',null,null,null,false,24,0)",[],"anon");
    const second=await asUser(null,"select * from public.catalog_product_page('Demo',null,null,null,false,24,24)",[],"anon");
    assert.equal(first.rows.length,24); assert.equal(second.rows.length,1);
    assert.equal(Number(first.rows[0].total_count),25);
    for(const category of (await db.query("select slug from public.categories")).rows){
      const result=await asUser(null,"select * from public.catalog_product_page('Demo',$1,null,null,true,24,0)",[category.slug],"anon");
      assert.equal(result.rows.length,5);
    }
    assert.equal((await asUser(null,"select * from public.catalog_product_page('DEMO-TEC-PWB',null,null,null,false,24,0)",[],"anon")).rows.length,1);
    const cheap=await asUser(null,"select * from public.catalog_product_page('Demo',null,30,50,false,24,0)",[],"anon");
    assert.equal(cheap.rows.length,2);
    assert.equal((await asUser(null,"select * from public.product_tags",[],"anon")).rows.length,25);
    assert.equal((await asUser(null,"select * from public.tags where slug='demo'",[],"anon")).rows.length,1);
  });
  await t.test("tag RLS hides unpublished products and denies customer writes",async()=>{
    const hidden=randomUUID();
    await db.query("insert into public.products(id,name,slug,active) values($1,'Privado','privado',false)",[hidden]);
    await db.query("insert into public.product_tags select $1,id from public.tags where slug='demo'",[hidden]);
    assert.equal((await asUser(null,"select * from public.product_tags where product_id=$1",[hidden],"anon")).rows.length,0);
    await assert.rejects(asUser(randomUUID(),"insert into public.tags(name,slug) values('Fake','fake')"),/row-level security/);
    await db.query("delete from public.product_tags where product_id=$1",[hidden]);
  });
  await t.test("variant normalization keeps SKU, distinct prices, stock and neutral image fallback",async()=>{
    const row=(await db.query(`select p.*, (select jsonb_agg(to_jsonb(v)||jsonb_build_object('inventory',to_jsonb(i))) from public.product_variants v join public.inventory i on i.variant_id=v.id where v.product_id=p.id) product_variants from public.products p where slug='power-bank-demo'`)).rows[0];
    const product=normalizeProduct({...row,product_tags:[{tags:{id:randomUUID(),name:"demo",slug:"demo"}}]});
    assert.equal(product.minPrice,159); assert.equal(product.maxPrice,269);
    assert.equal(product.tags[0].slug,"demo"); assert.equal(product.images.length,0);
    assert.equal(getProductImageUrl(null),null);
    assert.notEqual(product.variants[0].sku,product.variants[1].sku);
    assert.ok(product.variants.every((v)=>getVariantAvailability(v).key!=="out"));
  });
  await t.test("A/B Auth profiles, chosen cart variant and stock limits",async()=>{
    [a,b,admin]=[randomUUID(),randomUUID(),randomUUID()];
    for(const id of [a,b,admin]) await db.query("insert into auth.users(id,email) values($1,$2)",[id,`${id}@example.test`]);
    await db.query("update public.profiles set role='admin' where id=$1",[admin]);
    for(const id of [a,b]) {
      const result=await asUser(id,"insert into public.addresses(profile_id,recipient_name,line_1,city) values($1,'Demo','Calle demo','Guatemala') returning id",[id]);
      if(id===a) addressA=result.rows[0].id; else addressB=result.rows[0].id;
    }
    variantA=(await db.query("select v.*,i.quantity stock from public.product_variants v join public.inventory i on i.variant_id=v.id where sku='DEMO-TEC-PWB-10K'")).rows[0];
    variantB=(await db.query("select v.*,i.quantity stock from public.product_variants v join public.inventory i on i.variant_id=v.id where sku='DEMO-VIA-MOC-40L'")).rows[0];
    await assert.rejects(asUser(a,"select public.cart_add_item($1,$2)",[variantA.id,variantA.stock+1]),/INSUFFICIENT_STOCK/);
    await asUser(a,"select public.cart_add_item($1,1)",[variantA.id]);
    assert.equal((await asUser(a,"select variant_id from public.cart_items")).rows[0].variant_id,variantA.id);
    await asUser(b,"select public.cart_add_item($1,1)",[variantB.id]);
  });
  await t.test("bulk deletion is admin-only and handles each product according to its history",async()=>{
    const productIds=[randomUUID(),randomUUID()],historicalProduct=randomUUID(),historicalVariant=randomUUID(),missingProduct=randomUUID(),temporaryUser=randomUUID(),categoryId=randomUUID(),couponId=randomUUID(),bannerIds=[randomUUID(),randomUUID()];
    await db.query("insert into public.products(id,name,slug,active) values($1,'Temporal A',$2,false),($3,'Temporal B',$4,false)",[productIds[0],`temporal-${productIds[0]}`,productIds[1],`temporal-${productIds[1]}`]);
    await db.query("insert into public.products(id,name,slug,active) values($1,'Con historial',$2,true)",[historicalProduct,`historial-${historicalProduct}`]);
    await db.query("insert into public.product_variants(id,product_id,sku,variant_name,price,active) values($1,$2,$3,'Única',10,true)",[historicalVariant,historicalProduct,`HIST-${historicalVariant}`]);
    await db.query("insert into public.inventory(variant_id,quantity) values($1,1)",[historicalVariant]);
    await db.query("insert into public.inventory_movements(variant_id,quantity,movement_type,reason) values($1,1,'in','Prueba')",[historicalVariant]);
    await db.query("insert into public.categories(id,name,slug,active) values($1,'Temporal',$2,false)",[categoryId,`temporal-${categoryId}`]);
    await db.query("insert into public.coupons(id,code,discount_type,discount_value,active) values($1,$2,'fixed',1,false)",[couponId,`TMP${couponId.replaceAll("-","").slice(0,8)}`]);
    for(const id of bannerIds)await db.query("insert into public.banners(id,title,image_url,active) values($1,'Temporal',$2,false)",[id,`promociones/${id}.webp`]);
    await db.query("insert into auth.users(id,email) values($1,'temporal@example.test')",[temporaryUser]);
    const uuidArray=(ids)=>`array[${ids.map((id)=>`'${id}'::uuid`).join(",")}]`;
    await assert.rejects(asUser(a,`select public.admin_delete_products(${uuidArray(productIds)})`),/ADMIN_FORBIDDEN/);
    const products=(await asUser(admin,`select public.admin_delete_products(${uuidArray([...productIds,historicalProduct,missingProduct])}) value`)).rows[0].value;
    assert.equal(products.hardDeleted.length,2);
    assert.equal(products.retired.length,1);
    assert.equal(products.failed.length,1);
    assert.equal(await scalar("select count(*)::int n from public.products where id=any($1)",[productIds]),0);
    assert.equal(await scalar("select count(*)::int n from public.products where id=$1 and not active",[historicalProduct]),1);
    assert.equal(await scalar("select count(*)::int n from public.product_variants where id=$1 and not active",[historicalVariant]),1);
    assert.equal(await scalar("select count(*)::int n from public.inventory_movements where variant_id=$1",[historicalVariant]),1);
    assert.equal((await asUser(null,"select * from public.catalog_product_page('Con historial',null,null,null,false,24,0)",[],"anon")).rows.length,0);
    assert.equal((await asUser(admin,`select public.admin_delete_categories(${uuidArray([categoryId])}) value`)).rows[0].value,1);
    const coupons=(await asUser(admin,`select public.admin_delete_coupons(${uuidArray([couponId])}) value`)).rows[0].value;
    assert.equal(coupons.hardDeleted.length,1);assert.equal(coupons.retired.length,0);
    const banners=(await asUser(admin,`select public.admin_delete_banners(${uuidArray(bannerIds)}) value`)).rows[0].value;
    assert.equal(banners.count,2);assert.equal(banners.imagePaths.length,2);
    await assert.rejects(asUser(a,`select public.admin_delete_users(${uuidArray([temporaryUser])})`),/ADMIN_FORBIDDEN/);
    const ownUser=(await asUser(admin,`select public.admin_delete_users(${uuidArray([admin])}) value`)).rows[0].value;
    assert.equal(ownUser.hardDeleted.length,0);assert.equal(ownUser.failed[0].reason,"SELF_DELETE");
    const users=(await asUser(admin,`select public.admin_delete_users(${uuidArray([temporaryUser])}) value`)).rows[0].value;
    assert.equal(users.hardDeleted.length,1);assert.equal(await scalar("select count(*)::int n from auth.users where id=$1",[temporaryUser]),0);
    assert.equal(await scalar("select count(*)::int n from public.audit_logs where action in ('product.deleted','product.retired','category.deleted','coupon.deleted','banner.deleted')"),7);
  });
  await t.test("coupon preview 100 -> 10 discount; invalid code rejected",async()=>{
    const result=(await asUser(a,"select public.validate_coupon('PruebaEstudiante',100) value")).rows[0].value;
    assert.equal(result.valid,true); assert.equal(result.discount,10);
    assert.equal((await asUser(a,"select public.validate_coupon('PruebaEstudianteIncorrecto',100) value")).rows[0].value.valid,false);
    const totals=calculateCheckoutTotals([{price:100,quantity:1}],"store_pickup",undefined,result.discount);
    assert.equal(totals.total,90);
    await assert.rejects(asUser(a,"select public.create_order_from_cart($1,'store_pickup','cash_on_delivery',$2,'PruebaEstudianteIncorrecto')",[addressA,randomUUID()]),/COUPON_NOT_FOUND/);
    assert.equal((await asUser(a,"select * from public.orders")).rows.length,0);
  });
  await t.test("A discounted checkout / B normal checkout save owner, snapshots, amounts and statuses",async()=>{
    for(const [id,address,variant,coupon] of [[a,addressA,variantA,"PruebaEstudiante"],[b,addressB,variantB,null]]){
      const token=randomUUID();
      const response=(await asUser(id,"select public.create_order_from_cart($1,'local_delivery','cash_on_delivery',$2,$3) value",[address,token,coupon])).rows[0].value;
      const order=(await asUser(id,"select * from public.orders where order_number=$1",[response.orderNumber])).rows[0];
      assert.equal(order.profile_id,id); assert.equal(order.status,"pending"); assert.equal(order.payment_status,"pending");
      assert.ok(order.created_at); assert.match(order.order_number,/^IV-/);
      assert.equal(Number(order.subtotal),Number(variant.price));
      assert.equal(Number(order.discount),coupon?15.9:0);
      const shipping=Number((await db.query("select price from public.shipping_methods where code='local_delivery'")).rows[0].price);
      assert.equal(Number(order.shipping_total),shipping);
      assert.equal(Number(order.total),Number(variant.price)-Number(order.discount)+shipping);
      assert.equal(order.currency,settingsBefore[0].currency);
      const line=(await asUser(id,"select * from public.order_items where order_id=$1",[order.id])).rows[0];
      assert.equal(line.sku_snapshot,variant.sku); assert.equal(line.variant_name_snapshot,variant.variant_name);
      assert.ok(line.name_snapshot.endsWith("Demo")); assert.equal(line.quantity,1);
      assert.equal(line.unit_price,variant.price); assert.equal(line.line_total,variant.price);
      const retry=(await asUser(id,"select public.create_order_from_cart($1,'local_delivery','cash_on_delivery',$2,$3) value",[address,token,coupon])).rows[0].value;
      assert.equal(retry.orderNumber,order.order_number);
      if(id===a) orderA=order; else orderB=order;
    }
    assert.equal(await scalar("select quantity n from public.inventory where variant_id=$1",[variantA.id]),variantA.stock);
  });
  await t.test("A sees only A; B only B; direct order and order_items IDs cannot bypass RLS",async()=>{
    for(const [id,own,other] of [[a,orderA,orderB],[b,orderB,orderA]]){
      assert.deepEqual((await asUser(id,"select id from public.orders")).rows,[{id:own.id}]);
      assert.equal((await asUser(id,"select * from public.orders where id=$1 or order_number=$2",[other.id,other.order_number])).rows.length,0);
      assert.equal((await asUser(id,"select * from public.order_items where order_id=$1",[other.id])).rows.length,0);
      assert.equal((await asUser(id,"select * from public.order_items where order_id=$1",[own.id])).rows.length,1);
    }
  });
  await t.test("admin sees both orders and discounted detail including customer and redemption",async()=>{
    assert.equal((await asUser(admin,"select * from public.orders")).rows.length,2);
    const detail=(await asUser(admin,`select o.*,p.email,i.sku_snapshot,i.variant_name_snapshot,i.unit_price,i.quantity,c.code,r.amount_discounted
      from public.orders o join public.profiles p on p.id=o.profile_id join public.order_items i on i.order_id=o.id
      join public.coupon_redemptions r on r.order_id=o.id join public.coupons c on c.id=r.coupon_id where o.id=$1`,[orderA.id])).rows[0];
    assert.equal(detail.profile_id,a); assert.equal(detail.code,"PRUEBAESTUDIANTE"); assert.equal(Number(detail.amount_discounted),15.9);
    assert.equal(detail.sku_snapshot,variantA.sku); assert.equal(detail.total,orderA.total);
    assert.equal((await asUser(a,"select * from public.coupon_redemptions where order_id=$1",[orderA.id])).rows.length,1);
    assert.equal((await asUser(b,"select * from public.coupon_redemptions where order_id=$1",[orderA.id])).rows.length,0);
  });
  await t.test("used coupons and users with orders retain their historical records",async()=>{
    const uuidArray=(ids)=>`array[${ids.map((id)=>`'${id}'::uuid`).join(",")}]`;
    const couponId=(await db.query("select id from public.coupons where code='PRUEBAESTUDIANTE'")).rows[0].id;
    const coupons=(await asUser(admin,`select public.admin_delete_coupons(${uuidArray([couponId])}) value`)).rows[0].value;
    assert.equal(coupons.hardDeleted.length,0);assert.equal(coupons.retired.length,1);
    assert.equal(await scalar("select count(*)::int n from public.coupons where id=$1 and not active",[couponId]),1);
    assert.equal(await scalar("select count(*)::int n from public.coupon_redemptions where coupon_id=$1",[couponId]),1);
    const users=(await asUser(admin,`select public.admin_delete_users(${uuidArray([a])}) value`)).rows[0].value;
    assert.equal(users.hardDeleted.length,0);assert.equal(users.failed[0].reason,"ORDER_HISTORY");
    assert.equal(await scalar("select count(*)::int n from public.profiles where id=$1",[a]),1);
    const productId=(await db.query("select product_id from public.product_variants where id=$1",[variantA.id])).rows[0].product_id;
    const products=(await asUser(admin,`select public.admin_delete_products(${uuidArray([productId])}) value`)).rows[0].value;
    assert.equal(products.hardDeleted.length,0);assert.equal(products.retired.length,1);
    assert.equal(await scalar("select count(*)::int n from public.order_items where order_id=$1 and variant_id=$2",[orderA.id,variantA.id]),1);
    assert.equal(await scalar("select count(*)::int n from public.products where id=$1 and not active",[productId]),1);
    assert.equal(await scalar("select count(*)::int n from public.product_variants where id=$1 and not active",[variantA.id]),1);
    await assert.rejects(asUser(b,"select public.cart_add_item($1,1)",[variantA.id]),/VARIANT_UNAVAILABLE/);
  });
  await t.test("historical unit price survives a catalog price change",async()=>{
    await db.query("update public.product_variants set price=price+50 where id=$1",[variantA.id]);
    assert.equal((await asUser(a,"select unit_price from public.order_items where order_id=$1",[orderA.id])).rows[0].unit_price,variantA.price);
  });
  await t.test("manual payment commits once; cancellation releases once",async()=>{
    await assert.rejects(asUser(a,"select public.admin_record_payment($1,$2)",[orderA.id,orderA.total]),/ADMIN_FORBIDDEN/);
    await asUser(admin,"select public.admin_record_payment($1,$2)",[orderA.id,orderA.total]);
    const retry=(await asUser(admin,"select public.admin_record_payment($1,$2) value",[orderA.id,orderA.total])).rows[0].value;
    assert.equal(retry.alreadyPaid,true);
    assert.equal(await scalar("select quantity n from public.inventory where variant_id=$1",[variantA.id]),variantA.stock-1);
    assert.equal(await scalar("select reserved_quantity n from public.inventory where variant_id=$1",[variantA.id]),0);
    await assert.rejects(asUser(admin,"select public.admin_change_order_status($1,'cancelled')",[orderA.id]),/PAID_ORDER_REQUIRES_RETURN/);
    await asUser(admin,"select public.admin_change_order_status($1,'cancelled')",[orderB.id]);
    await asUser(admin,"select public.admin_change_order_status($1,'cancelled')",[orderB.id]);
    assert.equal(await scalar("select quantity n from public.inventory where variant_id=$1",[variantB.id]),variantB.stock);
    assert.equal(await scalar("select reserved_quantity n from public.inventory where variant_id=$1",[variantB.id]),0);
  });
  await t.test("rerunning seed after sale preserves consumed stock, history and manual edits",async()=>{
    const inventory=(await db.query("select * from public.inventory order by variant_id")).rows;
    const orders=(await db.query("select * from public.orders order by id")).rows;
    await db.exec(seed);
    assert.deepEqual((await db.query("select * from public.inventory order by variant_id")).rows,inventory);
    assert.deepEqual((await db.query("select * from public.orders order by id")).rows,orders);
    assert.equal(Number((await db.query("select price from public.product_variants where id=$1",[variantA.id])).rows[0].price),Number(variantA.price)+50);
    assert.equal((await db.query(demoProducts)).rows.length,25);
    assert.equal(await scalar("select count(*)::int n from public.inventory_movements where reference_type='demo_seed'"),61);
  });
  await t.test("non-demo slug collision aborts transaction without changing real data",async()=>{
    const id=(await db.query("select id from public.products where slug='cable-usb-c-demo'")).rows[0].id;
    await db.query("delete from public.product_tags where product_id=$1",[id]);
    await assert.rejects(db.exec(seed),/DEMO_PRODUCT_COLLISION/);
    await db.exec("rollback");
    assert.deepEqual((await db.query("select * from public.products where id=$1",[real])).rows[0],realBefore);
    assert.equal(await scalar("select count(*)::int n from public.orders"),2);
  });
});
