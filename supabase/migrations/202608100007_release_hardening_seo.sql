-- Iteración 6 · SEO, índices de producción y endurecimiento de release.
-- Migración conservadora: no elimina datos ni cambia URLs públicas existentes.

alter table public.products
  add column if not exists seo_title text,
  add column if not exists seo_description text;

alter table public.categories
  add column if not exists seo_title text,
  add column if not exists seo_description text;

alter table public.site_settings
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists social_image_url text,
  add column if not exists canonical_domain text;

alter table public.products drop constraint if exists products_seo_title_length;
alter table public.products add constraint products_seo_title_length
  check (seo_title is null or char_length(seo_title) <= 70);
alter table public.products drop constraint if exists products_seo_description_length;
alter table public.products add constraint products_seo_description_length
  check (seo_description is null or char_length(seo_description) <= 170);

alter table public.categories drop constraint if exists categories_seo_title_length;
alter table public.categories add constraint categories_seo_title_length
  check (seo_title is null or char_length(seo_title) <= 70);
alter table public.categories drop constraint if exists categories_seo_description_length;
alter table public.categories add constraint categories_seo_description_length
  check (seo_description is null or char_length(seo_description) <= 170);

alter table public.site_settings drop constraint if exists site_settings_seo_title_length;
alter table public.site_settings add constraint site_settings_seo_title_length
  check (seo_title is null or char_length(seo_title) <= 70);
alter table public.site_settings drop constraint if exists site_settings_seo_description_length;
alter table public.site_settings add constraint site_settings_seo_description_length
  check (seo_description is null or char_length(seo_description) <= 170);
alter table public.site_settings drop constraint if exists site_settings_canonical_domain_format;
alter table public.site_settings add constraint site_settings_canonical_domain_format
  check (canonical_domain is null or canonical_domain ~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$');

-- Índices vinculados con los ORDER BY/WHERE del catálogo, cuenta y cupones.
create index if not exists products_public_updated_idx
  on public.products(updated_at desc) where active;
create index if not exists categories_public_name_idx
  on public.categories(name) where active;
create index if not exists orders_profile_created_at_idx
  on public.orders(profile_id, created_at desc);
create index if not exists coupon_redemptions_coupon_redeemed_at_idx
  on public.coupon_redemptions(coupon_id, redeemed_at desc);
create index if not exists payment_webhook_events_received_at_idx
  on public.payment_webhook_events(received_at desc);

-- Sustituye las RPC de producto para guardar SEO dentro de la misma transacción.
drop function if exists public.admin_create_product(text,text,text,boolean,uuid,text,text,numeric,numeric,integer,integer,boolean);
create function public.admin_create_product(
  p_name text, p_slug text, p_description text, p_seo_title text, p_seo_description text,
  p_active boolean, p_category_id uuid, p_sku text, p_variant_name text,
  p_price numeric, p_compare_at_price numeric, p_stock integer,
  p_low_stock_threshold integer, p_variant_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_product_id uuid; v_variant_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_slug), '') is null
     or nullif(trim(p_sku), '') is null or nullif(trim(p_variant_name), '') is null
     or char_length(coalesce(p_seo_title, '')) > 70
     or char_length(coalesce(p_seo_description, '')) > 170
     or p_price < 0 or p_stock < 0 or p_low_stock_threshold < 0
     or (p_compare_at_price is not null and p_compare_at_price < p_price) then
    raise exception 'INVALID_PRODUCT';
  end if;

  insert into public.products(name, slug, description, seo_title, seo_description, active)
  values (trim(p_name), lower(trim(p_slug)), nullif(trim(p_description), ''),
    nullif(trim(p_seo_title), ''), nullif(trim(p_seo_description), ''), p_active)
  returning id into v_product_id;
  if p_category_id is not null then
    insert into public.product_categories(product_id, category_id) values (v_product_id, p_category_id);
  end if;
  insert into public.product_variants(product_id, sku, variant_name, price, compare_at_price, active)
  values (v_product_id, upper(trim(p_sku)), trim(p_variant_name), p_price, p_compare_at_price, p_variant_active)
  returning id into v_variant_id;
  insert into public.inventory(variant_id, quantity, low_stock_threshold)
  values (v_variant_id, p_stock, p_low_stock_threshold);
  if p_stock > 0 then
    insert into public.inventory_movements(variant_id, quantity, movement_type, reason, user_id, reference_type, reference_id)
    values (v_variant_id, p_stock, 'in', 'Inventario inicial', auth.uid(), 'product', v_product_id);
  end if;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'product.created', 'product', v_product_id::text,
    jsonb_build_object('name', trim(p_name), 'sku', upper(trim(p_sku)), 'price', p_price,
      'active', p_active, 'seoTitle', nullif(trim(p_seo_title), '')));
  return v_product_id;
end;
$$;

drop function if exists public.admin_update_product(uuid,text,text,text,boolean,uuid);
create function public.admin_update_product(
  p_product_id uuid, p_name text, p_slug text, p_description text,
  p_seo_title text, p_seo_description text, p_active boolean, p_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_old public.products%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_slug),'') is null
     or char_length(coalesce(p_seo_title, '')) > 70
     or char_length(coalesce(p_seo_description, '')) > 170 then
    raise exception 'INVALID_PRODUCT';
  end if;
  select * into v_old from public.products where id=p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  update public.products set name=trim(p_name), slug=lower(trim(p_slug)),
    description=nullif(trim(p_description),''), seo_title=nullif(trim(p_seo_title),''),
    seo_description=nullif(trim(p_seo_description),''), active=p_active
  where id=p_product_id;
  delete from public.product_categories where product_id=p_product_id;
  if p_category_id is not null then
    insert into public.product_categories(product_id,category_id) values(p_product_id,p_category_id);
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'product.updated','product',p_product_id::text,
    jsonb_build_object('name',v_old.name,'slug',v_old.slug,'active',v_old.active,'seoTitle',v_old.seo_title),
    jsonb_build_object('name',trim(p_name),'slug',lower(trim(p_slug)),'active',p_active,
      'seoTitle',nullif(trim(p_seo_title),'')));
  return p_product_id;
