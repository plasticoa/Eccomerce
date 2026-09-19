-- Run after migrations 001..007. Transactional and safe to run again.
-- No users, orders, addresses or existing roles are removed/reassigned.
begin;

alter table public.profiles add column if not exists email text;

-- profiles.role remains the only authority; user-editable metadata never sets it.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, email, role, created_at)
  values(new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    new.email, 'customer', coalesce(new.created_at, now()))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated after update of email on auth.users
  for each row execute function public.handle_new_user();
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Backfill only missing profiles, keeping the Auth ID, registration date and role.
insert into public.profiles(id, full_name, email, role, created_at)
select u.id, nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
  u.email, 'customer', coalesce(u.created_at, now())
from auth.users u
on conflict (id) do nothing;
update public.profiles p set email = u.email
from auth.users u where p.id = u.id and p.email is distinct from u.email;

create or replace function public.is_internal_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('operator','admin'));
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_internal_user(), public.is_admin() from public, anon;
grant execute on function public.is_internal_user(), public.is_admin() to authenticated;

-- Replace the complete policy set on these four tables. Permissive policies OR
-- together, so leaving an older/hand-created policy can defeat owner isolation.
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('profiles','addresses','orders','order_items')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy profiles_owner_read on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_internal_read on public.profiles for select to authenticated
  using ((select public.is_internal_user()));
create policy profiles_owner_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy addresses_owner_read on public.addresses for select to authenticated
  using (profile_id = (select auth.uid()));
create policy addresses_owner_insert on public.addresses for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy addresses_owner_update on public.addresses for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy addresses_owner_delete on public.addresses for delete to authenticated
  using (profile_id = (select auth.uid()));

create policy orders_owner_read on public.orders for select to authenticated
  using (profile_id = (select auth.uid()));
create policy orders_internal_read on public.orders for select to authenticated
  using ((select public.is_internal_user()));
create policy order_items_owner_read on public.order_items for select to authenticated
  using (exists(select 1 from public.orders o where o.id = order_id and o.profile_id = (select auth.uid())));
create policy order_items_internal_read on public.order_items for select to authenticated
  using ((select public.is_internal_user()));

-- Writes to orders/items and role changes remain validated SECURITY DEFINER RPCs.
revoke all on public.profiles, public.addresses, public.orders, public.order_items from anon;
revoke insert, update, delete on public.profiles, public.orders, public.order_items from authenticated;
revoke update (id, role, email, created_at, updated_at) on public.profiles from authenticated;
grant select on public.profiles, public.orders, public.order_items to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public.addresses to authenticated;

-- No role exception in personal address writes; ownership cannot be transferred.
create or replace function public.ensure_single_default_address()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.profile_id <> auth.uid() then
    raise exception 'ADDRESS_FORBIDDEN';
  end if;
  if tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id then
    raise exception 'ADDRESS_OWNER_IMMUTABLE';
  end if;
  if new.is_default then
    update public.addresses set is_default = false
    where profile_id = new.profile_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;
drop trigger if exists addresses_single_default on public.addresses;
create trigger addresses_single_default before insert or update on public.addresses
  for each row execute function public.ensure_single_default_address();
revoke all on function public.ensure_single_default_address() from public, anon, authenticated;

-- A deliberately separate operational read; the account SELECT policy stays owner-only.
-- The existing operator role retains customer-service access, never role management.
create or replace function public.admin_customer_addresses(p_profile_id uuid)
returns table(id uuid, label text, recipient_name text, phone text, line_1 text,
  line_2 text, city text, state_region text, postal_code text, country_code char(2), is_default boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_internal_user() then raise exception 'ADMIN_FORBIDDEN' using errcode = '42501'; end if;
  return query select a.id, a.label, a.recipient_name, a.phone, a.line_1,
    a.line_2, a.city, a.state_region, a.postal_code, a.country_code, a.is_default
  from public.addresses a join public.profiles p on p.id = a.profile_id
  where a.profile_id = p_profile_id and p.role = 'customer'
  order by a.is_default desc, a.created_at, a.id;
end;
$$;
revoke all on function public.admin_customer_addresses(uuid) from public, anon;
grant execute on function public.admin_customer_addresses(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
