-- Iteración 5 · Personalización, promociones y configuración general.
-- Extiende entidades existentes y mantiene el cálculo final del checkout en PostgreSQL.

alter table public.site_settings
  add column if not exists favicon_url text,
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists home_content jsonb not null default '{}'::jsonb,
  add column if not exists footer_content jsonb not null default '{}'::jsonb;

alter table public.site_settings
  add constraint site_settings_contact_object check (jsonb_typeof(contact_data) = 'object'),
  add constraint site_settings_social_object check (jsonb_typeof(social_links) = 'object'),
  add constraint site_settings_home_object check (jsonb_typeof(home_content) = 'object'),
  add constraint site_settings_footer_object check (jsonb_typeof(footer_content) = 'object');

alter table public.banners
  add column if not exists button_text text;

do $$
begin
  if exists(select 1 from public.coupons group by lower(trim(code)) having count(*)>1) then
    raise exception 'DUPLICATE_COUPON_CODES_CASE_INSENSITIVE: resolve duplicates before applying Iteration 5';
  end if;
end;
$$;
update public.coupons set code = upper(trim(code));
create unique index if not exists coupons_code_normalized_unique on public.coupons(lower(code));
alter table public.coupons
  add constraint coupons_percentage_max check (discount_type <> 'percentage' or discount_value <= 100);

create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('local_delivery','store_pickup')),
  name text not null,
  description text,
  price numeric(12,2) not null default 0 check (price >= 0),
  instructions text,
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create trigger shipping_methods_set_updated_at before update on public.shipping_methods
  for each row execute function public.set_updated_at();
create index shipping_methods_public_order_idx on public.shipping_methods(active,sort_order);
create index coupons_admin_filter_idx on public.coupons(active,starts_at,ends_at);
create index banners_public_order_idx on public.banners(active,sort_order,starts_at,ends_at);

insert into public.site_settings(store_name,primary_color,secondary_color,accent_color,currency,contact_data,social_links,home_content,footer_content)
select 'Importadora Valiente','#174c35','#246c4b','#d8a93f','GTQ','{}','{}',
  jsonb_build_object('eyebrow','Importadora Valiente','title','Soluciones valientes para cada proyecto.',
    'subtitle','Productos útiles para el hogar, el trabajo y esos planes que merecen empezar hoy.',
    'buttonText','Explorar productos','buttonUrl','/productos','additionalMessage',''),
  jsonb_build_object('description','Productos útiles, seleccionados con confianza.','links',jsonb_build_array())
where not exists(select 1 from public.site_settings);

insert into public.shipping_methods(code,name,description,price,instructions,active,sort_order) values
  ('local_delivery','Entrega local','Entrega coordinada dentro del área disponible.',35,null,true,10),
  ('store_pickup','Retiro en tienda','Retira tu compra sin costo.','0','Coordinaremos cuándo estará listo.',true,20)
on conflict(code) do nothing;

alter table public.shipping_methods enable row level security;
create policy shipping_methods_public_read on public.shipping_methods for select using(active);
create policy shipping_methods_admin_all on public.shipping_methods for all to authenticated
  using(public.is_admin()) with check(public.is_admin());
grant select on public.shipping_methods to anon,authenticated;
grant insert,update,delete on public.shipping_methods to authenticated;

create policy coupons_redeemer_read on public.coupons for select to authenticated using(
  exists(select 1 from public.coupon_redemptions redemption where redemption.coupon_id=public.coupons.id and redemption.profile_id=auth.uid())
);

drop policy if exists banners_public_read on public.banners;
create policy banners_public_read on public.banners for select using(
  active and (starts_at is null or starts_at <= timezone('utc',now()))
  and (ends_at is null or ends_at >= timezone('utc',now()))
);

-- Toda mutación pasa por RPCs auditadas. RLS continúa como defensa adicional.
revoke insert,update,delete on public.site_settings,public.banners,public.coupons,
  public.coupon_redemptions,public.shipping_methods from authenticated;

