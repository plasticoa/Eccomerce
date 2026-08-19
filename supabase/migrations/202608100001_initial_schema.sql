-- Importadora Valiente · Iteración 0
-- Esquema inicial, seguridad por filas y buckets públicos de solo lectura.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'operator', 'admin')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  recipient_name text not null,
  phone text,
  line_1 text not null,
  line_2 text,
  city text not null,
  state_region text,
  postal_code text,
  country_code char(2) not null default 'GT',
  delivery_notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, category_id)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  variant_name text not null,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (product_id, storage_path)
);

create unique index product_images_one_primary_per_product
  on public.product_images(product_id) where is_primary;

create table public.inventory (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity <> 0),
  movement_type text not null check (movement_type in ('in', 'out', 'adjustment')),
  reason text not null,
  user_id uuid references public.profiles(id) on delete set null,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'converted', 'abandoned')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index carts_one_active_per_profile
  on public.carts(profile_id) where status = 'active';

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (cart_id, variant_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  order_number text not null unique,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded')),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  shipping_total numeric(12,2) not null default 0 check (shipping_total >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  currency char(3) not null default 'GTQ',
  shipping_address jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  sku_snapshot text not null,
  name_snapshot text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null,
  provider_reference text,
  status text not null default 'pending',
  amount numeric(12,2) not null check (amount >= 0),
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_reference)
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  carrier text,
  tracking_number text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'shipped', 'delivered', 'returned')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('fixed', 'percentage')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_order numeric(12,2) not null default 0 check (minimum_order >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  amount_discounted numeric(12,2) not null check (amount_discounted >= 0),
  redeemed_at timestamptz not null default timezone('utc', now())
);

create table public.site_settings (
  id uuid primary key default gen_random_uuid(),
  store_name text not null default 'Importadora Valiente',
  logo_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  currency char(3) not null default 'GTQ',
  contact_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text not null,
  link_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.audit_logs (
  id bigint generated by default as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- Índices de navegación y relaciones más consultadas.
create index products_active_idx on public.products(active);
create index product_variants_product_id_idx on public.product_variants(product_id);
create index product_variants_active_idx on public.product_variants(active);
create index categories_active_idx on public.categories(active);
create index product_categories_category_id_idx on public.product_categories(category_id);
create index product_images_product_id_idx on public.product_images(product_id, sort_order);
create index addresses_profile_id_idx on public.addresses(profile_id);
create index carts_profile_id_idx on public.carts(profile_id);
create index cart_items_cart_id_idx on public.cart_items(cart_id);
create index inventory_movements_variant_id_idx on public.inventory_movements(variant_id);
create index orders_profile_id_idx on public.orders(profile_id);
create index orders_created_at_idx on public.orders(created_at desc);
create index order_items_order_id_idx on public.order_items(order_id);
create index payments_order_id_idx on public.payments(order_id);
create index shipments_order_id_idx on public.shipments(order_id);
create index coupon_redemptions_profile_id_idx on public.coupon_redemptions(profile_id);
create index banners_visibility_idx on public.banners(active, starts_at, ends_at);
create index audit_logs_user_id_idx on public.audit_logs(user_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

-- Timestamps consistentes.
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger addresses_set_updated_at before update on public.addresses for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
create trigger inventory_set_updated_at before update on public.inventory for each row execute function public.set_updated_at();
create trigger carts_set_updated_at before update on public.carts for each row execute function public.set_updated_at();
create trigger cart_items_set_updated_at before update on public.cart_items for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger shipments_set_updated_at before update on public.shipments for each row execute function public.set_updated_at();
create trigger coupons_set_updated_at before update on public.coupons for each row execute function public.set_updated_at();
create trigger site_settings_set_updated_at before update on public.site_settings for each row execute function public.set_updated_at();
create trigger banners_set_updated_at before update on public.banners for each row execute function public.set_updated_at();

-- Cada alta pública genera un perfil customer; los metadatos nunca controlan role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'customer');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Defensa en profundidad: una sesión normal no puede modificar role aunque cumpla RLS.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'profile role can only be changed by a trusted backend';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Helpers SECURITY DEFINER evitan recursión al consultar profiles desde políticas de profiles.
create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('operator', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_internal_user() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_internal_user() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- RLS está activo en toda tabla expuesta por la API.
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.site_settings enable row level security;
alter table public.banners enable row level security;
alter table public.audit_logs enable row level security;

-- Lectura pública del contenido publicado.
create policy categories_public_read on public.categories for select using (active);
create policy products_public_read on public.products for select using (active);
create policy product_categories_public_read on public.product_categories for select using (
  exists (select 1 from public.products p where p.id = product_id and p.active)
  and exists (select 1 from public.categories c where c.id = category_id and c.active)
);
create policy variants_public_read on public.product_variants for select using (
  active and exists (select 1 from public.products p where p.id = product_id and p.active)
);
create policy product_images_public_read on public.product_images for select using (
  exists (select 1 from public.products p where p.id = product_id and p.active)
);
create policy banners_public_read on public.banners for select using (
  active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
);
create policy site_settings_public_read on public.site_settings for select using (true);

-- Propiedad privada del cliente.
create policy profiles_owner_read on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_owner_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy addresses_owner_all on public.addresses for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy carts_owner_all on public.carts for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy cart_items_owner_all on public.cart_items for all to authenticated using (
  exists (select 1 from public.carts c where c.id = cart_id and c.profile_id = auth.uid())
) with check (
  exists (select 1 from public.carts c where c.id = cart_id and c.profile_id = auth.uid())
);
create policy orders_owner_read on public.orders for select to authenticated using (profile_id = auth.uid());
create policy order_items_owner_read on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.profile_id = auth.uid())
);
create policy payments_owner_read on public.payments for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.profile_id = auth.uid())
);
create policy shipments_owner_read on public.shipments for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.profile_id = auth.uid())
);
create policy redemptions_owner_read on public.coupon_redemptions for select to authenticated using (profile_id = auth.uid());

