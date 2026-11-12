alter table public.business_members
  add column login_email text,
  add column must_change_password boolean not null default true;

alter table public.business_members
  add constraint business_members_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete cascade;

create unique index business_members_single_active_owner_idx
  on public.business_members (business_id)
  where role = 'owner' and active;

create unique index business_members_login_email_unique_idx
  on public.business_members (lower(login_email))
  where login_email is not null;
