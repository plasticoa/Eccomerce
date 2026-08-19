-- Iteración 2 · Flujo de compra previo al pago
-- No procesa pagos ni descuenta/reserva inventario.

alter table public.carts
  add column last_merge_token uuid;

alter table public.orders
  add column delivery_method text check (delivery_method in ('local_delivery', 'store_pickup')),
  add column payment_method text check (payment_method in ('pending_gateway')),
  add column checkout_token uuid;

create unique index orders_profile_checkout_token_unique
  on public.orders(profile_id, checkout_token)
  where checkout_token is not null;

alter table public.order_items
  add column variant_name_snapshot text;

alter table public.shipments
  add column delivery_method text check (delivery_method in ('local_delivery', 'store_pickup')),
  add column shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  add column estimated_at timestamptz;

-- Si una base previa ya tiene más de una predeterminada, conserva la más reciente.
with ranked_defaults as (
  select id, row_number() over (
    partition by profile_id order by updated_at desc, created_at desc, id
  ) as position
  from public.addresses
  where is_default
)
update public.addresses address
set is_default = false
from ranked_defaults ranked
where address.id = ranked.id and ranked.position > 1;

create unique index addresses_one_default_per_profile
  on public.addresses(profile_id)
  where is_default;

create sequence public.order_number_seq start with 1 increment by 1 no cycle;
revoke all on sequence public.order_number_seq from public, anon, authenticated;

-- Mantiene una única dirección predeterminada dentro de la misma transacción.
create or replace function public.ensure_single_default_address()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.profile_id <> auth.uid() and not public.is_internal_user() then
    raise exception 'ADDRESS_FORBIDDEN';
  end if;

  if new.is_default then
    update public.addresses
      set is_default = false
      where profile_id = new.profile_id
        and id <> new.id
        and is_default;
  end if;
  return new;
end;
$$;

create trigger addresses_single_default
  before insert or update of is_default on public.addresses
  for each row execute function public.ensure_single_default_address();

-- Los clientes leen su carrito, pero las escrituras pasan por RPCs validadas.
drop policy if exists carts_owner_all on public.carts;
drop policy if exists cart_items_owner_all on public.cart_items;

create policy carts_owner_read
  on public.carts for select to authenticated
  using (profile_id = auth.uid());

create policy cart_items_owner_read
  on public.cart_items for select to authenticated
  using (
    exists (
      select 1 from public.carts cart
      where cart.id = cart_id and cart.profile_id = auth.uid()
    )
  );

