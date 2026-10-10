begin;

create or replace function public.admin_delete_products(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_count integer := 0;
  v_images text[] := array[]::text[];
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then raise exception 'INVALID_SELECTION'; end if;

  select coalesce(array_agg(image.storage_path), array[]::text[])
  into v_images
  from public.product_images image
  where image.product_id = any(p_ids);

  for v_product in
    select product.* from public.products product
    where product.id = any(p_ids)
    order by product.id
    for update
  loop
    delete from public.products where id = v_product.id;
    insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data)
    values(auth.uid(), 'product.deleted', 'product', v_product.id::text, to_jsonb(v_product));
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('count', v_count, 'imagePaths', to_jsonb(v_images));
end;
$$;

create or replace function public.admin_delete_categories(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_category public.categories%rowtype;
  v_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then raise exception 'INVALID_SELECTION'; end if;

  for v_category in
    select category.* from public.categories category
    where category.id = any(p_ids)
    order by category.id
    for update
  loop
    delete from public.categories where id = v_category.id;
    insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data)
    values(auth.uid(), 'category.deleted', 'category', v_category.id::text, to_jsonb(v_category));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.admin_delete_coupons(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_coupon public.coupons%rowtype;
  v_count integer := 0;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then raise exception 'INVALID_SELECTION'; end if;

  for v_coupon in
    select coupon.* from public.coupons coupon
    where coupon.id = any(p_ids)
    order by coupon.id
    for update
  loop
    delete from public.coupons where id = v_coupon.id;
    insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data)
    values(auth.uid(), 'coupon.deleted', 'coupon', v_coupon.id::text, to_jsonb(v_coupon));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.admin_delete_banners(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_banner public.banners%rowtype;
  v_count integer := 0;
  v_images text[] := array[]::text[];
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then raise exception 'INVALID_SELECTION'; end if;
  if exists(select 1 from public.banners where id = any(p_ids) and active) then raise exception 'BANNER_ACTIVE'; end if;

  select coalesce(array_agg(banner.image_url), array[]::text[])
  into v_images
  from public.banners banner
  where banner.id = any(p_ids);

  for v_banner in
    select banner.* from public.banners banner
    where banner.id = any(p_ids)
    order by banner.id
    for update
  loop
    if v_banner.active then raise exception 'BANNER_ACTIVE'; end if;
    delete from public.banners where id = v_banner.id;
    insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data)
    values(auth.uid(), 'banner.deleted', 'banner', v_banner.id::text, to_jsonb(v_banner));
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('count', v_count, 'imagePaths', to_jsonb(v_images));
end;
$$;

revoke all on function public.admin_delete_products(uuid[]) from public, anon;
revoke all on function public.admin_delete_categories(uuid[]) from public, anon;
revoke all on function public.admin_delete_coupons(uuid[]) from public, anon;
revoke all on function public.admin_delete_banners(uuid[]) from public, anon;
grant execute on function public.admin_delete_products(uuid[]) to authenticated;
grant execute on function public.admin_delete_categories(uuid[]) to authenticated;
grant execute on function public.admin_delete_coupons(uuid[]) to authenticated;
grant execute on function public.admin_delete_banners(uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