create or replace function public.admin_save_site_settings(
  p_store_name text,p_logo_url text,p_favicon_url text,p_primary_color text,
  p_secondary_color text,p_accent_color text,p_currency text,p_contact_data jsonb,
  p_social_links jsonb,p_home_content jsonb,p_footer_content jsonb
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_old jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if nullif(trim(p_store_name),'') is null or length(trim(p_store_name))>120 then raise exception 'INVALID_STORE_NAME'; end if;
  if p_primary_color !~ '^#[0-9A-Fa-f]{6}$' or p_secondary_color !~ '^#[0-9A-Fa-f]{6}$' or p_accent_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_COLOR'; end if;
  if upper(p_currency) !~ '^[A-Z]{3}$' then raise exception 'INVALID_CURRENCY'; end if;
  if jsonb_typeof(p_contact_data)<>'object' or jsonb_typeof(p_social_links)<>'object'
    or jsonb_typeof(p_home_content)<>'object' or jsonb_typeof(p_footer_content)<>'object' then raise exception 'INVALID_SETTINGS'; end if;
  select id,to_jsonb(settings) into v_id,v_old from public.site_settings settings order by created_at limit 1 for update;
  if v_id is null then
    insert into public.site_settings(store_name,logo_url,favicon_url,primary_color,secondary_color,accent_color,currency,contact_data,social_links,home_content,footer_content)
    values(trim(p_store_name),nullif(trim(p_logo_url),''),nullif(trim(p_favicon_url),''),lower(p_primary_color),lower(p_secondary_color),lower(p_accent_color),upper(p_currency),p_contact_data,p_social_links,p_home_content,p_footer_content)
    returning id into v_id;
  else
    update public.site_settings set store_name=trim(p_store_name),logo_url=nullif(trim(p_logo_url),''),favicon_url=nullif(trim(p_favicon_url),''),
      primary_color=lower(p_primary_color),secondary_color=lower(p_secondary_color),accent_color=lower(p_accent_color),currency=upper(p_currency),
      contact_data=p_contact_data,social_links=p_social_links,home_content=p_home_content,footer_content=p_footer_content where id=v_id;
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'site_settings.updated','site_settings',v_id::text,v_old,
    jsonb_build_object('storeName',trim(p_store_name),'logoUrl',nullif(trim(p_logo_url),''),'faviconUrl',nullif(trim(p_favicon_url),''),
      'primaryColor',lower(p_primary_color),'secondaryColor',lower(p_secondary_color),'accentColor',lower(p_accent_color),
      'currency',upper(p_currency),'contact',p_contact_data,'socialLinks',p_social_links,'homeContent',p_home_content,'footerContent',p_footer_content));
  return v_id;
end;
$$;

