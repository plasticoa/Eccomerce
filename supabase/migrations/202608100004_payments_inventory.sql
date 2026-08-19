-- Iteración 3 · Pago e inventario
-- Proveedor definitivo pendiente. Esta migración crea el flujo genérico y seguro.

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (
  status in ('pending', 'confirmed', 'payment_review', 'processing', 'shipped', 'delivered', 'cancelled')
);

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (
  payment_status in ('pending', 'processing', 'approved', 'failed', 'cancelled', 'authorized', 'paid', 'refunded', 'partially_refunded')
);

alter table public.payments
  add column currency char(3) not null default 'GTQ',
  add column idempotency_key uuid,
  add column provider_status text,
  add column error_code text,
  add column metadata jsonb not null default '{}'::jsonb,
  add column updated_at timestamptz not null default timezone('utc', now());

update public.payments payment
set currency = orders.currency
from public.orders orders
where orders.id = payment.order_id;

update public.payments
set status = case lower(status)
  when 'pending' then 'pending'
  when 'processing' then 'processing'
  when 'approved' then 'approved'
  when 'paid' then 'approved'
  when 'authorized' then 'approved'
  when 'failed' then 'failed'
  when 'cancelled' then 'cancelled'
  when 'canceled' then 'cancelled'
  else 'unknown'
end;

alter table public.payments add constraint payments_status_check check (
  status in ('pending', 'processing', 'approved', 'failed', 'cancelled', 'unknown')
);

create unique index payments_order_provider_idempotency_unique
  on public.payments(order_id, provider, idempotency_key)
  where idempotency_key is not null;
create index payments_status_idx on public.payments(status);
create index payments_provider_reference_idx on public.payments(provider, provider_reference);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payment_id uuid references public.payments(id) on delete set null,
  event_type text not null,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  payload_metadata jsonb not null default '{}'::jsonb,
  error_code text,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  unique(provider, provider_event_id)
);

create index payment_webhook_events_payment_id_idx on public.payment_webhook_events(payment_id);
create index payment_webhook_events_status_idx on public.payment_webhook_events(status);
create trigger payment_webhook_events_set_updated_at
  before update on public.payment_webhook_events
  for each row execute function public.set_updated_at();

alter table public.payment_webhook_events enable row level security;

create policy payment_webhook_events_internal_read
  on public.payment_webhook_events for select to authenticated
  using (public.is_internal_user());

-- Los intentos pueden leerse por su propietario mediante la política inicial,
-- pero toda escritura pasa por funciones validadas o el backend del webhook.
drop policy if exists payments_internal_all on public.payments;
create policy payments_internal_read
  on public.payments for select to authenticated
  using (public.is_internal_user());

revoke insert, update, delete on public.payments from authenticated;
grant select on public.payment_webhook_events to authenticated;
revoke insert, update, delete on public.payment_webhook_events from authenticated;

create unique index inventory_movements_one_sale_per_order_variant
  on public.inventory_movements(reference_id, variant_id)
  where reference_type = 'order' and movement_type = 'out';

-- Crea o recupera un intento para la orden del usuario actual. El total y la
-- moneda siempre se leen de orders; el navegador no puede enviarlos.
create or replace function public.create_payment_attempt(
  p_order_number text,
  p_provider text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_idempotency_key is null then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if p_provider <> 'test' then raise exception 'PAYMENT_PROVIDER_UNAVAILABLE'; end if;

  select * into v_order
  from public.orders
  where order_number = p_order_number and profile_id = v_user_id
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_status in ('approved', 'paid') then raise exception 'ORDER_ALREADY_PAID'; end if;
  if v_order.status <> 'pending' then raise exception 'ORDER_NOT_PAYABLE'; end if;
  if v_order.total <= 0 then raise exception 'INVALID_ORDER_TOTAL'; end if;

  select * into v_payment
  from public.payments
  where order_id = v_order.id
    and provider = p_provider
    and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'paymentId', v_payment.id, 'orderNumber', v_order.order_number,
      'amount', v_payment.amount, 'currency', v_payment.currency,
      'status', v_payment.status, 'provider', v_payment.provider,
      'providerReference', v_payment.provider_reference, 'existing', true
    );
  end if;

  select * into v_payment
  from public.payments
  where order_id = v_order.id
    and status in ('pending', 'processing', 'unknown')
  order by created_at desc
  limit 1
  for update;
  if found then
    return jsonb_build_object(
      'paymentId', v_payment.id, 'orderNumber', v_order.order_number,
      'amount', v_payment.amount, 'currency', v_payment.currency,
      'status', v_payment.status, 'provider', v_payment.provider,
      'providerReference', v_payment.provider_reference, 'existing', true
    );
  end if;

  insert into public.payments(order_id, provider, status, amount, currency, idempotency_key)
  values (v_order.id, p_provider, 'pending', v_order.total, v_order.currency, p_idempotency_key)
  returning * into v_payment;

  return jsonb_build_object(
    'paymentId', v_payment.id, 'orderNumber', v_order.order_number,
    'amount', v_payment.amount, 'currency', v_payment.currency,
    'status', v_payment.status, 'provider', v_payment.provider,
    'providerReference', v_payment.provider_reference, 'existing', false
  );
