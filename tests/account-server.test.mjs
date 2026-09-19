import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import * as purchase from "../src/lib/validation/purchase.js";
import * as adminValidation from "../src/lib/validation/admin.js";
import { sanitizeSearchTerm } from "../src/features/catalog/catalog-utils.js";

// Run the actual server module functions with explicit framework/IO dependencies.
// SQL/RLS itself is tested separately against PostgreSQL, not this query double.
function load(relative, dependencies) {
  const source = readFileSync(new URL(`../src/${relative}`, import.meta.url), "utf8");
  const names = [...source.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map((match) => match[1]);
  const body = source.replace(/^import[\s\S]*?;\r?\n/gm, "").replace(/\bexport /g, "");
  return new Function(...Object.keys(dependencies), `${body}\nreturn {${names.join(",")}};`)(...Object.values(dependencies));
}

function fixture() {
  const a = randomUUID(), b = randomUUID(), admin = randomUUID();
  const state = { userId: a, error: null, helper: true, calls: [], logs: [], tables: {
    profiles: [{ id: a, role: "customer" }, { id: b, role: "customer" }, { id: admin, role: "admin" }],
    addresses: [{ id: randomUUID(), profile_id: a }, { id: randomUUID(), profile_id: b }],
    orders: [{ id: randomUUID(), profile_id: a, order_number: "Pedido-A" }, { id: randomUUID(), profile_id: b, order_number: "Pedido-B" }],
  } };
  const client = {
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId, email: "session@example.test" } : null }, error: null }) },
    rpc: async (name) => { state.calls.push({ rpc: name }); return { data: state.helper, error: state.error }; },
    from(table) {
      const call = { table, filters: [], operation: "read" }; state.calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return this; },
        eq(column, value) { call.filters.push([column,value]); return this; },
        order() { return this; },
        range(from, to) { call.range = [from,to]; return this; },
        or(expression) { call.or = expression; return this; },
        ilike() { return this; },
        insert(value) { call.operation = "insert"; call.value = value; return this; },
        update(value) { call.operation = "update"; call.value = value; return this; },
        delete() { call.operation = "delete"; return this; },
        maybeSingle() { call.single = true; return this; },
        then(resolve) {
          const rows = (state.tables[table] || []).filter((row) => call.filters.every(([key,value]) => row[key] === value));
          const data = call.single ? rows[0] || null : rows;
          return Promise.resolve({ data, error: state.error, count: rows.length }).then(resolve);
        },
      };
      return query;
    },
  };
  const dependencies = {
    createClient: async () => client,
    logServerError: (...args) => state.logs.push(args),
    revalidatePath: () => {}, updateTag: () => {}, randomUUID,
    redirect: () => { throw new Error("REDIRECT"); },
    ...purchase, ...adminValidation, sanitizeSearchTerm,
  };
  const auth = load("lib/auth/index.js", dependencies);
  Object.assign(dependencies, auth);
  Object.assign(dependencies, load("services/admin/authorization.js", dependencies));
  return { a,b,admin,state,dependencies };
}

test("session changes A -> B -> admin do not reuse personal addresses/orders", async () => {
  const f = fixture();
  const addresses = load("repositories/addresses/index.js", f.dependencies);
  const orders = load("repositories/orders/index.js", f.dependencies);
  for (const id of [f.a,f.b,f.admin,f.a]) {
    f.state.userId = id;
    assert.ok((await addresses.getAddresses()).every((row) => row.profile_id === id));
    assert.ok((await orders.getOrders()).every((row) => row.profile_id === id));
    assert.equal(await orders.getOrderByNumber(id === f.a ? "Pedido-B" : "Pedido-A"), null);
  }
  f.state.userId = null;
  await assert.rejects(addresses.getAddresses(), /AUTH_REQUIRED/);
});

test("admin lists all orders/customers/users; direct customer calls are denied", async () => {
  const f = fixture();
  const repo = load("repositories/admin/index.js", f.dependencies);
  for (const method of ["getAdminOrders","getCustomers","getInternalUsers"]) {
    await assert.rejects(repo[method](), /ADMIN_FORBIDDEN/);
  }
  assert.ok(!f.state.calls.some((call) => call.table === "orders"));
  f.state.userId = f.admin;
  assert.equal((await repo.getAdminOrders()).items.length, 2);
  assert.equal((await repo.getCustomers()).items.length, 2);
  assert.equal((await repo.getInternalUsers()).items.length, 3);
  await repo.getInternalUsers({ query: "persona+compras@example.test", page: 52 });
  const call = f.state.calls.at(-1);
  assert.deepEqual(call.range, [1020,1039]);
  assert.match(call.or, /persona\+compras@example\.test/);
  assert.doesNotMatch(call.columns, /metadata|token|password/);
});

