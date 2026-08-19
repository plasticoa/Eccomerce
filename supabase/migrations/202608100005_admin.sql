-- Iteración 4 · Administración
-- Operaciones críticas atómicas, métricas, auditoría y permisos por rol.

create index if not exists orders_status_created_at_idx
  on public.orders(status, created_at desc);
create index if not exists orders_payment_status_created_at_idx
  on public.orders(payment_status, created_at desc);
create index if not exists inventory_quantity_idx
  on public.inventory(quantity);
create index if not exists inventory_movements_created_at_idx
  on public.inventory_movements(created_at desc);
create index if not exists profiles_role_created_at_idx
  on public.profiles(role, created_at desc);

-- La excepción solo puede habilitarse dentro de la función confiable de roles.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and coalesce(current_setting('app.role_change_authorized', true), '') <> 'true' then
    raise exception 'profile role can only be changed by a trusted backend';
  end if;
  return new;
end;
$$;

-- El operador consulta datos operativos pero no muta catálogo, stock, roles ni pagos.
drop policy if exists profiles_internal_all on public.profiles;
drop policy if exists addresses_internal_all on public.addresses;
drop policy if exists categories_internal_all on public.categories;
drop policy if exists products_internal_all on public.products;
drop policy if exists product_categories_internal_all on public.product_categories;
drop policy if exists variants_internal_all on public.product_variants;
drop policy if exists product_images_internal_all on public.product_images;
drop policy if exists inventory_internal_all on public.inventory;
drop policy if exists inventory_movements_internal_all on public.inventory_movements;
drop policy if exists carts_internal_all on public.carts;
drop policy if exists cart_items_internal_all on public.cart_items;
drop policy if exists orders_internal_all on public.orders;
drop policy if exists order_items_internal_all on public.order_items;
drop policy if exists shipments_internal_all on public.shipments;
drop policy if exists coupons_internal_all on public.coupons;
drop policy if exists redemptions_internal_all on public.coupon_redemptions;
drop policy if exists site_settings_internal_all on public.site_settings;
drop policy if exists banners_internal_all on public.banners;

create policy profiles_internal_read on public.profiles for select to authenticated using (public.is_internal_user());
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy addresses_internal_read on public.addresses for select to authenticated using (public.is_internal_user());
create policy categories_internal_read on public.categories for select to authenticated using (public.is_internal_user());
create policy categories_admin_write on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_internal_read on public.products for select to authenticated using (public.is_internal_user());
create policy products_admin_write on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy product_categories_internal_read on public.product_categories for select to authenticated using (public.is_internal_user());
create policy product_categories_admin_write on public.product_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy variants_internal_read on public.product_variants for select to authenticated using (public.is_internal_user());
create policy variants_admin_write on public.product_variants for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy product_images_internal_read on public.product_images for select to authenticated using (public.is_internal_user());
create policy product_images_admin_write on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy inventory_internal_read on public.inventory for select to authenticated using (public.is_internal_user());
create policy inventory_admin_write on public.inventory for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy inventory_movements_internal_read on public.inventory_movements for select to authenticated using (public.is_internal_user());
create policy inventory_movements_admin_write on public.inventory_movements for insert to authenticated with check (public.is_admin());
create policy carts_admin_all on public.carts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy cart_items_admin_all on public.cart_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy orders_internal_read on public.orders for select to authenticated using (public.is_internal_user());
create policy order_items_internal_read on public.order_items for select to authenticated using (public.is_internal_user());
create policy shipments_internal_read on public.shipments for select to authenticated using (public.is_internal_user());
create policy shipments_admin_write on public.shipments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy coupons_admin_all on public.coupons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy redemptions_admin_all on public.coupon_redemptions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy site_settings_admin_all on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy banners_admin_all on public.banners for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists internal_assets_insert on storage.objects;
drop policy if exists internal_assets_update on storage.objects;
drop policy if exists internal_assets_delete on storage.objects;
create policy admin_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('products','branding','banners') and public.is_admin());
create policy admin_assets_update on storage.objects for update to authenticated
  using (bucket_id in ('products','branding','banners') and public.is_admin())
  with check (bucket_id in ('products','branding','banners') and public.is_admin());
create policy admin_assets_delete on storage.objects for delete to authenticated
  using (bucket_id in ('products','branding','banners') and public.is_admin());

-- Las escrituras críticas solo pasan por RPCs; se revocan mutaciones directas.
revoke insert, update, delete on public.inventory, public.inventory_movements,
  public.orders, public.order_items, public.payments, public.audit_logs from authenticated;
revoke update (role) on public.profiles from authenticated;

