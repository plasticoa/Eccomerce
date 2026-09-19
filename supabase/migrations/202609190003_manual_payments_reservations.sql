-- Manual payments: preserve historical orders without guessing their inventory state.
begin;
alter table public.inventory add column reserved_quantity integer not null default 0
  check (reserved_quantity >= 0 and reserved_quantity <= quantity);
alter table public.orders add column inventory_status text not null default 'legacy'
  check (inventory_status in ('legacy','reserved','committed','released'));
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check(payment_method in ('pending_gateway','cash_on_delivery','in_person'));
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check(status in ('pending','confirmed','payment_review','processing','ready','shipped','delivered','cancelled'));
alter table public.payments add column method text check(method in ('cash_on_delivery','in_person')),
  add column reference text, add column notes text,
  add column recorded_by uuid references public.profiles(id) on delete set null;
create unique index payments_one_manual_per_order on public.payments(order_id) where provider='manual';
alter table public.inventory_movements drop constraint inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check check(movement_type in ('in','out','adjustment','reservation','release'));
create unique index inventory_one_reservation_event on public.inventory_movements(reference_id,variant_id,movement_type)
  where reference_type='order' and movement_type in ('reservation','release');
-- Retire executable gateway paths; keep historical payments/events.
drop function public.create_payment_attempt(text,text,uuid);
drop function public.set_payment_provider_reference(uuid,text,text);
drop function public.process_payment_webhook(text,text,text,text,text,text,numeric,text,jsonb);