test("missing profile and role/RLS mismatch are errors, never empty success", async () => {
  const f = fixture();
  f.state.userId = f.admin;
  const repo = load("repositories/admin/index.js", f.dependencies);
  f.state.helper = false;
  await assert.rejects(repo.getAdminOrders(), /ADMIN_AUTHORIZATION_UNAVAILABLE/);
  f.state.tables.profiles = [];
  await assert.rejects(repo.getInternalUsers(), /PROFILE_UNAVAILABLE/);
  assert.equal(f.state.logs.length, 2);
});

test("database failures are logged and distinguishable from no rows", async () => {
  const f = fixture();
  const repo = load("repositories/addresses/index.js", f.dependencies);
  f.state.error = { code: "42501", message: "permission denied" };
  await assert.rejects(repo.getAddresses(), /ADDRESSES_UNAVAILABLE/);
  assert.equal(f.state.logs.length, 1);
  f.state.error = null;
  f.state.tables.addresses = [];
  assert.deepEqual(await repo.getAddresses(), []);
});

test("address actions ignore forged profile_id and reject zero-row mutations", async () => {
  const f = fixture();
  const actions = load("features/account/actions.js", f.dependencies);
  const form = new FormData();
  Object.entries({ profile_id:f.b, user_id:f.b, recipientName:"Cliente A", line1:"Direccion Cliente A", city:"Guatemala", id:f.state.tables.addresses[1].id }).forEach(([key,value]) => form.set(key,value));
  assert.ok((await actions.createAddressAction(null,form)).success);
  assert.equal(f.state.calls.at(-1).value.profile_id, f.a);
  assert.ok((await actions.updateAddressAction(null,form)).error);
  assert.deepEqual(f.state.calls.at(-1).filters.at(-1), ["profile_id",f.a]);
  await assert.rejects(actions.deleteAddressAction(form), /ADDRESS_DELETE_FAILED/);
  await assert.rejects(actions.setDefaultAddressAction(form), /ADDRESS_UPDATE_FAILED/);
  form.set("id",f.state.tables.addresses[0].id);
  assert.ok((await actions.updateAddressAction(null,form)).success);
});

test("direct administrative Server Action calls reject ordinary customers before RPC", async () => {
  const f = fixture();
  const actions = load("features/admin/actions.js", f.dependencies);
  const form = new FormData(); form.set("profileId",f.a); form.set("role","admin");
  assert.match((await actions.changeRoleAction(null,form)).error, /permisos/);
  assert.match((await actions.changeOrderStatusAction(null,form)).error, /permisos/);
  assert.ok(!f.state.calls.some((call) => call.rpc));
});

test("callback paths reject browser-normalized external redirects", () => {
  for (const value of ["//evil.test", "/\\evil.test", "/\t/evil.test", "https://evil.test"]) {
    assert.equal(purchase.safeInternalPath(value), "/cuenta");
  }
  assert.equal(purchase.safeInternalPath("/cuenta/pedidos?page=2"), "/cuenta/pedidos?page=2");
});

test("SSR clients isolate cookie stores and force no-store for private fetches", async () => {
  let activeCookies = [{ name: "session", value: "A" }];
  const options = [], requests = [];
  const serverModule = load("lib/supabase/server.js", {
    cookies: async () => { const snapshot = activeCookies; return { getAll: () => snapshot, set() {} }; },
    getPublicSupabaseConfig: () => ({ url: "https://supabase.example.test", key: "public-test-key" }),
    createServerClient: (_url,_key,config) => { options.push(config); return config; },
    fetch: async (input,init) => requests.push({ input,init }),
  });
  await serverModule.createClient();
  activeCookies = [{ name: "session", value: "B" }];
  await serverModule.createClient();
  assert.equal(options[0].cookies.getAll()[0].value, "A");
  assert.equal(options[1].cookies.getAll()[0].value, "B");
  await options[0].global.fetch("https://supabase.example.test/rest/v1/addresses", { cache: "force-cache" });
  assert.equal(requests[0].init.cache, "no-store");
});

test("proxy preserves refresh cookies and SDK no-cache headers", async () => {
  const cookieJar = () => {
    const values = new Map();
    return { set: (name,value) => values.set(name,value), getAll: () => [...values].map(([name,value]) => ({ name,value })) };
  };
  const request = { nextUrl: { pathname: "/cuenta/direcciones" }, cookies: cookieJar() };
  const proxyModule = load("lib/supabase/proxy.js", {
    getPublicSupabaseConfig: () => ({ url: "https://supabase.example.test", key: "public-test-key" }),
    NextResponse: { next: () => ({ cookies: cookieJar(), headers: new Headers() }) },
    createServerClient: (_url,_key,config) => ({ auth: { getClaims: async () => config.cookies.setAll(
      [{ name:"session", value:"refreshed", options:{} }], { "Cache-Control":"private, no-store", "Pragma":"no-cache", "Expires":"0" },
    ) } }),
  });
  const response = await proxyModule.updateSession(request);
  assert.equal(request.cookies.getAll()[0].value, "refreshed");
  assert.equal(response.cookies.getAll()[0].value, "refreshed");
  assert.match(response.headers.get("Cache-Control"), /private, no-store/);
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.equal(response.headers.get("Expires"), "0");
});