create or replace function public.admin_dashboard_metrics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
  v_sales numeric;
  v_orders bigint;
  v_paid_orders bigint;
begin
  if not public.is_internal_user() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_days not in (1, 7, 30) then raise exception 'INVALID_PERIOD'; end if;
  v_since := timezone('utc', now()) - make_interval(days => p_days);

  select coalesce(sum(total) filter (where payment_status in ('approved','paid')), 0), count(*),
    count(*) filter (where payment_status in ('approved','paid'))
    into v_sales, v_orders, v_paid_orders from public.orders where created_at >= v_since;

  return jsonb_build_object(
    'sales', v_sales,
    'orders', v_orders,
    'averageTicket', case when v_paid_orders = 0 then 0 else v_sales / v_paid_orders end,
    'pendingOrders', (select count(*) from public.orders where created_at >= v_since and status in ('pending','confirmed','processing')),
    'lowStock', (select count(*) from public.inventory where quantity <= low_stock_threshold),
    'lowStockItems', coalesce((select jsonb_agg(to_jsonb(stock_row)) from (
      select stock.variant_id as "variantId", stock.quantity, stock.low_stock_threshold as "lowStockThreshold",
        variant.sku, variant.variant_name as "variantName", product.id as "productId", product.name as "productName"
      from public.inventory stock
      join public.product_variants variant on variant.id=stock.variant_id
      join public.products product on product.id=variant.product_id
      where stock.quantity <= stock.low_stock_threshold
      order by stock.quantity-stock.low_stock_threshold, product.name limit 8
    ) stock_row), '[]'::jsonb),
    'topProducts', coalesce((select jsonb_agg(to_jsonb(top_row)) from (
      select item.name_snapshot as name, item.sku_snapshot as sku, sum(item.quantity)::bigint as quantity
      from public.order_items item join public.orders sales_order on sales_order.id=item.order_id
      where sales_order.created_at >= v_since and sales_order.payment_status in ('approved','paid')
      group by item.name_snapshot,item.sku_snapshot order by sum(item.quantity) desc,item.name_snapshot limit 5
    ) top_row), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_inventory_page(
  p_search text default null, p_low_only boolean default false, p_product_id uuid default null,
  p_limit integer default 20, p_offset integer default 0
)
returns table(
  variant_id uuid, product_id uuid, product_name text, sku text, variant_name text,
  active boolean, quantity integer, low_stock_threshold integer, updated_at timestamptz, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select stock.variant_id, product.id, product.name, variant.sku, variant.variant_name,
    variant.active, stock.quantity, stock.low_stock_threshold, stock.updated_at, count(*) over()
  from public.inventory stock
  join public.product_variants variant on variant.id=stock.variant_id
  join public.products product on product.id=variant.product_id
  where public.is_internal_user()
    and (p_search is null or product.name ilike '%'||p_search||'%' or variant.sku ilike '%'||p_search||'%' or variant.variant_name ilike '%'||p_search||'%')
    and (not p_low_only or stock.quantity <= stock.low_stock_threshold)
    and (p_product_id is null or product.id=p_product_id)
  order by (stock.quantity <= stock.low_stock_threshold) desc, stock.updated_at desc
  limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
$$;

create or replace function public.admin_create_product(
  p_name text, p_slug text, p_description text, p_active boolean,
  p_category_id uuid, p_sku text, p_variant_name text,
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
     or p_price < 0 or p_stock < 0 or p_low_stock_threshold < 0
     or (p_compare_at_price is not null and p_compare_at_price < p_price) then
    raise exception 'INVALID_PRODUCT';
  end if;

  insert into public.products(name, slug, description, active)
  values (trim(p_name), lower(trim(p_slug)), nullif(trim(p_description), ''), p_active)
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
    jsonb_build_object('name', trim(p_name), 'sku', upper(trim(p_sku)), 'price', p_price, 'active', p_active));
  return v_product_id;
end;
$$;

create or replace function public.admin_upsert_variant(
  p_product_id uuid, p_variant_id uuid, p_sku text, p_variant_name text,
  p_price numeric, p_compare_at_price numeric, p_active boolean,
  p_low_stock_threshold integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_old public.product_variants%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if nullif(trim(p_sku), '') is null or nullif(trim(p_variant_name), '') is null
     or p_price < 0 or p_low_stock_threshold < 0
     or (p_compare_at_price is not null and p_compare_at_price < p_price) then
    raise exception 'INVALID_VARIANT';
  end if;
  if not exists(select 1 from public.products where id = p_product_id) then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if p_variant_id is null then
    insert into public.product_variants(product_id, sku, variant_name, price, compare_at_price, active)
    values (p_product_id, upper(trim(p_sku)), trim(p_variant_name), p_price, p_compare_at_price, p_active)
    returning id into v_id;
    insert into public.inventory(variant_id, quantity, low_stock_threshold) values (v_id, 0, p_low_stock_threshold);
  else
    select * into v_old from public.product_variants where id = p_variant_id and product_id = p_product_id for update;
    if not found then raise exception 'VARIANT_NOT_FOUND'; end if;
    update public.product_variants set sku=upper(trim(p_sku)), variant_name=trim(p_variant_name),
      price=p_price, compare_at_price=p_compare_at_price, active=p_active where id=p_variant_id;
    update public.inventory set low_stock_threshold=p_low_stock_threshold where variant_id=p_variant_id;
    v_id := p_variant_id;
  end if;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), case when p_variant_id is null then 'variant.created' else 'variant.updated' end,
    'variant', v_id::text,
    case when p_variant_id is null then null else jsonb_build_object('sku',v_old.sku,'price',v_old.price,'active',v_old.active) end,
    jsonb_build_object('sku',upper(trim(p_sku)),'price',p_price,'active',p_active));
  return v_id;
end;
$$;

create or replace function public.admin_update_product(
  p_product_id uuid, p_name text, p_slug text, p_description text,
  p_active boolean, p_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_old public.products%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_slug),'') is null then raise exception 'INVALID_PRODUCT'; end if;
  select * into v_old from public.products where id=p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  update public.products set name=trim(p_name),slug=lower(trim(p_slug)),description=nullif(trim(p_description),''),active=p_active where id=p_product_id;
  delete from public.product_categories where product_id=p_product_id;
  if p_category_id is not null then insert into public.product_categories(product_id,category_id) values(p_product_id,p_category_id); end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'product.updated','product',p_product_id::text,
    jsonb_build_object('name',v_old.name,'slug',v_old.slug,'active',v_old.active),
    jsonb_build_object('name',trim(p_name),'slug',lower(trim(p_slug)),'active',p_active));
  return p_product_id;