-- Personal interno: operaciones preparadas y siempre verificadas en base de datos.
create policy profiles_internal_all on public.profiles for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy addresses_internal_all on public.addresses for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy categories_internal_all on public.categories for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy products_internal_all on public.products for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy product_categories_internal_all on public.product_categories for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy variants_internal_all on public.product_variants for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy product_images_internal_all on public.product_images for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy inventory_internal_all on public.inventory for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy inventory_movements_internal_all on public.inventory_movements for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy carts_internal_all on public.carts for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy cart_items_internal_all on public.cart_items for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy orders_internal_all on public.orders for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy order_items_internal_all on public.order_items for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy payments_internal_all on public.payments for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy shipments_internal_all on public.shipments for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy coupons_internal_all on public.coupons for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy redemptions_internal_all on public.coupon_redemptions for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy site_settings_internal_all on public.site_settings for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy banners_internal_all on public.banners for all to authenticated using (public.is_internal_user()) with check (public.is_internal_user());
create policy audit_logs_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- Privilegios API. RLS sigue siendo la barrera de acceso efectiva.
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products, public.product_categories,
  public.product_variants, public.product_images, public.site_settings, public.banners to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Además del trigger, el rol authenticated solo recibe columnas de perfil editables.
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Buckets previstos. Son públicamente legibles; la escritura requiere personal interno.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('products', 'products', true, 10485760, array['image/jpeg','image/png','image/webp']),
  ('branding', 'branding', true, 5242880, array['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('banners', 'banners', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy public_assets_read on storage.objects for select
  using (bucket_id in ('products', 'branding', 'banners'));
create policy internal_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('products', 'branding', 'banners') and public.is_internal_user());
create policy internal_assets_update on storage.objects for update to authenticated
  using (bucket_id in ('products', 'branding', 'banners') and public.is_internal_user())
  with check (bucket_id in ('products', 'branding', 'banners') and public.is_internal_user());
create policy internal_assets_delete on storage.objects for delete to authenticated
  using (bucket_id in ('products', 'branding', 'banners') and public.is_internal_user());

