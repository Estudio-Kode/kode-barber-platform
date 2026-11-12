alter table public.business_hours
  drop constraint if exists business_hours_slot_interval_minutes_check;

alter table public.business_hours
  add column if not exists slot_interval_minutes smallint not null default 30;

alter table public.business_hours
  add constraint business_hours_slot_interval_minutes_check
    check (slot_interval_minutes in (30, 60, 90, 120));

alter table public.business_hours
  add column if not exists available_times time[] not null default '{}'::time[];

-- Preserve the existing half-hour schedule as an explicit list of start times.
update public.business_hours as hours
set available_times = array(
  select (time '00:00' + make_interval(secs => slots.seconds))::time
  from generate_series(
    extract(epoch from hours.open_time)::integer,
    extract(epoch from hours.close_time)::integer - 1,
    30 * 60
  ) as slots(seconds)
  order by slots.seconds
)
where cardinality(hours.available_times) = 0;

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
  max_service_duration integer;
begin
  if jsonb_typeof(p_hours) is distinct from 'array' then
    raise exception 'p_hours must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hours) as entries(item)
    where jsonb_typeof(item->'available_times') is distinct from 'array'
      or coalesce(jsonb_array_length(item->'available_times'), 0) = 0
      or (item->>'slot_interval_minutes')::smallint not in (30, 60, 90, 120)
      or (item->>'weekday')::smallint not between 0 and 6
  ) then
    raise exception 'Invalid business schedule';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hours) as entries(item)
    group by (item->>'weekday')::smallint
    having count(*) > 1
  ) then
    raise exception 'Duplicate weekday in business schedule';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hours) as entries(item)
    cross join lateral jsonb_array_elements_text(
      entries.item->'available_times'
    ) as slots(value)
    cross join lateral (
      select min(schedule_time.value::time) as first_time
      from jsonb_array_elements_text(
        entries.item->'available_times'
      ) as schedule_time(value)
    ) as bounds
    where mod(
      extract(epoch from (slots.value::time - bounds.first_time))::integer / 60,
      (entries.item->>'slot_interval_minutes')::integer
    ) <> 0
  ) or exists (
    select 1
    from jsonb_array_elements(p_hours) as entries(item)
    cross join lateral jsonb_array_elements_text(
      entries.item->'available_times'
    ) as slots(value)
    group by (entries.item->>'weekday')::smallint, slots.value::time
    having count(*) > 1
  ) then
    raise exception 'Invalid business schedule times';
  end if;

  select coalesce(max(duration_minutes), 30)
  into max_service_duration
  from public.business_services
  where business_id = p_business_id
    and active
    and not direct_only;

  perform 1
  from public.businesses
  where id = p_business_id
  for update;

  delete from public.business_hours
  where business_id = p_business_id
    and barber_id is null;

  insert into public.business_hours (
    business_id,
    barber_id,
    weekday,
    open_time,
    close_time,
    slot_interval_minutes,
    available_times
  )
  select
    p_business_id,
    null,
    (entries.item->>'weekday')::smallint,
    times.first_time,
    case
      when extract(epoch from times.last_time)::integer / 60
        + max_service_duration >= 1440 then time '24:00'
      else (times.last_time + make_interval(mins => max_service_duration))::time
    end,
    (entries.item->>'slot_interval_minutes')::smallint,
    times.available_times
  from jsonb_array_elements(p_hours) as entries(item)
  cross join lateral (
    select
      min(slot_time.value::time) as first_time,
      max(slot_time.value::time) as last_time,
      array_agg(slot_time.value::time order by slot_time.value::time) as available_times
    from jsonb_array_elements_text(entries.item->'available_times') as slot_time(value)
  ) as times;

  get diagnostics saved_count = row_count;
  return saved_count;
end;
$$;

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
  max_service_duration integer;
begin
  if jsonb_typeof(p_barber) is distinct from 'object'
    or jsonb_typeof(p_service_ids) is distinct from 'array'
    or jsonb_typeof(p_hours) is distinct from 'array' then
    raise exception 'Invalid barber settings payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hours) as entries(item)
    where jsonb_typeof(item->'available_times') is distinct from 'array'
      or coalesce(jsonb_array_length(item->'available_times'), 0) = 0
      or (item->>'slot_interval_minutes')::smallint not in (30, 60, 90, 120)
      or (item->>'weekday')::smallint not between 0 and 6
  ) then
    raise exception 'Invalid barber schedule';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hours) as entries(item)
    group by (item->>'weekday')::smallint
    having count(*) > 1
  ) then
    raise exception 'Duplicate weekday in barber schedule';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hours) as entries(item)
    cross join lateral jsonb_array_elements_text(
      entries.item->'available_times'
    ) as slots(value)
    cross join lateral (
      select min(schedule_time.value::time) as first_time
      from jsonb_array_elements_text(
        entries.item->'available_times'
      ) as schedule_time(value)
    ) as bounds
    where mod(
      extract(epoch from (slots.value::time - bounds.first_time))::integer / 60,
      (entries.item->>'slot_interval_minutes')::integer
    ) <> 0
  ) or exists (
    select 1
    from jsonb_array_elements(p_hours) as entries(item)
    cross join lateral jsonb_array_elements_text(
      entries.item->'available_times'
    ) as slots(value)
    group by (entries.item->>'weekday')::smallint, slots.value::time
    having count(*) > 1
  ) then
    raise exception 'Invalid barber schedule times';
  end if;

  if p_barber_id is null then
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

  select coalesce(max(duration_minutes), 30)
  into max_service_duration
  from public.business_services
  where business_id = p_business_id
    and active
    and not direct_only;

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
    close_time,
    slot_interval_minutes,
    available_times
  )
  select
    p_business_id,
    saved_barber_id,
    (entries.item->>'weekday')::smallint,
    times.first_time,
    case
      when extract(epoch from times.last_time)::integer / 60
        + max_service_duration >= 1440 then time '24:00'
      else (times.last_time + make_interval(mins => max_service_duration))::time
    end,
    (entries.item->>'slot_interval_minutes')::smallint,
    times.available_times
  from jsonb_array_elements(p_hours) as entries(item)
  cross join lateral (
    select
      min(slot_time.value::time) as first_time,
      max(slot_time.value::time) as last_time,
      array_agg(slot_time.value::time order by slot_time.value::time) as available_times
    from jsonb_array_elements_text(entries.item->'available_times') as slot_time(value)
  ) as times;

  return saved_barber_id;
end;
$$;

revoke all on function public.replace_business_schedule(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_business_schedule(uuid, jsonb)
  to service_role;

revoke all on function public.save_business_barber(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_business_barber(uuid, uuid, jsonb, jsonb, jsonb)
  to service_role;