create or replace function public.cart_add_item(p_variant_id uuid, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cart_id uuid;
  v_stock integer;
  v_existing integer := 0;
  v_final integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select (stock.quantity - stock.reserved_quantity) into v_stock
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  join public.inventory stock on stock.variant_id = variant.id
  where variant.id = p_variant_id and variant.active and product.active
  for update of product, variant, stock;

  if v_stock is null or v_stock < 1 then raise exception 'VARIANT_UNAVAILABLE'; end if;
  v_cart_id := public.ensure_active_cart(v_user_id);

  select quantity into v_existing
  from public.cart_items
  where cart_id = v_cart_id and variant_id = p_variant_id
  for update;
  v_existing := coalesce(v_existing, 0);
  v_final := v_existing + p_quantity;
  if v_final > v_stock then raise exception 'INSUFFICIENT_STOCK'; end if;

  insert into public.cart_items(cart_id, variant_id, quantity)
  values (v_cart_id, p_variant_id, v_final)
  on conflict (cart_id, variant_id)
  do update set quantity = excluded.quantity, updated_at = timezone('utc', now());

  return jsonb_build_object('cartId', v_cart_id, 'quantity', v_final);
end;
$$;

create or replace function public.cart_set_quantity(p_variant_id uuid, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cart_id uuid;
  v_stock integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select id into v_cart_id from public.carts
  where profile_id = v_user_id and status = 'active' for update;
  if v_cart_id is null then raise exception 'CART_ITEM_NOT_FOUND'; end if;

  select (stock.quantity - stock.reserved_quantity) into v_stock
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  join public.inventory stock on stock.variant_id = variant.id
  where variant.id = p_variant_id and variant.active and product.active
  for update of product, variant, stock;
  if v_stock is null or v_stock < 1 then raise exception 'VARIANT_UNAVAILABLE'; end if;
  if p_quantity > v_stock then raise exception 'INSUFFICIENT_STOCK'; end if;

  update public.cart_items set quantity = p_quantity
  where cart_id = v_cart_id and variant_id = p_variant_id;
  if not found then raise exception 'CART_ITEM_NOT_FOUND'; end if;
  return jsonb_build_object('cartId', v_cart_id, 'quantity', p_quantity);
end;
$$;

create or replace function public.reconcile_active_cart()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.cart_items item
  set quantity = (stock.quantity - stock.reserved_quantity), updated_at = timezone('utc', now())
  from public.carts cart, public.product_variants variant, public.products product, public.inventory stock
  where item.cart_id = cart.id
    and item.variant_id = variant.id
    and variant.product_id = product.id
    and stock.variant_id = variant.id
    and cart.profile_id = v_user_id
    and cart.status = 'active'
    and product.active and variant.active
    and (stock.quantity - stock.reserved_quantity) > 0
    and item.quantity > (stock.quantity - stock.reserved_quantity);
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.merge_guest_cart(p_items jsonb, p_merge_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cart_id uuid;
  v_item record;
  v_stock integer;
  v_existing integer;
  v_final integer;
  v_limited integer := 0;
  v_skipped integer := 0;
  v_merged integer := 0;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_merge_token is null then raise exception 'INVALID_MERGE_TOKEN'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_MERGE_ITEMS';
  end if;

  v_cart_id := public.ensure_active_cart(v_user_id);
  if exists (select 1 from public.carts where id = v_cart_id and last_merge_token = p_merge_token) then
    return jsonb_build_object('cartId', v_cart_id, 'alreadyMerged', true, 'mergedItems', 0, 'limitedItems', 0, 'skippedItems', 0);
  end if;

  for v_item in
    select (entry->>'variantId')::uuid as variant_id,
           sum((entry->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) entry
    group by (entry->>'variantId')::uuid
  loop
    if v_item.quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;
    select (stock.quantity - stock.reserved_quantity) into v_stock
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    join public.inventory stock on stock.variant_id = variant.id
    where variant.id = v_item.variant_id and variant.active and product.active
    for update of product, variant, stock;

    if v_stock is null or v_stock < 1 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select quantity into v_existing from public.cart_items
    where cart_id = v_cart_id and variant_id = v_item.variant_id for update;
    v_existing := coalesce(v_existing, 0);
    v_final := least(v_stock, v_existing + v_item.quantity);
    if v_final < v_existing + v_item.quantity then v_limited := v_limited + 1; end if;

    insert into public.cart_items(cart_id, variant_id, quantity)
    values (v_cart_id, v_item.variant_id, v_final)
    on conflict (cart_id, variant_id)
    do update set quantity = excluded.quantity, updated_at = timezone('utc', now());
    v_merged := v_merged + 1;
  end loop;

  update public.carts set last_merge_token = p_merge_token where id = v_cart_id;
  return jsonb_build_object('cartId', v_cart_id, 'alreadyMerged', false, 'mergedItems', v_merged, 'limitedItems', v_limited, 'skippedItems', v_skipped);
end;
$$;

create or replace function public.catalog_product_page(
  search_term text default null,
  category_slug text default null,
  min_price numeric default null,
  max_price numeric default null,
  available_only boolean default false,
  page_limit integer default 12,
  page_offset integer default 0
)
returns table (product_id uuid, total_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with eligible as (
    select product.id, product.created_at
    from public.products product
    where product.active
      and exists (
        select 1
        from public.product_variants variant
        where variant.product_id = product.id and variant.active
      )
      and (
        nullif(trim(search_term), '') is null
        or product.name ilike '%' || trim(search_term) || '%'
        or exists (
          select 1
          from public.product_variants variant
          where variant.product_id = product.id
            and variant.active
            and variant.sku ilike '%' || trim(search_term) || '%'
        )
      )
      and (
        nullif(trim(category_slug), '') is null
        or exists (
          select 1
          from public.product_categories relation
          join public.categories category on category.id = relation.category_id
          where relation.product_id = product.id
            and category.active
            and category.slug = trim(category_slug)
        )
      )
      and exists (
        select 1
        from public.product_variants variant
        where variant.product_id = product.id
          and variant.active
          and (min_price is null or variant.price >= min_price)
          and (max_price is null or variant.price <= max_price)
      )
      and (
        not coalesce(available_only, false)
        or exists (
          select 1
          from public.product_variants variant
          join public.inventory stock on stock.variant_id = variant.id
          where variant.product_id = product.id
            and variant.active
            and (stock.quantity - stock.reserved_quantity) > 0
        )
      )
  )
  select eligible.id, count(*) over ()
  from eligible
  order by eligible.created_at desc, eligible.id
  limit least(greatest(coalesce(page_limit, 12), 1), 24)
  offset greatest(coalesce(page_offset, 0), 0);
$$;

create or replace function public.create_order_from_cart(
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
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select order_number into v_existing_number from public.orders where profile_id=v_user_id and checkout_token=p_checkout_token;
  if v_existing_number is not null then return jsonb_build_object('orderNumber',v_existing_number,'alreadyCreated',true); end if;
  select * into v_address from public.addresses where id=p_address_id and profile_id=v_user_id;
  if not found then raise exception 'ADDRESS_NOT_FOUND'; end if;
  select * into v_shipping_method from public.shipping_methods where code=p_delivery_method and active for share;
  if not found then raise exception 'INVALID_DELIVERY_METHOD'; end if;
  v_shipping:=v_shipping_method.price;
  if p_payment_method is null or p_payment_method not in ('cash_on_delivery','in_person') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  select id into v_cart_id from public.carts where profile_id=v_user_id and status='active' for update;
  if v_cart_id is null then raise exception 'EMPTY_CART'; end if;
  select count(*) into v_expected_count from public.cart_items where cart_id=v_cart_id;
  if v_expected_count=0 then raise exception 'EMPTY_CART'; end if;
  for v_line in select item.variant_id,item.quantity,variant.sku,variant.variant_name,variant.price,
      variant.active as variant_active,product.name as product_name,product.active as product_active,(stock.quantity-stock.reserved_quantity) as stock_quantity
    from public.cart_items item join public.product_variants variant on variant.id=item.variant_id
    join public.products product on product.id=variant.product_id join public.inventory stock on stock.variant_id=variant.id
    where item.cart_id=v_cart_id order by item.variant_id for update of item,product,variant,stock
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
  update public.orders set inventory_status='reserved' where id=v_order_id;
  for v_line in select variant_id,quantity from public.order_items where order_id=v_order_id order by variant_id loop
    update public.inventory set reserved_quantity=reserved_quantity+v_line.quantity
      where variant_id=v_line.variant_id and quantity-reserved_quantity>=v_line.quantity;
    if not found then raise exception 'INSUFFICIENT_STOCK'; end if;
    insert into public.inventory_movements(variant_id,quantity,movement_type,reason,user_id,reference_type,reference_id)
      values(v_line.variant_id,v_line.quantity,'reservation','Pedido confirmado por cliente',v_user_id,'order',v_order_id);
  end loop;
  insert into public.payments(order_id,provider,method,status,amount,currency)
    values(v_order_id,'manual',p_payment_method,'pending',v_total,v_currency);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_data)
    values(v_user_id,'order.created_and_reserved','order',v_order_id::text,jsonb_build_object('inventory_status','reserved','total',v_total));
  update public.carts set status='converted' where id=v_cart_id;
  return jsonb_build_object('orderNumber',v_order_number,'orderId',v_order_id,'alreadyCreated',false,
    'couponCode',v_coupon.code,'discount',v_discount);
end;
$$;

drop function public.admin_inventory_page(text,boolean,uuid,integer,integer);
create or replace function public.admin_inventory_page(
  p_search text default null, p_low_only boolean default false, p_product_id uuid default null,
  p_limit integer default 20, p_offset integer default 0
)
returns table(
  variant_id uuid, product_id uuid, product_name text, sku text, variant_name text,
  active boolean, quantity integer, low_stock_threshold integer, updated_at timestamptz, total_count bigint, reserved_quantity integer, available_quantity integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select stock.variant_id, product.id, product.name, variant.sku, variant.variant_name,
    variant.active, stock.quantity, stock.low_stock_threshold, stock.updated_at, count(*) over(), stock.reserved_quantity, stock.quantity-stock.reserved_quantity
  from public.inventory stock
  join public.product_variants variant on variant.id=stock.variant_id
  join public.products product on product.id=variant.product_id
  where public.is_internal_user()
    and (p_search is null or product.name ilike '%'||p_search||'%' or variant.sku ilike '%'||p_search||'%' or variant.variant_name ilike '%'||p_search||'%')
    and (not p_low_only or stock.quantity-stock.reserved_quantity <= stock.low_stock_threshold)
    and (p_product_id is null or product.id=p_product_id)
  order by (stock.quantity-stock.reserved_quantity <= stock.low_stock_threshold) desc, stock.updated_at desc
  limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
$$;
revoke all on function public.admin_inventory_page(text,boolean,uuid,integer,integer) from public,anon;
grant execute on function public.admin_inventory_page(text,boolean,uuid,integer,integer) to authenticated;

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
  if v_new < (select reserved_quantity from public.inventory where variant_id=p_variant_id) then raise exception 'INSUFFICIENT_STOCK'; end if;
  update public.inventory set quantity=v_new where variant_id=p_variant_id;
  insert into public.inventory_movements(variant_id,quantity,movement_type,reason,user_id,reference_type)
  values(p_variant_id,v_delta,p_movement_type,trim(p_reason),auth.uid(),'admin_adjustment');
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),'inventory.adjusted','variant',p_variant_id::text,
    jsonb_build_object('quantity',v_current),jsonb_build_object('quantity',v_new,'delta',v_delta,'reason',trim(p_reason)));
  return v_new;
end;
$$;

-- Order lock serializes payment, cancellation and status changes.
create or replace function public.admin_record_payment(p_order_id uuid,p_amount numeric,p_reference text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_line record;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_status in ('approved','paid') then
    return jsonb_build_object('alreadyPaid',true);
  end if;
  if v_order.status='cancelled' then raise exception 'ORDER_CANCELLED'; end if;
  if v_order.inventory_status<>'reserved' then raise exception 'LEGACY_ORDER_REQUIRES_REVIEW'; end if;
  if p_amount is null or p_amount <> v_order.total then raise exception 'AMOUNT_MISMATCH'; end if;
  if length(coalesce(p_reference,''))>200 or length(coalesce(p_notes,''))>1000 then raise exception 'INVALID_PAYMENT_INPUT'; end if;
  for v_line in select variant_id,sum(quantity)::integer quantity from public.order_items where order_id=p_order_id group by variant_id order by variant_id loop
    update public.inventory set quantity=quantity-v_line.quantity,reserved_quantity=reserved_quantity-v_line.quantity
      where variant_id=v_line.variant_id and reserved_quantity>=v_line.quantity and quantity>=v_line.quantity;
    if not found then raise exception 'RESERVATION_INCONSISTENT'; end if;
    insert into public.inventory_movements(variant_id,quantity,movement_type,reason,user_id,reference_type,reference_id)
      values(v_line.variant_id,-v_line.quantity,'out','Pago manual recibido',auth.uid(),'order',p_order_id);
  end loop;
  update public.payments set status='approved',amount=p_amount,processed_at=now(),recorded_by=auth.uid(),
    reference=nullif(trim(p_reference),''),notes=nullif(trim(p_notes),'') where order_id=p_order_id and provider='manual';
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  update public.orders set payment_status='approved',inventory_status='committed' where id=p_order_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_data)
    values(auth.uid(),'payment.recorded_and_inventory_committed','order',p_order_id::text,
      jsonb_build_object('amount',p_amount,'method',v_order.payment_method,'inventory_status','committed'));
  return jsonb_build_object('alreadyPaid',false);
end;
$$;
revoke all on function public.admin_record_payment(uuid,numeric,text,text) from public,anon;
grant execute on function public.admin_record_payment(uuid,numeric,text,text) to authenticated;

create or replace function public.admin_change_order_status(p_order_id uuid,p_next_status text)
returns text language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_line record;
begin
  if not public.is_internal_user() then raise exception 'ADMIN_FORBIDDEN'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status=p_next_status then return p_next_status; end if;
  if p_next_status='cancelled' and (v_order.payment_status in ('approved','paid','authorized','refunded','partially_refunded') or v_order.inventory_status='committed') then
    raise exception 'PAID_ORDER_REQUIRES_RETURN';
  end if;
  if p_next_status is null or not (
    (v_order.status='pending' and p_next_status in ('confirmed','cancelled')) or
    (v_order.status='confirmed' and p_next_status in ('processing','cancelled')) or
    (v_order.status='processing' and p_next_status in ('ready','cancelled')) or
    (v_order.status='ready' and (p_next_status='cancelled' or
      (v_order.delivery_method='store_pickup' and p_next_status='delivered') or
      (v_order.delivery_method<>'store_pickup' and p_next_status='shipped'))) or
    (v_order.status='shipped' and p_next_status in ('delivered','cancelled'))
  ) then raise exception 'INVALID_ORDER_TRANSITION'; end if;
  if p_next_status='cancelled' then
    if v_order.inventory_status='reserved' then
      for v_line in select variant_id,sum(quantity)::integer quantity from public.order_items where order_id=p_order_id group by variant_id order by variant_id loop
        update public.inventory set reserved_quantity=reserved_quantity-v_line.quantity
          where variant_id=v_line.variant_id and reserved_quantity>=v_line.quantity;
        if not found then raise exception 'RESERVATION_INCONSISTENT'; end if;
        insert into public.inventory_movements(variant_id,quantity,movement_type,reason,user_id,reference_type,reference_id)
          values(v_line.variant_id,v_line.quantity,'release','Cancelación de pedido pendiente',auth.uid(),'order',p_order_id);
      end loop;
      update public.orders set inventory_status='released' where id=p_order_id;
    end if;
    update public.orders set payment_status='cancelled' where id=p_order_id;
    update public.payments set status='cancelled' where order_id=p_order_id and status in ('pending','processing','unknown');
  end if;
  update public.orders set status=p_next_status where id=p_order_id;
  if p_next_status in ('ready','shipped','delivered') then
    update public.shipments set status=p_next_status,
      shipped_at=case when p_next_status='shipped' then coalesce(shipped_at,now()) else shipped_at end,
      delivered_at=case when p_next_status='delivered' then coalesce(delivered_at,now()) else delivered_at end where order_id=p_order_id;
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data)
    values(auth.uid(),case when p_next_status='cancelled' then 'order.cancelled_and_reservation_released' else 'order.status_changed' end,
      'order',p_order_id::text,jsonb_build_object('status',v_order.status),jsonb_build_object('status',p_next_status));
  return p_next_status;
end;
$$;
-- No direct client/internal writes can bypass reservation accounting.
revoke insert,update,delete on public.inventory,public.inventory_movements from authenticated;
commit;
