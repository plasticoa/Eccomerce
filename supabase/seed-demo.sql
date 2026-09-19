-- Explicit demo loader. Apply all migrations first; execute as postgres in SQL Editor.
-- Idempotent: preserves existing demo prices, inventory, movements and manual images.
-- Namespace collisions with non-demo products/SKUs/coupons abort the entire transaction.
begin;
select pg_advisory_xact_lock(2147483002);
do $seed$
declare
  p jsonb; v jsonb; category_id_value uuid; product_id_value uuid;
  variant_id_value uuid; tag_id_value uuid; existing_product uuid;
  stock_inserted uuid; coupon_row public.coupons%rowtype;
begin
  insert into public.tags(name,slug) values('demo','demo') on conflict(slug) do nothing;
  select id into tag_id_value from public.tags where slug='demo';
  for p in select value from jsonb_array_elements($data$
[
  {
    "name": "Audífonos Bluetooth Demo",
    "slug": "audifonos-bluetooth-demo",
    "category": "Tecnología",
    "categorySlug": "tecnologia",
    "description": "Audífonos Bluetooth: artículo de demostración de la categoría Tecnología, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Negro",
        "sku": "DEMO-TEC-AUD-BLK",
        "price": 199,
        "stock": 2,
        "threshold": 3
      },
      {
        "name": "Blanco",
        "sku": "DEMO-TEC-AUD-WHT",
        "price": 199,
        "stock": 2,
        "threshold": 3
      },
      {
        "name": "Azul",
        "sku": "DEMO-TEC-AUD-BLU",
        "price": 209,
        "stock": 2,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Power Bank Demo",
    "slug": "power-bank-demo",
    "category": "Tecnología",
    "categorySlug": "tecnologia",
    "description": "Power Bank: artículo de demostración de la categoría Tecnología, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "10,000 mAh",
        "sku": "DEMO-TEC-PWB-10K",
        "price": 159,
        "stock": 20,
        "threshold": 3
      },
      {
        "name": "20,000 mAh",
        "sku": "DEMO-TEC-PWB-20K",
        "price": 269,
        "stock": 25,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Cargador USB-C Demo",
    "slug": "cargador-usb-c-demo",
    "category": "Tecnología",
    "categorySlug": "tecnologia",
    "description": "Cargador USB-C: artículo de demostración de la categoría Tecnología, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "20W",
        "sku": "DEMO-TEC-CAR-20W",
        "price": 89,
        "stock": 30,
        "threshold": 3
      },
      {
        "name": "30W",
        "sku": "DEMO-TEC-CAR-30W",
        "price": 129,
        "stock": 5,
        "threshold": 3
      },
      {
        "name": "45W",
        "sku": "DEMO-TEC-CAR-45W",
        "price": 189,
        "stock": 8,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Smartwatch Demo",
    "slug": "smartwatch-demo",
    "category": "Tecnología",
    "categorySlug": "tecnologia",
    "description": "Smartwatch: artículo de demostración de la categoría Tecnología, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Negro",
        "sku": "DEMO-TEC-SWT-BLK",
        "price": 499,
        "stock": 10,
        "threshold": 3
      },
      {
        "name": "Plata",
        "sku": "DEMO-TEC-SWT-SLV",
        "price": 529,
        "stock": 15,
        "threshold": 3
      },
      {
        "name": "Rosa",
        "sku": "DEMO-TEC-SWT-PNK",
        "price": 519,
        "stock": 20,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Cable USB-C Demo",
    "slug": "cable-usb-c-demo",
    "category": "Tecnología",
    "categorySlug": "tecnologia",
    "description": "Cable USB-C: artículo de demostración de la categoría Tecnología, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "1 metro",
        "sku": "DEMO-TEC-CAB-1M",
        "price": 35,
        "stock": 25,
        "threshold": 3
      },
      {
        "name": "2 metros",
        "sku": "DEMO-TEC-CAB-2M",
        "price": 49,
        "stock": 30,
        "threshold": 3
      },
      {
        "name": "3 metros",
        "sku": "DEMO-TEC-CAB-3M",
        "price": 65,
        "stock": 5,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Termo Acero Inoxidable Demo",
    "slug": "termo-acero-inoxidable-demo",
    "category": "Hogar",
    "categorySlug": "hogar",
    "description": "Termo Acero Inoxidable: artículo de demostración de la categoría Hogar, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "500 ml",
        "sku": "DEMO-HOG-TER-500",
        "price": 99,
        "stock": 8,
        "threshold": 3
      },
      {
        "name": "750 ml",
        "sku": "DEMO-HOG-TER-750",
        "price": 129,
        "stock": 10,
        "threshold": 3
      },
      {
        "name": "1 litro",
        "sku": "DEMO-HOG-TER-1L",
        "price": 159,
        "stock": 15,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Lámpara LED de Escritorio Demo",
    "slug": "lampara-led-de-escritorio-demo",
    "category": "Hogar",
    "categorySlug": "hogar",
    "description": "Lámpara LED de Escritorio: artículo de demostración de la categoría Hogar, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Blanco",
        "sku": "DEMO-HOG-LAM-WHT",
        "price": 179,
        "stock": 20,
        "threshold": 3
      },
      {
        "name": "Negro",
        "sku": "DEMO-HOG-LAM-BLK",
        "price": 189,
        "stock": 25,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Organizador Multipropósito Demo",
    "slug": "organizador-multiproposito-demo",
    "category": "Hogar",
    "categorySlug": "hogar",
    "description": "Organizador Multipropósito: artículo de demostración de la categoría Hogar, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Pequeño",
        "sku": "DEMO-HOG-ORG-S",
        "price": 45,
        "stock": 30,
        "threshold": 3
      },
      {
        "name": "Mediano",
        "sku": "DEMO-HOG-ORG-M",
        "price": 69,
        "stock": 5,
        "threshold": 3
      },
      {
        "name": "Grande",
        "sku": "DEMO-HOG-ORG-L",
        "price": 95,
        "stock": 8,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Báscula Digital Demo",
    "slug": "bascula-digital-demo",
    "category": "Hogar",
    "categorySlug": "hogar",
    "description": "Báscula Digital: artículo de demostración de la categoría Hogar, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Estándar",
        "sku": "DEMO-HOG-BAS-STD",
        "price": 149,
        "stock": 10,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Botella Deportiva Demo",
    "slug": "botella-deportiva-demo",
    "category": "Hogar",
    "categorySlug": "hogar",
    "description": "Botella Deportiva: artículo de demostración de la categoría Hogar, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "600 ml",
        "sku": "DEMO-HOG-BOT-600",
        "price": 59,
        "stock": 15,
        "threshold": 3
      },
      {
        "name": "1 litro",
        "sku": "DEMO-HOG-BOT-1L",
        "price": 79,
        "stock": 20,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Mochila Urbana Demo",
    "slug": "mochila-urbana-demo",
    "category": "Accesorios",
    "categorySlug": "accesorios",
    "description": "Mochila Urbana: artículo de demostración de la categoría Accesorios, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Negro",
        "sku": "DEMO-ACC-MOC-BLK",
        "price": 249,
        "stock": 25,
        "threshold": 3
      },
      {
        "name": "Gris",
        "sku": "DEMO-ACC-MOC-GRY",
        "price": 259,
        "stock": 30,
        "threshold": 3
      },
      {
        "name": "Azul",
        "sku": "DEMO-ACC-MOC-BLU",
        "price": 249,
        "stock": 5,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Billetera Demo",
    "slug": "billetera-demo",
    "category": "Accesorios",
    "categorySlug": "accesorios",
    "description": "Billetera: artículo de demostración de la categoría Accesorios, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Negro",
        "sku": "DEMO-ACC-BIL-BLK",
        "price": 89,
        "stock": 8,
        "threshold": 3
      },
      {
        "name": "Café",
        "sku": "DEMO-ACC-BIL-BRN",
        "price": 95,
        "stock": 10,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Gorra Ajustable Demo",
    "slug": "gorra-ajustable-demo",
    "category": "Accesorios",
    "categorySlug": "accesorios",
    "description": "Gorra Ajustable: artículo de demostración de la categoría Accesorios, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Negro",
        "sku": "DEMO-ACC-GOR-BLK",
        "price": 65,
        "stock": 15,
        "threshold": 3
      },
      {
        "name": "Blanco",
        "sku": "DEMO-ACC-GOR-WHT",
        "price": 65,
        "stock": 20,
        "threshold": 3
      },
      {
        "name": "Azul",
        "sku": "DEMO-ACC-GOR-BLU",
        "price": 69,
        "stock": 25,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Paraguas Automático Demo",
    "slug": "paraguas-automatico-demo",
    "category": "Accesorios",
    "categorySlug": "accesorios",
    "description": "Paraguas Automático: artículo de demostración de la categoría Accesorios, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Negro",
        "sku": "DEMO-ACC-PAR-BLK",
        "price": 99,
        "stock": 30,
        "threshold": 3
      },
      {
        "name": "Azul",
        "sku": "DEMO-ACC-PAR-BLU",
        "price": 109,
        "stock": 5,
        "threshold": 3
      },
      {
        "name": "Rojo",
        "sku": "DEMO-ACC-PAR-RED",
        "price": 109,
        "stock": 8,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Lentes de Sol Demo",
    "slug": "lentes-de-sol-demo",
    "category": "Accesorios",
    "categorySlug": "accesorios",
    "description": "Lentes de Sol: artículo de demostración de la categoría Accesorios, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Negro",
        "sku": "DEMO-ACC-LEN-BLK",
        "price": 119,
        "stock": 10,
        "threshold": 3
      },
      {
        "name": "Café",
        "sku": "DEMO-ACC-LEN-BRN",
        "price": 129,
        "stock": 15,
        "threshold": 3
      },
      {
        "name": "Azul",
        "sku": "DEMO-ACC-LEN-BLU",
        "price": 139,
        "stock": 20,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Mouse Inalámbrico Demo",
    "slug": "mouse-inalambrico-demo",
    "category": "Oficina",
    "categorySlug": "oficina",
    "description": "Mouse Inalámbrico: artículo de demostración de la categoría Oficina, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Negro",
        "sku": "DEMO-OFI-MOU-BLK",
        "price": 89,
        "stock": 25,
        "threshold": 3
      },
      {
        "name": "Blanco",
        "sku": "DEMO-OFI-MOU-WHT",
        "price": 99,
        "stock": 30,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Teclado Inalámbrico Demo",
    "slug": "teclado-inalambrico-demo",
    "category": "Oficina",
    "categorySlug": "oficina",
    "description": "Teclado Inalámbrico: artículo de demostración de la categoría Oficina, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Español",
        "sku": "DEMO-OFI-TEC-ES",
        "price": 199,
        "stock": 5,
        "threshold": 3
      },
      {
        "name": "Inglés",
        "sku": "DEMO-OFI-TEC-EN",
        "price": 189,
        "stock": 8,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Soporte para Laptop Demo",
    "slug": "soporte-para-laptop-demo",
    "category": "Oficina",
    "categorySlug": "oficina",
    "description": "Soporte para Laptop: artículo de demostración de la categoría Oficina, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Aluminio",
        "sku": "DEMO-OFI-SOP-ALU",
        "price": 229,
        "stock": 10,
        "threshold": 3
      },
      {
        "name": "Negro",
        "sku": "DEMO-OFI-SOP-BLK",
        "price": 209,
        "stock": 15,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Hub USB-C Demo",
    "slug": "hub-usb-c-demo",
    "category": "Oficina",
    "categorySlug": "oficina",
    "description": "Hub USB-C: artículo de demostración de la categoría Oficina, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "5 puertos",
        "sku": "DEMO-OFI-HUB-5P",
        "price": 199,
        "stock": 20,
        "threshold": 3
      },
      {
        "name": "7 puertos",
        "sku": "DEMO-OFI-HUB-7P",
        "price": 299,
        "stock": 25,
        "threshold": 3
      },
      {
        "name": "9 puertos",
        "sku": "DEMO-OFI-HUB-9P",
        "price": 399,
        "stock": 30,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Pad de Escritorio Demo",
    "slug": "pad-de-escritorio-demo",
    "category": "Oficina",
    "categorySlug": "oficina",
    "description": "Pad de Escritorio: artículo de demostración de la categoría Oficina, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Mediano",
        "sku": "DEMO-OFI-PAD-M",
        "price": 69,
        "stock": 5,
        "threshold": 3
      },
      {
        "name": "Grande",
        "sku": "DEMO-OFI-PAD-L",
        "price": 99,
        "stock": 8,
        "threshold": 3
      },
      {
        "name": "Extra Grande",
        "sku": "DEMO-OFI-PAD-XL",
        "price": 139,
        "stock": 10,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Organizador de Equipaje Demo",
    "slug": "organizador-de-equipaje-demo",
    "category": "Viaje",
    "categorySlug": "viaje",
    "description": "Organizador de Equipaje: artículo de demostración de la categoría Viaje, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Kit 3 piezas",
        "sku": "DEMO-VIA-ORG-3P",
        "price": 99,
        "stock": 15,
        "threshold": 3
      },
      {
        "name": "Kit 6 piezas",
        "sku": "DEMO-VIA-ORG-6P",
        "price": 169,
        "stock": 20,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Almohada de Viaje Demo",
    "slug": "almohada-de-viaje-demo",
    "category": "Viaje",
    "categorySlug": "viaje",
    "description": "Almohada de Viaje: artículo de demostración de la categoría Viaje, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Gris",
        "sku": "DEMO-VIA-ALM-GRY",
        "price": 89,
        "stock": 25,
        "threshold": 3
      },
      {
        "name": "Azul",
        "sku": "DEMO-VIA-ALM-BLU",
        "price": 95,
        "stock": 30,
        "threshold": 3
      },
      {
        "name": "Negro",
        "sku": "DEMO-VIA-ALM-BLK",
        "price": 89,
        "stock": 5,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Adaptador Universal Demo",
    "slug": "adaptador-universal-demo",
    "category": "Viaje",
    "categorySlug": "viaje",
    "description": "Adaptador Universal: artículo de demostración de la categoría Viaje, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Estándar",
        "sku": "DEMO-VIA-ADP-STD",
        "price": 159,
        "stock": 8,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Báscula para Equipaje Demo",
    "slug": "bascula-para-equipaje-demo",
    "category": "Viaje",
    "categorySlug": "viaje",
    "description": "Báscula para Equipaje: artículo de demostración de la categoría Viaje, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "Estándar",
        "sku": "DEMO-VIA-BAS-STD",
        "price": 119,
        "stock": 10,
        "threshold": 3
      }
    ]
  },
  {
    "name": "Mochila de Viaje Demo",
    "slug": "mochila-de-viaje-demo",
    "category": "Viaje",
    "categorySlug": "viaje",
    "description": "Mochila de Viaje: artículo de demostración de la categoría Viaje, disponible en las presentaciones indicadas. Consulta precio y existencias al seleccionar una variante.",
    "variants": [
      {
        "name": "20 litros",
        "sku": "DEMO-VIA-MOC-20L",
        "price": 349,
        "stock": 15,
        "threshold": 3
      },
      {
        "name": "30 litros",
        "sku": "DEMO-VIA-MOC-30L",
        "price": 449,
        "stock": 20,
        "threshold": 3
      },
      {
        "name": "40 litros",
        "sku": "DEMO-VIA-MOC-40L",
        "price": 599,
        "stock": 25,
        "threshold": 3
      }
    ]
  }
]
$data$::jsonb)
  loop
    -- Reuse equivalent names (case/accents) even when their existing slug differs.
    select id into category_id_value from public.categories
    where slug=p->>'categorySlug'
      or translate(lower(trim(name)), 'áéíóúü', 'aeiouu')=translate(lower(p->>'category'), 'áéíóúü', 'aeiouu')
    order by (slug=p->>'categorySlug') desc, created_at, id limit 1;
    if category_id_value is null then
      insert into public.categories(name,slug,description,active)
      values(p->>'category',p->>'categorySlug','Productos para ' || lower(p->>'category') || '.',true)
      returning id into category_id_value;
    else
      -- Activation is the only intentional change to a reused real category.
      update public.categories set active=true where id=category_id_value and not active;
      if not exists(select 1 from public.categories where id=category_id_value and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') then
        raise exception 'DEMO_CATEGORY_INVALID_SLUG: %', p->>'category';
      end if;
    end if;
    select id into product_id_value from public.products where slug=p->>'slug';
    if product_id_value is not null and not exists(
      select 1 from public.product_tags where product_id=product_id_value and tag_id=tag_id_value
    ) then raise exception 'DEMO_PRODUCT_COLLISION: %', p->>'slug'; end if;
    if product_id_value is null then
      insert into public.products(name,slug,description,active)
      values(p->>'name',p->>'slug',p->>'description',true) returning id into product_id_value;
    end if;
    insert into public.product_tags(product_id,tag_id) values(product_id_value,tag_id_value) on conflict do nothing;
    insert into public.product_categories(product_id,category_id) values(product_id_value,category_id_value) on conflict do nothing;
    for v in select value from jsonb_array_elements(p->'variants')
    loop
      select id,product_id into variant_id_value,existing_product from public.product_variants where sku=v->>'sku';
      if variant_id_value is not null and existing_product<>product_id_value then
        raise exception 'DEMO_SKU_COLLISION: %', v->>'sku';
      end if;
      if variant_id_value is null then
        insert into public.product_variants(product_id,sku,variant_name,price,active)
        values(product_id_value,v->>'sku',v->>'name',(v->>'price')::numeric,true)
        returning id into variant_id_value;
      end if;
      stock_inserted:=null;
      insert into public.inventory(variant_id,quantity,low_stock_threshold)
      values(variant_id_value,(v->>'stock')::integer,(v->>'threshold')::integer)
      on conflict(variant_id) do nothing returning variant_id into stock_inserted;
      if stock_inserted is not null then
        insert into public.inventory_movements(variant_id,quantity,movement_type,reason,reference_type,reference_id)
        values(variant_id_value,(v->>'stock')::integer,'in','Inventario inicial demo','demo_seed',product_id_value);
      end if;
    end loop;
  end loop;
  select * into coupon_row from public.coupons where lower(code)='pruebaestudiante';
  if found then
    if coupon_row.description is distinct from 'Demo Importadora Valiente: PruebaEstudiante 10%' then
      raise exception 'DEMO_COUPON_COLLISION: PruebaEstudiante already exists outside this seed';
    end if;
  else
    insert into public.coupons(code,description,discount_type,discount_value,minimum_order,usage_limit,active,starts_at,ends_at)
    values('PRUEBAESTUDIANTE','Demo Importadora Valiente: PruebaEstudiante 10%','percentage',10,0,null,true,null,null);
  end if;
end;
$seed$;
commit;

-- Summary includes the current store currency; the seed never changes it.
select count(distinct p.id) as demo_products, count(distinct v.id) as demo_variants,
  (select currency from public.site_settings order by created_at limit 1) as currency
from public.products p join public.product_tags pt on pt.product_id=p.id
join public.tags t on t.id=pt.tag_id and t.slug='demo'
join public.product_variants v on v.product_id=p.id and v.sku like 'DEMO-%';

