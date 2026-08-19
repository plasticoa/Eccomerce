-- Iteración 1 · Catálogo público
-- Expone inventario solo para variantes activas de productos publicados y
-- centraliza búsqueda/filtros paginados sin SQL construido desde el cliente.

create policy inventory_public_read
on public.inventory
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where variant.id = inventory.variant_id
      and variant.active
      and product.active
  )
);

grant select on public.inventory to anon;

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
            and stock.quantity > 0
        )
      )
  )
  select eligible.id, count(*) over ()
  from eligible
  order by eligible.created_at desc, eligible.id
  limit least(greatest(coalesce(page_limit, 12), 1), 24)
  offset greatest(coalesce(page_offset, 0), 0);
$$;

revoke all on function public.catalog_product_page(text, text, numeric, numeric, boolean, integer, integer) from public;
grant execute on function public.catalog_product_page(text, text, numeric, numeric, boolean, integer, integer) to anon, authenticated;