-- Helper privado. La unicidad parcial existente resuelve carreras al crear carrito.
create or replace function public.ensure_active_cart(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart_id uuid;
begin
  select id into v_cart_id
  from public.carts
  where profile_id = p_user_id and status = 'active'
  for update;

  if v_cart_id is null then
    begin
      insert into public.carts(profile_id, status)
      values (p_user_id, 'active')
      returning id into v_cart_id;
    exception when unique_violation then
      select id into v_cart_id
      from public.carts
      where profile_id = p_user_id and status = 'active'
      for update;
    end;
  end if;
  return v_cart_id;
end;
$$;

revoke all on function public.ensure_active_cart(uuid) from public, anon, authenticated;

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

  select stock.quantity into v_stock
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

  select stock.quantity into v_stock
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

create or replace function public.cart_remove_item(p_variant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from public.cart_items item
  using public.carts cart
  where item.cart_id = cart.id
    and cart.profile_id = v_user_id
    and cart.status = 'active'
    and item.variant_id = p_variant_id;
  return found;
end;
$$;

-- Ajusta en una sola operación cantidades que quedaron por encima del stock.
-- Conserva líneas agotadas/inactivas para que la UI pueda advertir y eliminarlas.
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
  set quantity = stock.quantity, updated_at = timezone('utc', now())
  from public.carts cart, public.product_variants variant, public.products product, public.inventory stock
  where item.cart_id = cart.id
    and item.variant_id = variant.id
    and variant.product_id = product.id
    and stock.variant_id = variant.id
    and cart.profile_id = v_user_id
    and cart.status = 'active'
    and product.active and variant.active
    and stock.quantity > 0
    and item.quantity > stock.quantity;
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
    select stock.quantity into v_stock
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

revoke all on function public.cart_add_item(uuid, integer) from public, anon;
revoke all on function public.cart_set_quantity(uuid, integer) from public, anon;
revoke all on function public.cart_remove_item(uuid) from public, anon;
revoke all on function public.reconcile_active_cart() from public, anon;
revoke all on function public.merge_guest_cart(jsonb, uuid) from public, anon;
grant execute on function public.cart_add_item(uuid, integer) to authenticated;
grant execute on function public.cart_set_quantity(uuid, integer) to authenticated;
grant execute on function public.cart_remove_item(uuid) to authenticated;
grant execute on function public.reconcile_active_cart() to authenticated;
grant execute on function public.merge_guest_cart(jsonb, uuid) to authenticated;

-- Operación atómica: valida, calcula, crea orden/items/shipment y convierte carrito.
create or replace function public.create_order_from_cart(
  p_address_id uuid,
  p_delivery_method text,
  p_payment_method text,
  p_checkout_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cart_id uuid;
  v_address public.addresses%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_existing_number text;
  v_line record;
  v_expected_count integer := 0;
  v_line_count integer := 0;
  v_subtotal numeric(12,2) := 0;
  v_shipping numeric(12,2);
  v_total numeric(12,2);
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_checkout_token is null then raise exception 'INVALID_CHECKOUT_TOKEN'; end if;

  select order_number into v_existing_number
  from public.orders
  where profile_id = v_user_id and checkout_token = p_checkout_token;
  if v_existing_number is not null then
    return jsonb_build_object('orderNumber', v_existing_number, 'alreadyCreated', true);
  end if;

  select * into v_address from public.addresses
  where id = p_address_id and profile_id = v_user_id;
  if not found then raise exception 'ADDRESS_NOT_FOUND'; end if;

  if p_delivery_method = 'local_delivery' then v_shipping := 35.00;
  elsif p_delivery_method = 'store_pickup' then v_shipping := 0.00;
  else raise exception 'INVALID_DELIVERY_METHOD';
  end if;
  if p_payment_method <> 'pending_gateway' then raise exception 'INVALID_PAYMENT_METHOD'; end if;

  select id into v_cart_id from public.carts
  where profile_id = v_user_id and status = 'active' for update;
  if v_cart_id is null then raise exception 'EMPTY_CART'; end if;

  select count(*) into v_expected_count
  from public.cart_items
  where cart_id = v_cart_id;
  if v_expected_count = 0 then raise exception 'EMPTY_CART'; end if;

  for v_line in
    select item.variant_id, item.quantity, variant.sku, variant.variant_name,
           variant.price, variant.active as variant_active,
           product.name as product_name, product.active as product_active,
           stock.quantity as stock_quantity
    from public.cart_items item
    join public.product_variants variant on variant.id = item.variant_id
    join public.products product on product.id = variant.product_id
    join public.inventory stock on stock.variant_id = variant.id
    where item.cart_id = v_cart_id
    for update of item, product, variant, stock
  loop
    v_line_count := v_line_count + 1;
    if not v_line.product_active then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if not v_line.variant_active then raise exception 'VARIANT_UNAVAILABLE'; end if;
    if v_line.quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;
    if v_line.stock_quantity is null or v_line.quantity > v_line.stock_quantity then
      raise exception 'INSUFFICIENT_STOCK';
    end if;
    v_subtotal := v_subtotal + (v_line.price * v_line.quantity);
  end loop;
  if v_line_count <> v_expected_count then raise exception 'VARIANT_UNAVAILABLE'; end if;

  v_total := v_subtotal + v_shipping;
  loop
    v_order_number := 'IV-' || to_char(timezone('utc', now()), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
    exit when not exists (select 1 from public.orders where order_number = v_order_number);
  end loop;

  begin
    insert into public.orders(
      profile_id, order_number, status, payment_status, subtotal, discount,
      shipping_total, total, currency, shipping_address, delivery_method,
      payment_method, checkout_token
    ) values (
      v_user_id, v_order_number, 'pending', 'pending', v_subtotal, 0,
      v_shipping, v_total, 'GTQ',
      to_jsonb(v_address) - 'id' - 'profile_id' - 'created_at' - 'updated_at',
      p_delivery_method, p_payment_method, p_checkout_token
    ) returning id into v_order_id;
  exception when unique_violation then
    select order_number into v_existing_number
    from public.orders
    where profile_id = v_user_id and checkout_token = p_checkout_token;
    if v_existing_number is not null then
      return jsonb_build_object('orderNumber', v_existing_number, 'alreadyCreated', true);
    end if;
    raise;
  end;

  insert into public.order_items(
    order_id, variant_id, sku_snapshot, name_snapshot, variant_name_snapshot,
    unit_price, quantity, line_total
  )
  select v_order_id, variant.id, variant.sku, product.name, variant.variant_name,
         variant.price, item.quantity, variant.price * item.quantity
  from public.cart_items item
  join public.product_variants variant on variant.id = item.variant_id
  join public.products product on product.id = variant.product_id
  where item.cart_id = v_cart_id;

  insert into public.shipments(order_id, status, delivery_method, shipping_cost)
  values (v_order_id, 'pending', p_delivery_method, v_shipping);

  update public.carts set status = 'converted' where id = v_cart_id;
  return jsonb_build_object('orderNumber', v_order_number, 'orderId', v_order_id, 'alreadyCreated', false);
end;
$$;

revoke all on function public.create_order_from_cart(uuid, text, text, uuid) from public, anon;
grant execute on function public.create_order_from_cart(uuid, text, text, uuid) to authenticated;