create or replace function public.admin_save_banner(
  p_id uuid,p_title text,p_subtitle text,p_image_url text,p_button_text text,p_link_url text,
  p_sort_order integer,p_active boolean,p_starts_at timestamptz,p_ends_at timestamptz
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_old jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if nullif(trim(p_title),'') is null or nullif(trim(p_image_url),'') is null or p_sort_order<0 then raise exception 'INVALID_BANNER'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_link_url is not null and p_link_url<>'' and p_link_url !~ '^(https?://|/)' then raise exception 'INVALID_URL'; end if;
  if p_id is null then
    insert into public.banners(title,subtitle,image_url,button_text,link_url,sort_order,active,starts_at,ends_at)
    values(trim(p_title),nullif(trim(p_subtitle),''),trim(p_image_url),nullif(trim(p_button_text),''),nullif(trim(p_link_url),''),p_sort_order,p_active,p_starts_at,p_ends_at)
    returning id into v_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,new_data)
    values(auth.uid(),'banner.created','banner',v_id::text,jsonb_build_object('title',trim(p_title),'active',p_active,'imageUrl',trim(p_image_url)));
  else
    select to_jsonb(banner) into v_old from public.banners banner where id=p_id for update;
    if v_old is null then raise exception 'BANNER_NOT_FOUND'; end if;
    update public.banners set title=trim(p_title),subtitle=nullif(trim(p_subtitle),''),image_url=trim(p_image_url),
      button_text=nullif(trim(p_button_text),''),link_url=nullif(trim(p_link_url),''),sort_order=p_sort_order,
      active=p_active,starts_at=p_starts_at,ends_at=p_ends_at where id=p_id;
    v_id:=p_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
    values(auth.uid(),case when p_active then 'banner.updated' else 'banner.disabled' end,'banner',v_id::text,v_old,
      jsonb_build_object('title',trim(p_title),'active',p_active,'imageUrl',trim(p_image_url),'sortOrder',p_sort_order));
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_set_brand_asset(p_kind text,p_path text)
returns text
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_old text;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_kind not in('logo','favicon') or nullif(trim(p_path),'') is null then raise exception 'INVALID_BRAND_ASSET'; end if;
  select id,case when p_kind='logo' then logo_url else favicon_url end into v_id,v_old
    from public.site_settings order by created_at limit 1 for update;
  if v_id is null then
    insert into public.site_settings(store_name,logo_url,favicon_url)
    values('Importadora Valiente',case when p_kind='logo' then trim(p_path) end,case when p_kind='favicon' then trim(p_path) end)
    returning id into v_id;
  elsif p_kind='logo' then update public.site_settings set logo_url=trim(p_path) where id=v_id;
  else update public.site_settings set favicon_url=trim(p_path) where id=v_id;
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'site_settings.updated','site_settings',v_id::text,jsonb_build_object(p_kind,v_old),jsonb_build_object(p_kind,trim(p_path)));
  return v_old;
end;
$$;

create or replace function public.admin_delete_banner(p_id uuid)
returns text
language plpgsql security definer set search_path=''
as $$
declare v_banner public.banners%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  select * into v_banner from public.banners where id=p_id for update;
  if not found then raise exception 'BANNER_NOT_FOUND'; end if;
  if v_banner.active then raise exception 'BANNER_ACTIVE'; end if;
  delete from public.banners where id=p_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data)
  values(auth.uid(),'banner.deleted','banner',p_id::text,to_jsonb(v_banner));
  return v_banner.image_url;
end;
$$;