end;
$$;

create or replace function public.admin_adjust_inventory(
  p_variant_id uuid, p_quantity integer, p_movement_type text, p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_current integer; v_delta integer; v_new integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_quantity <= 0 or p_movement_type not in ('in','out','adjustment') or nullif(trim(p_reason),'') is null then
    raise exception 'INVALID_INVENTORY_ADJUSTMENT';
  end if;
  select quantity into v_current from public.inventory where variant_id=p_variant_id for update;
  if not found then raise exception 'INVENTORY_NOT_FOUND'; end if;
  v_delta := case when p_movement_type='out' then -p_quantity else p_quantity end;
  v_new := v_current + v_delta;
  if v_new < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  update public.inventory set quantity=v_new where variant_id=p_variant_id;
  insert into public.inventory_movements(variant_id,quantity,movement_type,reason,user_id,reference_type)
  values(p_variant_id,v_delta,p_movement_type,trim(p_reason),auth.uid(),'admin_adjustment');
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'inventory.adjusted','variant',p_variant_id::text,
    jsonb_build_object('quantity',v_current),jsonb_build_object('quantity',v_new,'delta',v_delta,'reason',trim(p_reason)));
  return v_new;
end;
$$;

create or replace function public.admin_change_order_status(p_order_id uuid, p_next_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_old text;
begin
  if not public.is_internal_user() then raise exception 'ADMIN_FORBIDDEN'; end if;
  select status into v_old from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not ((v_old='pending' and p_next_status='cancelled')
    or (v_old='confirmed' and p_next_status='processing')
    or (v_old='processing' and p_next_status='shipped')
    or (v_old='shipped' and p_next_status='delivered')) then
    raise exception 'INVALID_ORDER_TRANSITION';
  end if;
  update public.orders set status=p_next_status where id=p_order_id and status=v_old;
  if not found then raise exception 'ORDER_CONCURRENTLY_CHANGED'; end if;
  if p_next_status='shipped' then
    update public.shipments set status='shipped',shipped_at=coalesce(shipped_at,timezone('utc',now())) where order_id=p_order_id and status in ('pending','ready');
  elsif p_next_status='delivered' then
    update public.shipments set status='delivered',delivered_at=coalesce(delivered_at,timezone('utc',now())) where order_id=p_order_id and status='shipped';
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'order.status_changed','order',p_order_id::text,
    jsonb_build_object('status',v_old),jsonb_build_object('status',p_next_status));
  return p_next_status;
end;
$$;