end;
$$;

-- Registra la referencia normalizada que devolvió el adaptador. No permite
-- aprobar pagos ni tocar pedidos/inventario.
create or replace function public.set_payment_provider_reference(
  p_payment_id uuid,
  p_provider_reference text,
  p_provider_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.payments%rowtype;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_provider_reference is null or length(trim(p_provider_reference)) < 3 or length(p_provider_reference) > 200 then
    raise exception 'INVALID_PROVIDER_REFERENCE';
  end if;

  select payment.* into v_payment
  from public.payments payment
  join public.orders orders on orders.id = payment.order_id
  where payment.id = p_payment_id and orders.profile_id = v_user_id
  for update of payment;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.status not in ('pending', 'processing', 'unknown') then
    raise exception 'PAYMENT_NOT_MUTABLE';
  end if;

  update public.payments
  set provider_reference = trim(p_provider_reference),
      provider_status = left(p_provider_status, 100),
      status = 'processing',
      error_code = null
  where id = p_payment_id
  returning * into v_payment;

  return jsonb_build_object(
    'paymentId', v_payment.id, 'status', v_payment.status,
    'provider', v_payment.provider, 'providerReference', v_payment.provider_reference
  );
end;
$$;

-- Procesa un evento ya verificado y normalizado por el adaptador. Solo el
-- backend service_role puede ejecutarla. Pago, orden, inventario, movimiento,
-- evento y auditoría se confirman o revierten dentro de una transacción.
create or replace function public.process_payment_webhook(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payment_reference text,
  p_provider_status text,
  p_internal_status text,
  p_amount numeric,
  p_currency text,
  p_payload_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_existing_event public.payment_webhook_events%rowtype;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_line record;
  v_expected_lines integer := 0;
  v_locked_lines integer := 0;
  v_error_code text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'WEBHOOK_BACKEND_REQUIRED';
  end if;
  if p_provider is null or length(p_provider) > 40
     or p_event_id is null or length(p_event_id) > 200
     or p_payment_reference is null or length(p_payment_reference) > 200 then
    raise exception 'INVALID_WEBHOOK_INPUT';
  end if;
  if p_internal_status not in ('pending', 'processing', 'approved', 'failed', 'cancelled', 'ignored') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;

  insert into public.payment_webhook_events(
    provider, provider_event_id, event_type, status, payload_metadata
  ) values (
    p_provider, p_event_id, left(coalesce(p_event_type, 'unknown'), 100),
    'processing', coalesce(p_payload_metadata, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select * into v_existing_event
    from public.payment_webhook_events
    where provider = p_provider and provider_event_id = p_event_id;
    return jsonb_build_object(
      'duplicate', true,
      'eventStatus', coalesce(v_existing_event.status, 'processed'),
      'errorCode', v_existing_event.error_code
    );
  end if;

  select payment.* into v_payment
  from public.payments payment
  where payment.provider = p_provider
    and payment.provider_reference = p_payment_reference;
  if not found then
    update public.payment_webhook_events
    set status = 'failed', error_code = 'PAYMENT_NOT_FOUND', processed_at = timezone('utc', now())
    where id = v_event_id;
    return jsonb_build_object('duplicate', false, 'state', 'failed', 'errorCode', 'PAYMENT_NOT_FOUND');
  end if;

  update public.payment_webhook_events set payment_id = v_payment.id where id = v_event_id;

  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  -- Todas las confirmaciones de una misma orden se serializan por la orden
  -- antes de bloquear su intento individual, evitando deadlocks entre reintentos.
  select * into v_payment
  from public.payments
  where id = v_payment.id
  for update;

  if p_internal_status = 'ignored' then
    update public.payment_webhook_events
    set status = 'ignored', processed_at = timezone('utc', now())
    where id = v_event_id;
    return jsonb_build_object('duplicate', false, 'state', 'ignored', 'orderNumber', v_order.order_number);
  end if;

  if v_payment.status = 'approved' and p_internal_status <> 'approved' then
    update public.payment_webhook_events
    set status = 'ignored', error_code = 'APPROVED_PAYMENT_IS_FINAL', processed_at = timezone('utc', now())
    where id = v_event_id;
    return jsonb_build_object('duplicate', false, 'state', 'approved_unchanged', 'orderNumber', v_order.order_number);
  end if;

  if p_internal_status in ('pending', 'processing') then
    if (p_internal_status = 'pending' and v_payment.status not in ('pending', 'unknown'))
       or (p_internal_status = 'processing' and v_payment.status not in ('pending', 'processing', 'unknown')) then
      update public.payment_webhook_events
      set status = 'ignored', error_code = 'LATE_PAYMENT_STATUS', processed_at = timezone('utc', now())
      where id = v_event_id;
      return jsonb_build_object('duplicate', false, 'state', v_payment.status, 'orderNumber', v_order.order_number);
    end if;
    update public.payments
    set status = p_internal_status, provider_status = left(p_provider_status, 100), error_code = null
    where id = v_payment.id;
    update public.payment_webhook_events
    set status = 'processed', processed_at = timezone('utc', now())
    where id = v_event_id;
    return jsonb_build_object('duplicate', false, 'state', p_internal_status, 'orderNumber', v_order.order_number);
  end if;

  if p_internal_status in ('failed', 'cancelled') then
    if v_payment.status in ('failed', 'cancelled') and v_payment.status <> p_internal_status then
      update public.payment_webhook_events
      set status = 'ignored', error_code = 'FINAL_PAYMENT_STATUS_EXISTS', processed_at = timezone('utc', now())
      where id = v_event_id;
      return jsonb_build_object('duplicate', false, 'state', v_payment.status, 'orderNumber', v_order.order_number);
    end if;
    update public.payments
    set status = p_internal_status, provider_status = left(p_provider_status, 100),
        processed_at = timezone('utc', now()), error_code = null
    where id = v_payment.id;
    update public.payment_webhook_events
    set status = 'processed', processed_at = timezone('utc', now())
    where id = v_event_id;
    insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
    values (v_order.profile_id, 'payment.' || p_internal_status, 'payment', v_payment.id::text,
      jsonb_build_object('provider', p_provider, 'orderNumber', v_order.order_number));
    return jsonb_build_object('duplicate', false, 'state', p_internal_status, 'orderNumber', v_order.order_number);
  end if;

  -- Desde aquí el proveedor informó aprobación. Monto y moneda deben coincidir.
  if p_amount is null or round(p_amount, 2) <> round(v_payment.amount, 2)
     or round(p_amount, 2) <> round(v_order.total, 2) then
    v_error_code := 'AMOUNT_MISMATCH';
  elsif upper(coalesce(p_currency, '')) <> upper(v_payment.currency)
     or upper(coalesce(p_currency, '')) <> upper(v_order.currency) then
    v_error_code := 'CURRENCY_MISMATCH';
  end if;

  if v_error_code is not null then
    update public.payments
    set status = 'approved', provider_status = left(p_provider_status, 100),
        processed_at = timezone('utc', now()), error_code = v_error_code
    where id = v_payment.id;
    update public.orders set payment_status = 'approved', status = 'payment_review' where id = v_order.id;
    update public.payment_webhook_events
    set status = 'failed', error_code = v_error_code, processed_at = timezone('utc', now())
    where id = v_event_id;
    return jsonb_build_object('duplicate', false, 'state', 'payment_review', 'errorCode', v_error_code, 'orderNumber', v_order.order_number);
  end if;

  if v_order.status = 'confirmed' and v_order.payment_status in ('approved', 'paid') then
    if v_payment.status = 'approved' then
      update public.payment_webhook_events
      set status = 'processed', processed_at = timezone('utc', now())
      where id = v_event_id;
      return jsonb_build_object('duplicate', false, 'state', 'already_confirmed', 'orderNumber', v_order.order_number);
    end if;
    update public.payments
    set status = 'approved', provider_status = left(p_provider_status, 100),
        processed_at = timezone('utc', now()), error_code = 'ORDER_ALREADY_CONFIRMED'
    where id = v_payment.id;
    update public.payment_webhook_events
    set status = 'failed', error_code = 'ORDER_ALREADY_CONFIRMED', processed_at = timezone('utc', now())
    where id = v_event_id;
    insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
    values (v_order.profile_id, 'payment.additional_approved_attempt', 'payment', v_payment.id::text,
      jsonb_build_object('provider', p_provider, 'orderNumber', v_order.order_number));
    return jsonb_build_object('duplicate', false, 'state', 'already_confirmed', 'errorCode', 'ORDER_ALREADY_CONFIRMED', 'orderNumber', v_order.order_number);
  end if;

  if v_order.status = 'payment_review' then
    update public.payment_webhook_events
    set status = 'failed', error_code = 'ORDER_REQUIRES_REVIEW', processed_at = timezone('utc', now())
    where id = v_event_id;
    return jsonb_build_object('duplicate', false, 'state', 'payment_review', 'errorCode', 'ORDER_REQUIRES_REVIEW', 'orderNumber', v_order.order_number);
  end if;

  select count(*) into v_expected_lines from public.order_items where order_id = v_order.id;
  if v_expected_lines = 0 then v_error_code := 'ORDER_ITEMS_MISSING'; end if;

  if v_error_code is null then
    for v_line in
      select item.variant_id, item.quantity, stock.quantity as stock_quantity
      from public.order_items item
      join public.inventory stock on stock.variant_id = item.variant_id
      where item.order_id = v_order.id
      order by item.variant_id
      for update of stock
    loop
      v_locked_lines := v_locked_lines + 1;
      if v_line.stock_quantity < v_line.quantity then
        v_error_code := 'INSUFFICIENT_STOCK';
      end if;
    end loop;
    if v_locked_lines <> v_expected_lines then v_error_code := 'INVENTORY_RECORD_MISSING'; end if;
  end if;

  if v_error_code is not null then
    update public.payments
    set status = 'approved', provider_status = left(p_provider_status, 100),
        processed_at = timezone('utc', now()), error_code = v_error_code
    where id = v_payment.id;
    update public.orders set payment_status = 'approved', status = 'payment_review' where id = v_order.id;
    update public.payment_webhook_events
    set status = 'failed', error_code = v_error_code, processed_at = timezone('utc', now())
    where id = v_event_id;
    insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
    values (v_order.profile_id, 'payment.review_required', 'order', v_order.id::text,
      jsonb_build_object('provider', p_provider, 'orderNumber', v_order.order_number, 'errorCode', v_error_code));
    return jsonb_build_object('duplicate', false, 'state', 'payment_review', 'errorCode', v_error_code, 'orderNumber', v_order.order_number);
  end if;

  for v_line in
    select item.variant_id, item.quantity
    from public.order_items item
    where item.order_id = v_order.id
    order by item.variant_id
  loop
    update public.inventory
    set quantity = quantity - v_line.quantity
    where variant_id = v_line.variant_id and quantity >= v_line.quantity;
    if not found then raise exception 'INVENTORY_CONCURRENCY_ERROR'; end if;

    insert into public.inventory_movements(
      variant_id, quantity, movement_type, reason, user_id, reference_type, reference_id
    ) values (
      v_line.variant_id, -v_line.quantity, 'out',
      'Venta confirmada ' || v_order.order_number,
      v_order.profile_id, 'order', v_order.id
    );
  end loop;

  update public.payments
  set status = 'approved', provider_status = left(p_provider_status, 100),
      processed_at = timezone('utc', now()), error_code = null
  where id = v_payment.id;
  update public.payments
  set status = 'cancelled', error_code = 'SUPERSEDED_BY_APPROVED_ATTEMPT',
      processed_at = timezone('utc', now())
  where order_id = v_order.id and id <> v_payment.id
    and status in ('pending', 'processing', 'unknown');
  update public.orders set payment_status = 'approved', status = 'confirmed' where id = v_order.id;
  update public.payment_webhook_events
  set status = 'processed', processed_at = timezone('utc', now())
  where id = v_event_id;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_data)
  values (v_order.profile_id, 'order.payment_confirmed', 'order', v_order.id::text,
    jsonb_build_object('provider', p_provider, 'paymentId', v_payment.id, 'orderNumber', v_order.order_number));

  return jsonb_build_object('duplicate', false, 'state', 'approved', 'orderNumber', v_order.order_number);
end;
$$;

revoke all on function public.create_payment_attempt(text, text, uuid) from public, anon;
revoke all on function public.set_payment_provider_reference(uuid, text, text) from public, anon;
revoke all on function public.process_payment_webhook(text, text, text, text, text, text, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_payment_attempt(text, text, uuid) to authenticated;
grant execute on function public.set_payment_provider_reference(uuid, text, text) to authenticated;
grant execute on function public.process_payment_webhook(text, text, text, text, text, text, numeric, text, jsonb) to service_role;