create or replace function public.admin_save_coupon(
  p_id uuid,p_code text,p_description text,p_discount_type text,p_discount_value numeric,
  p_minimum_order numeric,p_usage_limit integer,p_active boolean,p_starts_at timestamptz,p_ends_at timestamptz
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_old jsonb; v_code text:=upper(trim(p_code));
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if v_code !~ '^[A-Z0-9_-]{3,40}$' or p_discount_type not in('fixed','percentage') or p_discount_value<=0
    or (p_discount_type='percentage' and p_discount_value>100) or p_minimum_order<0
    or (p_usage_limit is not null and p_usage_limit<=0) then raise exception 'INVALID_COUPON'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_id is null then
    insert into public.coupons(code,description,discount_type,discount_value,minimum_order,usage_limit,active,starts_at,ends_at)
    values(v_code,nullif(trim(p_description),''),p_discount_type,p_discount_value,p_minimum_order,p_usage_limit,p_active,p_starts_at,p_ends_at)
    returning id into v_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,new_data)
    values(auth.uid(),'coupon.created','coupon',v_id::text,jsonb_build_object('code',v_code,'active',p_active,'type',p_discount_type,'value',p_discount_value));
  else
    select to_jsonb(coupon) into v_old from public.coupons coupon where id=p_id for update;
    if v_old is null then raise exception 'COUPON_NOT_FOUND'; end if;
    update public.coupons set code=v_code,description=nullif(trim(p_description),''),discount_type=p_discount_type,
      discount_value=p_discount_value,minimum_order=p_minimum_order,usage_limit=p_usage_limit,active=p_active,
      starts_at=p_starts_at,ends_at=p_ends_at where id=p_id;
    v_id:=p_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
    values(auth.uid(),case when p_active then 'coupon.updated' else 'coupon.disabled' end,'coupon',v_id::text,v_old,
      jsonb_build_object('code',v_code,'active',p_active,'type',p_discount_type,'value',p_discount_value));
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_save_shipping_method(
  p_code text,p_name text,p_description text,p_price numeric,p_instructions text,p_active boolean,p_sort_order integer
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_old jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_code not in('local_delivery','store_pickup') or nullif(trim(p_name),'') is null or p_price<0 or p_sort_order<0 then raise exception 'INVALID_SHIPPING_METHOD'; end if;
  select id,to_jsonb(method) into v_id,v_old from public.shipping_methods method where code=p_code for update;
  if v_id is null then
    insert into public.shipping_methods(code,name,description,price,instructions,active,sort_order)
    values(p_code,trim(p_name),nullif(trim(p_description),''),p_price,nullif(trim(p_instructions),''),p_active,p_sort_order) returning id into v_id;
  else
    update public.shipping_methods set name=trim(p_name),description=nullif(trim(p_description),''),price=p_price,
      instructions=nullif(trim(p_instructions),''),active=p_active,sort_order=p_sort_order where id=v_id;
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'shipping.updated','shipping_method',v_id::text,v_old,
    jsonb_build_object('code',p_code,'name',trim(p_name),'price',p_price,'active',p_active));
  return v_id;
end;
$$;

create or replace function public.validate_coupon(p_code text,p_subtotal numeric)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_coupon public.coupons%rowtype; v_uses bigint; v_discount numeric(12,2);
begin
  if auth.uid() is null then return jsonb_build_object('valid',false,'errorCode','AUTH_REQUIRED'); end if;
  if nullif(trim(p_code),'') is null then return jsonb_build_object('valid',false,'errorCode','COUPON_REQUIRED'); end if;
  select * into v_coupon from public.coupons where lower(code)=lower(trim(p_code));
  if not found then return jsonb_build_object('valid',false,'errorCode','COUPON_NOT_FOUND'); end if;
  if not v_coupon.active then return jsonb_build_object('valid',false,'errorCode','COUPON_INACTIVE'); end if;
  if v_coupon.starts_at is not null and v_coupon.starts_at>timezone('utc',now()) then return jsonb_build_object('valid',false,'errorCode','COUPON_NOT_STARTED'); end if;
  if v_coupon.ends_at is not null and v_coupon.ends_at<timezone('utc',now()) then return jsonb_build_object('valid',false,'errorCode','COUPON_EXPIRED'); end if;
  if p_subtotal<v_coupon.minimum_order then return jsonb_build_object('valid',false,'errorCode','COUPON_MINIMUM','minimumOrder',v_coupon.minimum_order); end if;
  select count(*) into v_uses from public.coupon_redemptions where coupon_id=v_coupon.id;
  if v_coupon.usage_limit is not null and v_uses>=v_coupon.usage_limit then return jsonb_build_object('valid',false,'errorCode','COUPON_LIMIT_REACHED'); end if;
  v_discount:=least(p_subtotal,case when v_coupon.discount_type='percentage' then round(p_subtotal*v_coupon.discount_value/100,2) else v_coupon.discount_value end);
  return jsonb_build_object('valid',true,'code',v_coupon.code,'discount',v_discount,'discountType',v_coupon.discount_type,'discountValue',v_coupon.discount_value);
end;
$$;

