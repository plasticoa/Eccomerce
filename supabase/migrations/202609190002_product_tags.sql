-- Normalized product labels; demo data is loaded separately and never on startup.
begin;
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);
create table public.product_tags (
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key(product_id, tag_id)
);
create index product_tags_tag_id_idx on public.product_tags(tag_id, product_id);
alter table public.tags enable row level security;
alter table public.product_tags enable row level security;
create policy tags_public_read on public.tags for select to anon, authenticated
  using (exists(select 1 from public.product_tags pt where pt.tag_id = tags.id));
create policy product_tags_public_read on public.product_tags for select to anon, authenticated
  using (exists(select 1 from public.products p where p.id = product_id and p.active));
create policy tags_admin_all on public.tags for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy product_tags_admin_all on public.product_tags for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.tags, public.product_tags to anon, authenticated;
grant insert, update, delete on public.tags, public.product_tags to authenticated;
notify pgrst, 'reload schema';
commit;
