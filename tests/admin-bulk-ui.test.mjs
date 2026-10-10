import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const component=read("src/components/admin/bulk-selection.js");
const accountLayout=read("src/app/cuenta/layout.js");
const loginAction=read("src/features/auth/actions.js");
const loginPage=read("src/app/auth/login/page.js");
const callback=read("src/app/auth/callback/route.js");

test("all deletable admin CRUDs use the shared bulk-selection flow",()=>{
  const pages=["productos","categorias","promociones","personalizacion"].map((name)=>read(`src/app/admin/${name}/page.js`));
  for(const page of pages){assert.match(page,/BulkSelection/);assert.match(page,/BulkSelectionCheckbox/);assert.match(page,/BulkSelectAllCheckbox/);}
  assert.match(component,/Confirmar eliminación/);
  assert.match(component,/>Cancelar</);
  assert.match(component,/pending \? "Eliminando…"/);
  assert.match(component,/state\?\.error[\s\S]*role="alert"/);
  assert.match(component,/state\?\.success[\s\S]*role="status"/);
});

test("admin login and account access redirect server-side while normal next is preserved",()=>{
  assert.match(loginAction,/profile\.role === "admin" \? "\/admin\/dashboard" : safeInternalPath/);
  assert.match(loginPage,/profile\?\.role === "admin" \? "\/admin\/dashboard" : next/);
  assert.match(accountLayout,/profile\?\.role === "admin"[\s\S]*redirect\("\/admin\/dashboard"\)/);
  assert.match(callback,/next\.startsWith\("\/cuenta\/"\)[\s\S]*profile\?\.role === "admin"[\s\S]*"\/admin\/dashboard"/);
});
