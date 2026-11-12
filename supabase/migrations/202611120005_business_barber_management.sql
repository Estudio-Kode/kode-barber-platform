-- Save the barber roster and its service/hour assignments atomically.
alter table public.barbers
  add column if not exists custom_hours boolean not null default false;

create or replace function public.save_business_barber(
  p_business_id uuid,
  p_barber_id uuid,
  p_barber jsonb,
  p_service_ids jsonb,
  p_hours jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_barber_id uuid;
  active_barber_count integer;
  plan_max_barbers integer;
  plan_features jsonb;
begin
  if jsonb_typeof(p_barber) is distinct from 'object'
    or jsonb_typeof(p_service_ids) is distinct from 'array'
    or jsonb_typeof(p_hours) is distinct from 'array' then
    raise exception 'Invalid barber settings payload';
  end if;

  if p_barber_id is null then
    -- Lock the tenant row first so concurrent requests cannot exceed its barber cap.
    select plans.max_barbers, plans.features
    into plan_max_barbers, plan_features
    from public.businesses as businesses
    join public.platform_plans as plans on plans.id = businesses.plan_id
    where businesses.id = p_business_id
    for update of businesses;

    if plan_max_barbers is null then
      raise exception 'Business plan not found';
    end if;

    select count(*) into active_barber_count
    from public.barbers
    where business_id = p_business_id and active;

    if active_barber_count >= plan_max_barbers then
      raise exception 'BARBER_PLAN_LIMIT';
    end if;
    if active_barber_count > 0
      and coalesce((plan_features->>'multiple_barbers')::boolean, false) is false then
      raise exception 'BARBER_MULTIPLE_FEATURE_DISABLED';
    end if;

    insert into public.barbers (
      business_id,
      name,
      phone,
      email,
      photo_url,
      active,
      custom_hours
    )
    values (
      p_business_id,
      p_barber->>'name',
      coalesce(p_barber->>'phone', ''),
      coalesce(p_barber->>'email', ''),
      nullif(p_barber->>'photo_url', ''),
      true,
      coalesce((p_barber->>'custom_hours')::boolean, false)
    )
    returning id into saved_barber_id;
  else
    update public.barbers
    set
      name = p_barber->>'name',
      phone = coalesce(p_barber->>'phone', ''),
      email = coalesce(p_barber->>'email', ''),
      photo_url = nullif(p_barber->>'photo_url', ''),
      custom_hours = coalesce((p_barber->>'custom_hours')::boolean, false)
    where id = p_barber_id
      and business_id = p_business_id
      and active
    returning id into saved_barber_id;

    if saved_barber_id is null then
      raise exception 'Barber not found for this business';
    end if;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_service_ids) as items(service_id)
    left join public.business_services as services
      on services.id = items.service_id::uuid
      and services.business_id = p_business_id
      and services.active
    where services.id is null
  ) then
    raise exception 'Service not found for this business';
  end if;

  delete from public.barber_services
  where business_id = p_business_id
    and barber_id = saved_barber_id;

  insert into public.barber_services (business_id, barber_id, service_id)
  select p_business_id, saved_barber_id, items.service_id::uuid
  from jsonb_array_elements_text(p_service_ids) as items(service_id);

  delete from public.business_hours
  where business_id = p_business_id
    and barber_id = saved_barber_id;

  insert into public.business_hours (
    business_id,
    barber_id,
    weekday,
    open_time,
    close_time
  )
  select
    p_business_id,
    saved_barber_id,
    (item->>'weekday')::smallint,
    (item->>'open_time')::time,
    (item->>'close_time')::time
  from jsonb_array_elements(p_hours) as items(item);

  return saved_barber_id;
end;
$$;

revoke all on function public.save_business_barber(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_business_barber(uuid, uuid, jsonb, jsonb, jsonb)
  to service_role;
