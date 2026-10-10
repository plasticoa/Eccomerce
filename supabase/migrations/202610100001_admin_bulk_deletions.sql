begin;

create or replace function public.admin_delete_products(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_product public.products%rowtype;
  v_has_history boolean;
  v_product_images text[];
  v_images text[] := array[]::text[];
  v_hard_deleted jsonb := '[]'::jsonb;
  v_retired jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then raise exception 'INVALID_SELECTION'; end if;

  for v_id in select distinct selected.id from unnest(p_ids) selected(id) order by selected.id
  loop
    select product.* into v_product
    from public.products product
    where product.id = v_id
    for update;

    if not found then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'reason', 'NOT_FOUND'));
      continue;
    end if;

    select exists(
      select 1
      from public.product_variants variant
      where variant.product_id = v_id
        and (
          exists(select 1 from public.inventory_movements movement where movement.variant_id = variant.id)
          or exists(select 1 from public.order_items item where item.variant_id = variant.id)
        )
    ) into v_has_history;

    if v_has_history then
      delete from public.cart_items item
      using public.product_variants variant
      where item.variant_id = variant.id and variant.product_id = v_id;
      update public.product_variants set active = false where product_id = v_id;
      update public.products set active = false, updated_at = now() where id = v_id;
      insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
      values(auth.uid(), 'product.retired', 'product', v_id::text, to_jsonb(v_product), jsonb_build_object('active', false));
      v_retired := v_retired || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_product.name));
      continue;
    end if;

    begin
      delete from public.cart_items item
      using public.product_variants variant
      where item.variant_id = variant.id and variant.product_id = v_id;

      select coalesce(array_agg(image.storage_path), array[]::text[])
      into v_product_images
      from public.product_images image
      where image.product_id = v_id;

      delete from public.products where id = v_id;
      insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data)
      values(auth.uid(), 'product.deleted', 'product', v_id::text, to_jsonb(v_product));
      v_images := v_images || v_product_images;
      v_hard_deleted := v_hard_deleted || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_product.name));
    exception
      when foreign_key_violation then
        v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_product.name, 'reason', 'RELATED_RECORDS'));
      when others then
        v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_product.name, 'reason', 'DELETE_FAILED'));
    end;
  end loop;

  return jsonb_build_object(
    'hardDeleted', v_hard_deleted,
    'retired', v_retired,
    'failed', v_failed,
    'imagePaths', to_jsonb(v_images)
  );
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
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_coupon public.coupons%rowtype;
  v_hard_deleted jsonb := '[]'::jsonb;
  v_retired jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then raise exception 'INVALID_SELECTION'; end if;

  for v_id in select distinct selected.id from unnest(p_ids) selected(id) order by selected.id
  loop
    select coupon.* into v_coupon from public.coupons coupon where coupon.id = v_id for update;
    if not found then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'reason', 'NOT_FOUND'));
      continue;
    end if;

    begin
      if exists(select 1 from public.coupon_redemptions redemption where redemption.coupon_id = v_id) then
        update public.coupons set active = false, updated_at = now() where id = v_id;
        insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
        values(auth.uid(), 'coupon.retired', 'coupon', v_id::text, to_jsonb(v_coupon), jsonb_build_object('active', false));
        v_retired := v_retired || jsonb_build_array(jsonb_build_object('id', v_id, 'code', v_coupon.code));
      else
        delete from public.coupons where id = v_id;
        insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data)
        values(auth.uid(), 'coupon.deleted', 'coupon', v_id::text, to_jsonb(v_coupon));
        v_hard_deleted := v_hard_deleted || jsonb_build_array(jsonb_build_object('id', v_id, 'code', v_coupon.code));
      end if;
    exception when others then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'code', v_coupon.code, 'reason', 'DELETE_FAILED'));
    end;
  end loop;

  return jsonb_build_object('hardDeleted', v_hard_deleted, 'retired', v_retired, 'failed', v_failed);
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

create or replace function public.admin_delete_users(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_profile public.profiles%rowtype;
  v_deleted jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_FORBIDDEN'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then raise exception 'INVALID_SELECTION'; end if;

  perform pg_advisory_xact_lock(hashtext('admin_delete_users'));
  for v_id in select distinct selected.id from unnest(p_ids) selected(id) order by selected.id
  loop
    select profile.* into v_profile from public.profiles profile where profile.id = v_id for update;
    if not found then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'reason', 'NOT_FOUND'));
    elsif v_id = auth.uid() then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'email', v_profile.email, 'reason', 'SELF_DELETE'));
    elsif exists(select 1 from public.orders customer_order where customer_order.profile_id = v_id) then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'email', v_profile.email, 'reason', 'ORDER_HISTORY'));
    elsif v_profile.role = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'email', v_profile.email, 'reason', 'LAST_ADMIN'));
    else
      begin
        delete from auth.users where id = v_id;
        insert into public.audit_logs(user_id, action, entity_type, entity_id, old_data)
        values(auth.uid(), 'user.deleted', 'user', v_id::text, to_jsonb(v_profile));
        v_deleted := v_deleted || jsonb_build_array(jsonb_build_object('id', v_id, 'email', v_profile.email));
      exception when others then
        v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'email', v_profile.email, 'reason', 'DELETE_FAILED'));
      end;
    end if;
  end loop;

  return jsonb_build_object('hardDeleted', v_deleted, 'failed', v_failed);
end;
$$;

revoke all on function public.admin_delete_products(uuid[]) from public, anon;
revoke all on function public.admin_delete_categories(uuid[]) from public, anon;
revoke all on function public.admin_delete_coupons(uuid[]) from public, anon;
revoke all on function public.admin_delete_banners(uuid[]) from public, anon;
revoke all on function public.admin_delete_users(uuid[]) from public, anon;
grant execute on function public.admin_delete_products(uuid[]) to authenticated;
grant execute on function public.admin_delete_categories(uuid[]) to authenticated;
grant execute on function public.admin_delete_coupons(uuid[]) to authenticated;
grant execute on function public.admin_delete_banners(uuid[]) to authenticated;
grant execute on function public.admin_delete_users(uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
