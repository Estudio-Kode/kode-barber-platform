create extension if not exists pgcrypto;

create table public.platform_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  price_cents integer check (price_cents is null or price_cents >= 0),
  max_barbers integer not null default 1 check (max_barbers between 1 and 500),
  max_services integer check (max_services is null or max_services > 0),
  max_products integer check (max_products is null or max_products >= 0),
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  owner_name text not null default '',
  email text not null default '',
  whatsapp text not null default '',
  logo_url text,
  status text not null default 'setup'
    check (status in ('setup', 'active', 'suspended')),
  plan_id uuid not null references public.platform_plans(id),
  plan_price_cents integer check (plan_price_cents is null or plan_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  auth_user_id uuid not null,
  role text not null default 'owner' check (role in ('owner', 'manager', 'barber')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, auth_user_id)
);

create table public.barbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  photo_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  barber_id uuid,
  weekday smallint not null check (weekday between 0 and 6),
  open_time time not null,
  close_time time not null,
  sort_order integer not null default 0,
  check (open_time < close_time),
  foreign key (business_id, barber_id) references public.barbers(business_id, id)
    on delete cascade
);

create table public.business_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default '',
  price_cents integer not null check (price_cents >= 0),
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  direct_only boolean not null default false,
  direct_contact_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, name)
);

create table public.service_addons (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  service_id uuid not null,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  foreign key (business_id, service_id)
    references public.business_services(business_id, id) on delete cascade,
  unique (business_id, service_id, name)
);

create table public.service_promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  service_id uuid not null,
  label text not null,
  price_cents integer not null check (price_cents >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  foreign key (business_id, service_id)
    references public.business_services(business_id, id) on delete cascade,
  check (starts_at is null or ends_at is null or starts_at < ends_at)
);

create table public.barber_services (
  business_id uuid not null,
  barber_id uuid not null,
  service_id uuid not null,
  primary key (business_id, barber_id, service_id),
  foreign key (business_id, barber_id)
    references public.barbers(business_id, id) on delete cascade,
  foreign key (business_id, service_id)
    references public.business_services(business_id, id) on delete cascade
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone text not null,
  name text not null,
  password_hash text,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone),
  unique (business_id, id)
);

create table public.sms_verifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone text not null,
  code_digest text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 10),
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table public.appointments (
  id bigint generated by default as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone text not null,
  barber_id uuid,
  service_id uuid,
  service text not null,
  date date not null,
  time time not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  price_cents integer check (price_cents is null or price_cents >= 0),
  created_at timestamptz not null default now(),
  foreign key (business_id, phone) references public.clients(business_id, phone),
  foreign key (business_id, barber_id) references public.barbers(business_id, id),
  foreign key (business_id, service_id)
    references public.business_services(business_id, id)
);

create unique index appointments_slot_without_barber_unique
  on public.appointments (business_id, date, time)
  where barber_id is null;
create unique index appointments_slot_with_barber_unique
  on public.appointments (business_id, barber_id, date, time)
  where barber_id is not null;
create index appointments_business_date_idx
  on public.appointments (business_id, date, time);
create index appointments_business_phone_idx
  on public.appointments (business_id, phone, date);

create table public.blocked_slots (
  id bigint generated by default as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  barber_id uuid,
  date date not null,
  time time not null,
  created_at timestamptz not null default now(),
  foreign key (business_id, barber_id) references public.barbers(business_id, id)
    on delete cascade,
  unique nulls not distinct (business_id, barber_id, date, time)
);

create table public.day_notes (
  business_id uuid not null references public.businesses(id) on delete cascade,
  date date not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (business_id, date)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.client_membership_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text not null default '',
  price_cents integer check (price_cents is null or price_cents >= 0),
  included_services jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.client_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  client_id uuid not null,
  plan_id uuid not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'cancelled', 'expired')),
  starts_at date not null default current_date,
  ends_at date,
  foreign key (business_id, client_id)
    references public.clients(business_id, id) on delete cascade,
  foreign key (business_id, plan_id)
    references public.client_membership_plans(business_id, id),
  check (ends_at is null or starts_at <= ends_at)
);

insert into public.platform_plans (
  id, slug, name, description, price_cents, max_barbers, max_services,
  max_products, features, active, sort_order
) values (
  '22222222-2222-4222-8222-222222222222',
  'essencial',
  'Essencial',
  'Plano inicial da plataforma. Configure preço e recursos antes de ofertar.',
  null,
  1,
  20,
  0,
  '{"online_booking": true, "multiple_barbers": false, "advanced_reports": false, "client_memberships": false, "product_catalog": false}'::jsonb,
  true,
  0
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'platform_plans', 'businesses', 'business_members', 'barbers',
    'business_hours', 'business_services', 'service_addons',
    'service_promotions', 'barber_services', 'clients', 'sms_verifications',
    'appointments', 'blocked_slots', 'day_notes', 'products',
    'client_membership_plans', 'client_memberships'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end
$$;

grant usage, select on sequence public.appointments_id_seq to service_role;
grant usage, select on sequence public.blocked_slots_id_seq to service_role;
