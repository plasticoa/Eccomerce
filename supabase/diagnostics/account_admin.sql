-- Read-only. Run in Supabase SQL Editor before/after the migration.
-- Counts and schema metadata only; no emails, addresses, tokens or Auth metadata.
select (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from auth.users u left join public.profiles p on p.id=u.id where p.id is null) as missing_profiles;
select role, count(*) from public.profiles group by role;
select count(*) as orders, count(*) filter(where profile_id is null) as orders_without_profile from public.orders;
select n.nspname, c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','addresses','orders','order_items');
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
where schemaname='public' and tablename in ('profiles','addresses','orders','order_items','payments','shipments','coupon_redemptions')
order by tablename, policyname;
select tgname, tgenabled, pg_get_triggerdef(oid) from pg_trigger
where tgrelid in ('auth.users'::regclass,'public.profiles'::regclass,'public.addresses'::regclass) and not tgisinternal;
select p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('is_admin','is_internal_user','handle_new_user');
