-- Each RPC runs in one database transaction so a failed save does not leave partial settings.
create or replace function public.replace_business_schedule(
  p_business_id uuid,
  p_hours jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_count integer;
begin
  if jsonb_typeof(p_hours) is distinct from 'array' then
    raise exception 'p_hours must be a JSON array';
  end if;

  delete from public.business_hours
  where business_id = p_business_id
    and barber_id is null;

  insert into public.business_hours (
    business_id,
    barber_id,
    weekday,
    open_time,
    close_time
  )
  select
    p_business_id,
    null,
    (item->>'weekday')::smallint,
    (item->>'open_time')::time,
    (item->>'close_time')::time
  from jsonb_array_elements(p_hours) as items(item);

  get diagnostics saved_count = row_count;
  return saved_count;
end;
$$;

create or replace function public.save_business_service(
  p_business_id uuid,
  p_service_id uuid,
  p_service jsonb,
  p_addons jsonb,
  p_promotion jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_service_id uuid;
begin
  if jsonb_typeof(p_service) is distinct from 'object' then
    raise exception 'p_service must be a JSON object';
  end if;
  if jsonb_typeof(p_addons) is distinct from 'array' then
    raise exception 'p_addons must be a JSON array';
  end if;

  if p_service_id is null then
    insert into public.business_services (
      business_id,
      name,
      description,
      category,
      price_cents,
      duration_minutes,
      direct_only,
      direct_contact_url,
      active
    )
    values (
      p_business_id,
      p_service->>'name',
      coalesce(p_service->>'description', ''),
      coalesce(p_service->>'category', ''),
      (p_service->>'price_cents')::integer,
      (p_service->>'duration_minutes')::integer,
      coalesce((p_service->>'direct_only')::boolean, false),
      nullif(p_service->>'direct_contact_url', ''),
      coalesce((p_service->>'active')::boolean, true)
    )
    returning id into saved_service_id;
  else
    update public.business_services
    set
      name = p_service->>'name',
      description = coalesce(p_service->>'description', ''),
      category = coalesce(p_service->>'category', ''),
      price_cents = (p_service->>'price_cents')::integer,
      duration_minutes = (p_service->>'duration_minutes')::integer,
      direct_only = coalesce((p_service->>'direct_only')::boolean, false),
      direct_contact_url = nullif(p_service->>'direct_contact_url', ''),
      active = coalesce((p_service->>'active')::boolean, true)
    where id = p_service_id
      and business_id = p_business_id
    returning id into saved_service_id;

    if saved_service_id is null then
      raise exception 'service not found for this business';
    end if;
  end if;

  delete from public.service_addons
  where business_id = p_business_id
    and service_id = saved_service_id;

  insert into public.service_addons (
    business_id,
    service_id,
    name,
    price_cents,
    active
  )
  select
    p_business_id,
    saved_service_id,
    item->>'name',
    (item->>'price_cents')::integer,
    true
  from jsonb_array_elements(p_addons) as items(item);

  delete from public.service_promotions
  where business_id = p_business_id
    and service_id = saved_service_id;

  if p_promotion is not null and jsonb_typeof(p_promotion) = 'object' then
    insert into public.service_promotions (
      business_id,
      service_id,
      label,
      price_cents,
      starts_at,
      ends_at,
      active
    )
    values (
      p_business_id,
      saved_service_id,
      p_promotion->>'label',
      (p_promotion->>'price_cents')::integer,
      nullif(p_promotion->>'starts_at', '')::timestamptz,
      nullif(p_promotion->>'ends_at', '')::timestamptz,
      true
    );
  end if;

  return saved_service_id;
end;
$$;

revoke all on function public.replace_business_schedule(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_business_schedule(uuid, jsonb)
  to service_role;

revoke all on function public.save_business_service(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_business_service(uuid, uuid, jsonb, jsonb, jsonb)
  to service_role;