end;
$$;

-- Sustituye la RPC de configuración para mantener SEO global y auditoría atómica.
drop function if exists public.admin_save_site_settings(text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb);
create function public.admin_save_site_settings(
  p_store_name text,p_logo_url text,p_favicon_url text,p_primary_color text,
  p_secondary_color text,p_accent_color text,p_currency text,p_contact_data jsonb,
  p_social_links jsonb,p_home_content jsonb,p_footer_content jsonb,
  p_seo_title text,p_seo_description text,p_social_image_url text,p_canonical_domain text
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_old jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if nullif(trim(p_store_name),'') is null or length(trim(p_store_name))>120 then raise exception 'INVALID_STORE_NAME'; end if;
  if char_length(coalesce(p_seo_title,''))>70 or char_length(coalesce(p_seo_description,''))>170 then raise exception 'INVALID_SEO'; end if;
  if nullif(trim(p_canonical_domain),'') is not null and trim(p_canonical_domain) !~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$' then raise exception 'INVALID_CANONICAL'; end if;
  if nullif(trim(p_social_image_url),'') is not null and trim(p_social_image_url) !~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$' then raise exception 'INVALID_SOCIAL_IMAGE'; end if;
  if p_primary_color !~ '^#[0-9A-Fa-f]{6}$' or p_secondary_color !~ '^#[0-9A-Fa-f]{6}$' or p_accent_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_COLOR'; end if;
  if upper(p_currency) !~ '^[A-Z]{3}$' then raise exception 'INVALID_CURRENCY'; end if;
  if jsonb_typeof(p_contact_data)<>'object' or jsonb_typeof(p_social_links)<>'object'
    or jsonb_typeof(p_home_content)<>'object' or jsonb_typeof(p_footer_content)<>'object' then raise exception 'INVALID_SETTINGS'; end if;
  select id,to_jsonb(settings) into v_id,v_old from public.site_settings settings order by created_at limit 1 for update;
  if v_id is null then
    insert into public.site_settings(store_name,logo_url,favicon_url,primary_color,secondary_color,accent_color,currency,
      contact_data,social_links,home_content,footer_content,seo_title,seo_description,social_image_url,canonical_domain)
    values(trim(p_store_name),nullif(trim(p_logo_url),''),nullif(trim(p_favicon_url),''),lower(p_primary_color),
      lower(p_secondary_color),lower(p_accent_color),upper(p_currency),p_contact_data,p_social_links,p_home_content,
      p_footer_content,nullif(trim(p_seo_title),''),nullif(trim(p_seo_description),''),
      nullif(trim(p_social_image_url),''),nullif(rtrim(trim(p_canonical_domain),'/'),''))
    returning id into v_id;
  else
    update public.site_settings set store_name=trim(p_store_name),logo_url=nullif(trim(p_logo_url),''),
      favicon_url=nullif(trim(p_favicon_url),''),primary_color=lower(p_primary_color),secondary_color=lower(p_secondary_color),
      accent_color=lower(p_accent_color),currency=upper(p_currency),contact_data=p_contact_data,social_links=p_social_links,
      home_content=p_home_content,footer_content=p_footer_content,seo_title=nullif(trim(p_seo_title),''),
      seo_description=nullif(trim(p_seo_description),''),social_image_url=nullif(trim(p_social_image_url),''),
      canonical_domain=nullif(rtrim(trim(p_canonical_domain),'/'),'') where id=v_id;
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'site_settings.updated','site_settings',v_id::text,v_old,
    jsonb_build_object('storeName',trim(p_store_name),'logoUrl',nullif(trim(p_logo_url),''),
      'faviconUrl',nullif(trim(p_favicon_url),''),'primaryColor',lower(p_primary_color),
      'secondaryColor',lower(p_secondary_color),'accentColor',lower(p_accent_color),'currency',upper(p_currency),
      'contact',p_contact_data,'socialLinks',p_social_links,'homeContent',p_home_content,'footerContent',p_footer_content,
      'seoTitle',nullif(trim(p_seo_title),''),'canonicalDomain',nullif(rtrim(trim(p_canonical_domain),'/'),'')));
  return v_id;
end;
$$;

revoke all on function public.admin_create_product(text,text,text,text,text,boolean,uuid,text,text,numeric,numeric,integer,integer,boolean) from public,anon;
revoke all on function public.admin_update_product(uuid,text,text,text,text,text,boolean,uuid) from public,anon;
revoke all on function public.admin_save_site_settings(text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,text,text) from public,anon;
grant execute on function public.admin_create_product(text,text,text,text,text,boolean,uuid,text,text,numeric,numeric,integer,integer,boolean) to authenticated;
grant execute on function public.admin_update_product(uuid,text,text,text,text,text,boolean,uuid) to authenticated;
grant execute on function public.admin_save_site_settings(text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,text,text) to authenticated;
