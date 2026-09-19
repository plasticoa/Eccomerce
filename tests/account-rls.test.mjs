import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const repair = readFileSync(new URL("202609190001_account_admin_isolation.sql", migrationDir), "utf8");

// Real PostgreSQL policies/triggers/RPCs. Only the Supabase platform schemas and
// JWT context are supplied by this harness; application SQL is loaded unchanged.
test("PostgreSQL: account isolation and administrative access", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create function auth.role() returns text language sql stable as
      $$select nullif(current_setting('request.jwt.claim.role', true), '')$$;
    grant usage on schema auth to authenticated, anon, service_role;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
  `);
  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith(".sql") && name < "202609").sort()) {
    // pgcrypto is not shipped in WASM. Application SQL only needs the built-in
    // gen_random_uuid(); no encryption function is replaced or mocked.
    const sql = readFileSync(new URL(file, migrationDir), "utf8")
      .replace("create extension if not exists pgcrypto with schema extensions;", "");
    await db.exec(sql);
  }
  const a = randomUUID(), b = randomUUID(), admin = randomUUID(), operator = randomUUID(), missing = randomUUID();
  for (const [id, name] of [[a, "cliente-a"], [b, "cliente-b"], [admin, "administrador"], [operator, "operador"]]) {
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)", [id, `${name}@example.test`, JSON.stringify({ full_name: name, role: "admin" })]);
  }
  await db.query("update public.profiles set role='admin' where id=$1", [admin]);
  await db.query("update public.profiles set role='operator' where id=$1", [operator]);
  await db.exec("alter table auth.users disable trigger on_auth_user_created");
  await db.query("insert into auth.users(id,email) values($1,'missing@example.test')", [missing]);
  await db.exec("alter table auth.users enable trigger on_auth_user_created");
  await db.exec(repair);

  async function asUser(id, sql, params = []) {
    await db.exec("set role authenticated");
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)", [id]);
      return await db.query(sql, params);
    } finally {
      await db.exec("reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role");
    }
  }
  async function addAddress(id, label) {
    const result = await asUser(id, "insert into public.addresses(profile_id,label,recipient_name,line_1,city,is_default) values($1,$2,$2,'Calle de prueba','Guatemala',true) returning id", [id, label]);
    return result.rows[0].id;
  }
  let addressA, addressB, orderA, orderB;
  await t.test("1: cliente-a creates and sees Direccion Cliente A", async () => {
    addressA = await addAddress(a, "Direccion Cliente A");
    assert.deepEqual((await asUser(a, "select label from public.addresses")).rows, [{ label: "Direccion Cliente A" }]);
  });
  await t.test("2: cliente-b creates and sees Direccion Cliente B", async () => {
    addressB = await addAddress(b, "Direccion Cliente B");
    assert.deepEqual((await asUser(b, "select label from public.addresses")).rows, [{ label: "Direccion Cliente B" }]);
  });
  await t.test("3: A cannot SELECT B even by ID", async () => {
    assert.equal((await asUser(a, "select * from public.addresses where id=$1", [addressB])).rows.length, 0);
  });
  await t.test("4: B cannot SELECT A even by ID", async () => {
    assert.equal((await asUser(b, "select * from public.addresses where id=$1", [addressA])).rows.length, 0);
  });
  await t.test("5: each checkout creates its own order and items; customers see only their own", async () => {
    await db.exec(readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8"));
    const variant = "c0000000-0000-0000-0000-000000000001";
    for (const [id, address] of [[a,addressA],[b,addressB]]) {
      await asUser(id, "select public.cart_add_item($1,1)", [variant]);
      const result = await asUser(id, "select public.create_order_from_cart($1,'store_pickup','pending_gateway',$2,null) as value", [address,randomUUID()]);
      const number = result.rows[0].value.orderNumber;
      if (id === a) orderA = number; else orderB = number;
      assert.deepEqual((await asUser(id, "select order_number from public.orders")).rows, [{ order_number: number }]);
      assert.equal((await asUser(id, "select * from public.order_items")).rows.length, 1);
    }
    assert.deepEqual((await asUser(a, "select order_number from public.orders")).rows, [{ order_number: orderA }]);
    assert.equal((await asUser(a, "select * from public.orders where order_number=$1", [orderB])).rows.length, 0);
  });
  await t.test("6: admin and operator can read Pedido A and Pedido B with their items", async () => {
    for (const id of [admin,operator]) {
      const rows = (await asUser(id, "select order_number from public.orders")).rows;
      assert.deepEqual(new Set(rows.map((r) => r.order_number)), new Set([orderA,orderB]));
      assert.equal((await asUser(id, "select * from public.order_items")).rows.length, 2);
    }
  });
  await t.test("7: admin sees both customer profiles with synced email", async () => {
    const rows = (await asUser(admin, "select id,email from public.profiles where role='customer'")).rows;
    assert.ok(rows.some((r) => r.id === a && r.email === "cliente-a@example.test"));
    assert.ok(rows.some((r) => r.id === b && r.email === "cliente-b@example.test"));
    assert.equal((await asUser(a, "select * from public.profiles")).rows.length, 1);
  });
  await t.test("8: admin sees all registered users including existing backfilled profile", async () => {
    assert.equal((await asUser(admin, "select * from public.profiles")).rows.length, 5);
    await db.exec(repair);
    assert.equal((await asUser(admin, "select * from public.profiles")).rows.length, 5);
    assert.equal((await asUser(admin, "select public.is_admin() as allowed")).rows[0].allowed, true);
  });
  await t.test("9: customers cannot call administrative RPCs or promote themselves", async () => {
    await assert.rejects(asUser(a, "select public.admin_customer_addresses($1)", [b]), /ADMIN_FORBIDDEN/);
    await assert.rejects(asUser(a, "select public.admin_change_user_role($1,'admin')", [a]), /ADMIN_FORBIDDEN/);
    await assert.rejects(asUser(a, "select public.admin_dashboard_metrics(30)"), /ADMIN_FORBIDDEN/);
    await assert.rejects(asUser(operator, "select public.admin_change_user_role($1,'admin')", [a]), /ADMIN_FORBIDDEN/);
    await assert.rejects(asUser(a, "update public.profiles set role='admin' where id=$1", [a]), /permission denied/);
    await assert.rejects(asUser(a, "insert into public.profiles(id,role) values($1,'admin')", [randomUUID()]), /permission denied/);
  });
  await t.test("10: forged address owner INSERT/UPDATE/DELETE cannot affect another account", async () => {
    await assert.rejects(asUser(a, "insert into public.addresses(profile_id,recipient_name,line_1,city) values($1,'Forged','X','Y')", [b]), /ADDRESS_FORBIDDEN|row-level security/);
    await assert.rejects(asUser(a, "update public.addresses set profile_id=$1 where id=$2", [b,addressA]), /ADDRESS_FORBIDDEN|ADDRESS_OWNER_IMMUTABLE|row-level security/);
    assert.equal((await asUser(a, "update public.addresses set line_1='Forged' where id=$1 returning id", [addressB])).rows.length, 0);
    assert.equal((await asUser(a, "delete from public.addresses where id=$1 returning id", [addressB])).rows.length, 0);
    assert.equal((await asUser(b, "select line_1 from public.addresses where id=$1", [addressB])).rows[0].line_1, "Calle de prueba");
  });
  await t.test("admin account has only its own addresses; operational RPC is separately authorized", async () => {
    assert.equal((await asUser(admin, "select * from public.addresses")).rows.length, 0);
    assert.equal((await asUser(admin, "select * from public.admin_customer_addresses($1)", [a])).rows.length, 1);
    await assert.rejects(asUser(admin, "insert into public.addresses(profile_id,recipient_name,line_1,city) values($1,'Forged','X','Y')", [b]), /ADDRESS_FORBIDDEN|row-level security/);
  });
  await t.test("owner CRUD/default changes work and leave other owners unchanged", async () => {
    const second = await addAddress(a, "Segunda A");
    assert.equal((await asUser(a, "select * from public.addresses where is_default")).rows[0].id, second);
    assert.equal((await asUser(b, "select * from public.addresses where is_default")).rows[0].id, addressB);
    assert.equal((await asUser(a, "update public.addresses set line_1='Updated' where id=$1 returning id", [second])).rows.length, 1);
    assert.equal((await asUser(a, "delete from public.addresses where id=$1 returning id", [second])).rows.length, 1);
  });
  await t.test("Auth sync never imports a metadata role; email is read-only for sessions", async () => {
    const id = randomUUID();
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'new@example.test','{\"role\":\"admin\"}')", [id]);
    assert.equal((await asUser(id, "select role from public.profiles")).rows[0].role, "customer");
    await db.query("update auth.users set email='changed@example.test' where id=$1", [id]);
    assert.equal((await asUser(id, "select email from public.profiles")).rows[0].email, "changed@example.test");
    await assert.rejects(asUser(id, "update public.profiles set email='forged@example.test' where id=$1", [id]), /permission denied/);
  });
  await t.test("direct order/item writes denied; anonymous sessions have no private access", async () => {
    await assert.rejects(asUser(a, "update public.orders set total=0"), /permission denied/);
    await assert.rejects(asUser(a, "delete from public.order_items"), /permission denied/);
    await db.exec("set role anon");
    try { await assert.rejects(db.query("select * from public.addresses"), /permission denied/); }
    finally { await db.exec("reset role"); }
    const { rows } = await db.query("select relrowsecurity from pg_class where oid in ('public.profiles'::regclass,'public.addresses'::regclass,'public.orders'::regclass,'public.order_items'::regclass)");
    assert.ok(rows.every((r) => r.relrowsecurity));
  });
  await t.test("legitimate role management remains audited and protects the last admin", async () => {
    await assert.rejects(asUser(admin, "select public.admin_change_user_role($1,'customer')", [admin]), /LAST_ADMIN/);
    await asUser(admin, "select public.admin_change_user_role($1,'operator')", [missing]);
    assert.equal((await asUser(admin, "select role from public.profiles where id=$1", [missing])).rows[0].role, "operator");
    assert.equal((await asUser(admin, "select * from public.audit_logs where action='profile.role_changed'")).rows.length, 1);
  });
});