-- Sustituye la versión de Iteración 2; conserva identidad, snapshots e idempotencia.
drop function public.create_order_from_cart(uuid,text,text,uuid);
create function public.create_order_from_cart(
  p_address_id uuid,p_delivery_method text,p_payment_method text,p_checkout_token uuid,p_coupon_code text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid(); v_cart_id uuid; v_address public.addresses%rowtype;
  v_order_id uuid; v_order_number text; v_existing_number text; v_line record;
  v_expected_count integer:=0; v_line_count integer:=0; v_subtotal numeric(12,2):=0;
  v_shipping numeric(12,2); v_total numeric(12,2); v_discount numeric(12,2):=0;
  v_shipping_method public.shipping_methods%rowtype; v_coupon public.coupons%rowtype;
  v_coupon_uses bigint; v_currency char(3):='GTQ';
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_checkout_token is null then raise exception 'INVALID_CHECKOUT_TOKEN'; end if;
  select order_number into v_existing_number from public.orders where profile_id=v_user_id and checkout_token=p_checkout_token;
  if v_existing_number is not null then return jsonb_build_object('orderNumber',v_existing_number,'alreadyCreated',true); end if;
  select * into v_address from public.addresses where id=p_address_id and profile_id=v_user_id;
  if not found then raise exception 'ADDRESS_NOT_FOUND'; end if;
  select * into v_shipping_method from public.shipping_methods where code=p_delivery_method and active for share;
  if not found then raise exception 'INVALID_DELIVERY_METHOD'; end if;
  v_shipping:=v_shipping_method.price;
  if p_payment_method<>'pending_gateway' then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  select id into v_cart_id from public.carts where profile_id=v_user_id and status='active' for update;
  if v_cart_id is null then raise exception 'EMPTY_CART'; end if;
  select count(*) into v_expected_count from public.cart_items where cart_id=v_cart_id;
  if v_expected_count=0 then raise exception 'EMPTY_CART'; end if;
  for v_line in select item.variant_id,item.quantity,variant.sku,variant.variant_name,variant.price,
      variant.active as variant_active,product.name as product_name,product.active as product_active,stock.quantity as stock_quantity
    from public.cart_items item join public.product_variants variant on variant.id=item.variant_id
    join public.products product on product.id=variant.product_id join public.inventory stock on stock.variant_id=variant.id
    where item.cart_id=v_cart_id for update of item,product,variant,stock
  loop
    v_line_count:=v_line_count+1;
    if not v_line.product_active then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if not v_line.variant_active then raise exception 'VARIANT_UNAVAILABLE'; end if;
    if v_line.quantity<1 then raise exception 'INVALID_QUANTITY'; end if;
    if v_line.stock_quantity is null or v_line.quantity>v_line.stock_quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
    v_subtotal:=v_subtotal+(v_line.price*v_line.quantity);
  end loop;
  if v_line_count<>v_expected_count then raise exception 'VARIANT_UNAVAILABLE'; end if;
  if nullif(trim(p_coupon_code),'') is not null then
    select * into v_coupon from public.coupons where lower(code)=lower(trim(p_coupon_code)) for update;
    if not found then raise exception 'COUPON_NOT_FOUND'; end if;
    if not v_coupon.active then raise exception 'COUPON_INACTIVE'; end if;
    if v_coupon.starts_at is not null and v_coupon.starts_at>timezone('utc',now()) then raise exception 'COUPON_NOT_STARTED'; end if;
    if v_coupon.ends_at is not null and v_coupon.ends_at<timezone('utc',now()) then raise exception 'COUPON_EXPIRED'; end if;
    if v_subtotal<v_coupon.minimum_order then raise exception 'COUPON_MINIMUM'; end if;
    select count(*) into v_coupon_uses from public.coupon_redemptions where coupon_id=v_coupon.id;
    if v_coupon.usage_limit is not null and v_coupon_uses>=v_coupon.usage_limit then raise exception 'COUPON_LIMIT_REACHED'; end if;
    v_discount:=least(v_subtotal,case when v_coupon.discount_type='percentage' then round(v_subtotal*v_coupon.discount_value/100,2) else v_coupon.discount_value end);
  end if;
  select coalesce((select currency from public.site_settings order by created_at limit 1),'GTQ') into v_currency;
  v_total:=greatest(0,v_subtotal-v_discount)+v_shipping;
  loop
    v_order_number:='IV-'||to_char(timezone('utc',now()),'YYYY')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0');
    exit when not exists(select 1 from public.orders where order_number=v_order_number);
  end loop;
  begin
    insert into public.orders(profile_id,order_number,status,payment_status,subtotal,discount,shipping_total,total,currency,
      shipping_address,delivery_method,payment_method,checkout_token)
    values(v_user_id,v_order_number,'pending','pending',v_subtotal,v_discount,v_shipping,v_total,v_currency,
      to_jsonb(v_address)-'id'-'profile_id'-'created_at'-'updated_at',p_delivery_method,p_payment_method,p_checkout_token)
    returning id into v_order_id;
  exception when unique_violation then
    select order_number into v_existing_number from public.orders where profile_id=v_user_id and checkout_token=p_checkout_token;
    if v_existing_number is not null then return jsonb_build_object('orderNumber',v_existing_number,'alreadyCreated',true); end if;
    raise;
  end;
  insert into public.order_items(order_id,variant_id,sku_snapshot,name_snapshot,variant_name_snapshot,unit_price,quantity,line_total)
    select v_order_id,variant.id,variant.sku,product.name,variant.variant_name,variant.price,item.quantity,variant.price*item.quantity
    from public.cart_items item join public.product_variants variant on variant.id=item.variant_id
    join public.products product on product.id=variant.product_id where item.cart_id=v_cart_id;
  insert into public.shipments(order_id,status,delivery_method,shipping_cost,notes)
    values(v_order_id,'pending',p_delivery_method,v_shipping,v_shipping_method.instructions);
  if v_coupon.id is not null then
    insert into public.coupon_redemptions(coupon_id,profile_id,order_id,amount_discounted)
    values(v_coupon.id,v_user_id,v_order_id,v_discount);
  end if;
  update public.carts set status='converted' where id=v_cart_id;
  return jsonb_build_object('orderNumber',v_order_number,'orderId',v_order_id,'alreadyCreated',false,
    'couponCode',v_coupon.code,'discount',v_discount);
end;
$$;

revoke all on function public.admin_save_site_settings(text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon;
revoke all on function public.admin_save_banner(uuid,text,text,text,text,text,integer,boolean,timestamptz,timestamptz) from public,anon;
revoke all on function public.admin_set_brand_asset(text,text) from public,anon;
revoke all on function public.admin_delete_banner(uuid) from public,anon;
revoke all on function public.admin_save_coupon(uuid,text,text,text,numeric,numeric,integer,boolean,timestamptz,timestamptz) from public,anon;
revoke all on function public.admin_save_shipping_method(text,text,text,numeric,text,boolean,integer) from public,anon;
revoke all on function public.validate_coupon(text,numeric) from public,anon;
revoke all on function public.create_order_from_cart(uuid,text,text,uuid,text) from public,anon;
grant execute on function public.admin_save_site_settings(text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.admin_save_banner(uuid,text,text,text,text,text,integer,boolean,timestamptz,timestamptz) to authenticated;
grant execute on function public.admin_set_brand_asset(text,text) to authenticated;
grant execute on function public.admin_delete_banner(uuid) to authenticated;
grant execute on function public.admin_save_coupon(uuid,text,text,text,numeric,numeric,integer,boolean,timestamptz,timestamptz) to authenticated;
grant execute on function public.admin_save_shipping_method(text,text,text,numeric,text,boolean,integer) to authenticated;
grant execute on function public.validate_coupon(text,numeric) to authenticated;
grant execute on function public.create_order_from_cart(uuid,text,text,uuid,text) to authenticated;
