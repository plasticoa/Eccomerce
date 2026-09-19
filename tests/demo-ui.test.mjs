import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { transformSync } from "next/dist/build/swc/index.js";
import * as catalog from "../src/features/catalog/catalog-utils.js";

// Compile the actual component with Next's installed JSX compiler. Hooks and
// external components are controlled here; this is logical UI testing, not E2E.
function loadComponent(path, dependencies) {
  const source=readFileSync(new URL(`../src/${path}`,import.meta.url),"utf8");
  const {code}=transformSync(source,{jsc:{parser:{syntax:"ecmascript",jsx:true},transform:{react:{runtime:"classic"}}},module:{type:"commonjs"}});
  const exports={};
  new Function("require","exports","React",code)((id)=>{
    if(!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  },exports,React);
  return exports;
}
function nodes(element) {
  if(!element || typeof element!=="object") return [];
  return [element,...React.Children.toArray(element.props?.children).flatMap(nodes)];
}

test("switching variant updates SKU/price/stock and resets a formerly larger quantity",()=>{
  const state=[]; let cursor=0; const calls=[];
  const QuantitySelector=()=>null;
  const {ProductVariantSelector}=loadComponent("components/store/product-variant-selector.js",{
    react:{useState(initial){const i=cursor++; if(!(i in state)) state[i]=initial; return [state[i],(value)=>{state[i]=value;}];}},
    "@/features/catalog/catalog-utils":catalog,
    "./product-availability":{ProductAvailability:()=>null},
    "@/components/cart/quantity-selector":{QuantitySelector},
    "@/components/cart/cart-provider":{useCart:()=>({addItem:(...args)=>calls.push(args),busy:false,message:""})},
    "./store-settings-provider":{useStoreSettings:()=>({currency:"GTQ"})},
  });
  const variants=[{id:"large",name:"20,000 mAh",sku:"DEMO-PWB-20K",price:269,quantity:20,active:true,lowStockThreshold:3},
    {id:"small",name:"10,000 mAh",sku:"DEMO-PWB-10K",price:159,quantity:2,active:true,lowStockThreshold:3}];
  const render=()=>{cursor=0;return nodes(ProductVariantSelector({variants}));};
  let tree=render();
  assert.equal(tree.find((n)=>n.type==="button").props.disabled,true);
  tree.find((n)=>n.type==="input" && n.props.value==="large").props.onChange();
  tree=render(); tree.find((n)=>n.type===QuantitySelector).props.onChange(15);
  tree=render(); tree.find((n)=>n.type==="input" && n.props.value==="small").props.onChange();
  tree=render();
  assert.equal(tree.find((n)=>n.type===QuantitySelector).props.value,1);
  assert.equal(tree.find((n)=>n.type===QuantitySelector).props.max,2);
  const content=tree.map((n)=>n.props.children).filter((x)=>typeof x==="string");
  assert.ok(content.includes("DEMO-PWB-10K")); assert.ok(content.includes("2 unidades"));
  assert.ok(content.includes(catalog.formatCurrency(159,"GTQ")));
  tree.find((n)=>n.type==="button").props.onClick();
  assert.deepEqual(calls,[["small",1]]);
});

test("gallery without images renders neutral fallback and never requests an image",()=>{
  const Image=()=>null, ProductImageFallback=()=>null;
  const {ProductGallery}=loadComponent("components/store/product-gallery.js",{
    react:{useState:(initial)=>[initial,()=>{}]}, "next/image":Image,
    "@/features/catalog/catalog-utils":catalog,"./product-image-fallback":{ProductImageFallback},
  });
  const tree=nodes(ProductGallery({images:[],productName:"Producto Demo"}));
  assert.ok(tree.some((n)=>n.type===ProductImageFallback));
  assert.ok(!tree.some((n)=>n.type===Image));
});