create or replace function public.admin_change_user_role(p_profile_id uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_old text; v_admins bigint;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_role not in ('customer','operator','admin') then raise exception 'INVALID_ROLE'; end if;
  -- Serializa promociones/degradaciones para que dos admins no puedan eliminar
  -- simultáneamente el último acceso administrativo.
  perform pg_advisory_xact_lock(2147483001);
  select role into v_old from public.profiles where id=p_profile_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_old='admin' and p_role<>'admin' then
    select count(*) into v_admins from public.profiles where role='admin';
    if v_admins <= 1 then raise exception 'LAST_ADMIN'; end if;
  end if;
  perform set_config('app.role_change_authorized','true',true);
  update public.profiles set role=p_role where id=p_profile_id;
  perform set_config('app.role_change_authorized','false',true);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'profile.role_changed','profile',p_profile_id::text,
    jsonb_build_object('role',v_old),jsonb_build_object('role',p_role));
  return p_role;
end;
$$;

create or replace function public.admin_update_shipment(
  p_order_id uuid, p_status text, p_carrier text, p_tracking_number text,
  p_estimated_at timestamptz, p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_old jsonb; v_old_status text;
begin
  if not public.is_internal_user() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_status not in ('pending','ready','shipped','delivered','returned') then raise exception 'INVALID_SHIPMENT_STATUS'; end if;
  select id,status,jsonb_build_object('status',status,'carrier',carrier,'trackingNumber',tracking_number)
    into v_id,v_old_status,v_old from public.shipments where order_id=p_order_id for update;
  if not found then raise exception 'SHIPMENT_NOT_FOUND'; end if;
  if p_status<>v_old_status and not ((v_old_status='pending' and p_status in ('ready','shipped'))
    or (v_old_status='ready' and p_status='shipped')
    or (v_old_status='shipped' and p_status in ('delivered','returned'))) then
    raise exception 'INVALID_SHIPMENT_TRANSITION';
  end if;
  if p_status='shipped' and not exists(select 1 from public.orders where id=p_order_id and status in ('shipped','delivered')) then
    raise exception 'ORDER_NOT_SHIPPED';
  end if;
  if p_status='delivered' and not exists(select 1 from public.orders where id=p_order_id and status='delivered') then
    raise exception 'ORDER_NOT_DELIVERED';
  end if;
  update public.shipments set status=p_status, carrier=nullif(trim(p_carrier),''),
    tracking_number=nullif(trim(p_tracking_number),''), estimated_at=p_estimated_at,
    notes=nullif(trim(p_notes),''),
    shipped_at=case when p_status='shipped' then coalesce(shipped_at,timezone('utc',now())) else shipped_at end,
    delivered_at=case when p_status='delivered' then coalesce(delivered_at,timezone('utc',now())) else delivered_at end
    where id=v_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'shipment.updated','shipment',v_id::text,v_old,
    jsonb_build_object('status',p_status,'carrier',nullif(trim(p_carrier),''),'trackingNumber',nullif(trim(p_tracking_number),'')));
  return v_id;
end;
$$;

revoke all on function public.admin_dashboard_metrics(integer) from public, anon;
revoke all on function public.admin_inventory_page(text,boolean,uuid,integer,integer) from public, anon;
revoke all on function public.admin_create_product(text,text,text,boolean,uuid,text,text,numeric,numeric,integer,integer,boolean) from public, anon;
revoke all on function public.admin_upsert_variant(uuid,uuid,text,text,numeric,numeric,boolean,integer) from public, anon;
revoke all on function public.admin_update_product(uuid,text,text,text,boolean,uuid) from public, anon;
revoke all on function public.admin_adjust_inventory(uuid,integer,text,text) from public, anon;
revoke all on function public.admin_change_order_status(uuid,text) from public, anon;
revoke all on function public.admin_change_user_role(uuid,text) from public, anon;
revoke all on function public.admin_update_shipment(uuid,text,text,text,timestamptz,text) from public, anon;
grant execute on function public.admin_dashboard_metrics(integer) to authenticated;
grant execute on function public.admin_inventory_page(text,boolean,uuid,integer,integer) to authenticated;
grant execute on function public.admin_create_product(text,text,text,boolean,uuid,text,text,numeric,numeric,integer,integer,boolean) to authenticated;
grant execute on function public.admin_upsert_variant(uuid,uuid,text,text,numeric,numeric,boolean,integer) to authenticated;
grant execute on function public.admin_update_product(uuid,text,text,text,boolean,uuid) to authenticated;
grant execute on function public.admin_adjust_inventory(uuid,integer,text,text) to authenticated;
grant execute on function public.admin_change_order_status(uuid,text) to authenticated;
grant execute on function public.admin_change_user_role(uuid,text) to authenticated;
grant execute on function public.admin_update_shipment(uuid,text,text,text,timestamptz,text) to authenticated;
