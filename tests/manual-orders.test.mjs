import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { normalizeProduct } from "../src/features/catalog/catalog-utils.js";

test("manual orders: reservations, payments, cancellation, permissions and competing checkouts", async (t) => {
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

  await db.exec(readFileSync(new URL('../supabase/seed-demo.sql',import.meta.url),'utf8'));
  const [a,b,admin,operator]=Array.from({length:4},()=>randomUUID());
  for(const id of [a,b,admin,operator]) await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@test.local']);
  await db.query("update public.profiles set role='admin' where id=$1",[admin]);
  await db.query("update public.profiles set role='operator' where id=$1",[operator]);
  const addresses={};
  for(const id of [a,b]) addresses[id]=(await asUser(id,"insert into public.addresses(profile_id,recipient_name,line_1,city) values($1,'Cliente','Calle 1','Guatemala') returning id",[id])).rows[0].id;
  const variant=(await db.query("select id from public.product_variants where sku='DEMO-TEC-PWB-10K'")).rows[0].id;
  await db.query('update public.inventory set quantity=10 where variant_id=$1',[variant]);
  const stock=async()=> (await db.query('select quantity physical,reserved_quantity reserved,quantity-reserved_quantity available from public.inventory where variant_id=$1',[variant])).rows[0];
  const checkout=async(id,method='cash_on_delivery',coupon=null,token=randomUUID())=>(await asUser(id,"select public.create_order_from_cart($1,'store_pickup',$2,$3,$4) value",[addresses[id],method,token,coupon])).rows[0].value;
  let orderA,orderB;
  await t.test('1: reserve 3 without physical movement; public stock is 7',async()=>{
    await asUser(a,'select public.cart_add_item($1,3)',[variant]);
    const token=randomUUID(); orderA=await checkout(a,'cash_on_delivery','PruebaEstudiante',token);
    assert.equal((await checkout(a,'cash_on_delivery','PruebaEstudiante',token)).orderId,undefined);
    assert.deepEqual(await stock(),{physical:10,reserved:3,available:7});
    const raw=(await asUser(null,'select * from public.inventory where variant_id=$1',[variant],'anon')).rows[0];
    const normalized=normalizeProduct({product_variants:[{id:variant,active:true,price:159,inventory:raw}]});
    assert.equal(normalized.variants[0].quantity,7);
  });
  await t.test('2: second customer cannot reserve 8; stale cart rolls back',async()=>{
    await assert.rejects(asUser(b,'select public.cart_add_item($1,8)',[variant]),/INSUFFICIENT_STOCK/);
    await asUser(b,'select public.cart_add_item($1,7)',[variant]);
    await db.query('update public.cart_items set quantity=8 where cart_id in (select id from public.carts where profile_id=$1)',[b]);
    await assert.rejects(checkout(b),/INSUFFICIENT_STOCK/);
    assert.deepEqual(await stock(),{physical:10,reserved:3,available:7});
  });
  await t.test('3: reserve 5 for second customer; availability 2',async()=>{
    await asUser(b,'select public.cart_set_quantity($1,5)',[variant]);
    orderB=await checkout(b,'in_person');
    assert.deepEqual(await stock(),{physical:10,reserved:8,available:2});
  });
  await t.test('4/5: admin sees both; each customer sees only own order/items/payment',async()=>{
    assert.equal((await asUser(admin,'select * from public.orders')).rows.length,2);
    for(const [id,own,other] of [[a,orderA,orderB],[b,orderB,orderA]]) {
      assert.deepEqual((await asUser(id,'select id from public.orders')).rows,[{id:own.orderId}]);
      for(const table of ['order_items','payments']) assert.equal((await asUser(id,'select * from public.'+table+' where order_id=$1',[other.orderId])).rows.length,0);
      await assert.rejects(asUser(id,'select public.admin_record_payment($1,1)',[own.orderId]),/ADMIN_FORBIDDEN/);
      await assert.rejects(asUser(id,"select public.admin_change_order_status($1,'cancelled')",[own.orderId]),/ADMIN_FORBIDDEN/);
    }
    await assert.rejects(asUser(operator,'select public.admin_record_payment($1,1)',[orderA.orderId]),/ADMIN_FORBIDDEN/);
  });
  await t.test('11/12: 10% coupon snapshot, contra entrega pending, exact manual amount',async()=>{
    const order=(await asUser(a,'select * from public.orders')).rows[0];
    assert.equal(Number(order.subtotal),477); assert.equal(Number(order.discount),47.7); assert.equal(Number(order.total),429.3);
    assert.equal(order.payment_status,'pending'); assert.equal(order.payment_method,'cash_on_delivery');
    await assert.rejects(asUser(admin,'select public.admin_record_payment($1,400)',[orderA.orderId]),/AMOUNT_MISMATCH/);
    await asUser(admin,"select public.admin_change_order_status($1,'confirmed')",[orderA.orderId]);
    await asUser(admin,"select public.admin_change_order_status($1,'processing')",[orderA.orderId]);
    assert.equal((await asUser(a,'select payment_status from public.orders')).rows[0].payment_status,'pending');
    await asUser(admin,"select public.admin_record_payment($1,429.3,'Recibo 123','Pago recibido')",[orderA.orderId]);
    const payment=(await asUser(a,'select * from public.payments')).rows[0];
    assert.equal(payment.status,'approved'); assert.equal(payment.recorded_by,admin); assert.ok(payment.processed_at); assert.equal(payment.reference,'Recibo 123');
  });
  await t.test('6/7: physical 7 reserved 5; repeat payment never deducts twice',async()=>{
    assert.deepEqual(await stock(),{physical:7,reserved:5,available:2});
    await asUser(admin,'select public.admin_record_payment($1,429.3)',[orderA.orderId]);
    assert.deepEqual(await stock(),{physical:7,reserved:5,available:2});
    await assert.rejects(asUser(admin,"select public.admin_change_order_status($1,'cancelled')",[orderA.orderId]),/PAID_ORDER_REQUIRES_RETURN/);
    await assert.rejects(asUser(admin,"select public.admin_adjust_inventory($1,3,'out','Ajuste')",[variant]),/INSUFFICIENT_STOCK/);
  });
  await t.test('8/9: cancel releases 5 once, physical stays 7',async()=>{
    await asUser(admin,"select public.admin_change_order_status($1,'cancelled')",[orderB.orderId]);
    await asUser(admin,"select public.admin_change_order_status($1,'cancelled')",[orderB.orderId]);
    assert.deepEqual(await stock(),{physical:7,reserved:0,available:7});
    await assert.rejects(asUser(admin,'select public.admin_record_payment($1,795)',[orderB.orderId]),/ORDER_CANCELLED/);
  });
  await t.test('13: presencial, ready for pickup, delivered and manual payment',async()=>{
    await asUser(b,'select public.cart_add_item($1,1)',[variant]);
    const order=await checkout(b,'in_person');
    for(const status of ['confirmed','processing','ready','delivered']) await asUser(admin,'select public.admin_change_order_status($1,$2)',[order.orderId,status]);
    await asUser(admin,'select public.admin_record_payment($1,159)',[order.orderId]);
    assert.deepEqual(await stock(),{physical:6,reserved:0,available:6});
    assert.equal((await asUser(b,'select payment_status from public.orders where id=$1',[order.orderId])).rows[0].payment_status,'approved');
  });
  await t.test('10: competing checkout submissions for last unit (PGlite serializes connections)',async()=>{
    await db.query('update public.inventory set quantity=1 where variant_id=$1',[variant]);
    for(const id of [a,b]) await asUser(id,'select public.cart_add_item($1,1)',[variant]);
    // Single-session engine: set identity inside each SQL statement, never shared async session mutation.
    const submit=id=>db.query("with identity as materialized (select set_config('request.jwt.claim.sub',$1,false)) select public.create_order_from_cart($2,'store_pickup','in_person',$3,null) from identity",[id,addresses[id],randomUUID()]);
    const results=await Promise.allSettled([submit(a),submit(b)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.match(results.find(r=>r.status==='rejected').reason.message,/INSUFFICIENT_STOCK/);
    assert.deepEqual(await stock(),{physical:1,reserved:1,available:0});
    await db.exec('reset request.jwt.claim.sub');
  });
  await t.test('constraints, retired gateway, audit and admin inventory',async()=>{
    await assert.rejects(db.query('update public.inventory set reserved_quantity=-1 where variant_id=$1',[variant]),/check constraint/);
    await assert.rejects(db.query('update public.inventory set quantity=0 where variant_id=$1',[variant]),/check constraint/);
    await assert.rejects(asUser(a,"select public.create_payment_attempt('x','test',$1)",[randomUUID()]),/does not exist/);
    const rows=(await asUser(admin,'select * from public.admin_inventory_page(null,false,null,100,0)')).rows;
    const row=rows.find(r=>r.variant_id===variant); assert.equal(row.reserved_quantity,1); assert.equal(row.available_quantity,0);
    const movements=(await db.query("select movement_type,count(*)::int n from public.inventory_movements where reference_id=$1 group by movement_type",[orderA.orderId])).rows;
    assert.deepEqual(new Set(movements.map(m=>m.movement_type)),new Set(['reservation','out']));
    assert.ok(movements.every(m=>m.n===1));
    assert.ok((await db.query("select * from public.audit_logs where user_id=$1 and action='payment.recorded_and_inventory_committed'",[admin])).rows.length>=2);
  });
});
