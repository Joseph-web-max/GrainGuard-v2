-- GrainGuard V2.0 — multi-organisation and multi-warehouse Supabase schema
-- Run this in the Supabase SQL Editor as project owner before deploying V2.0.
-- Uses the public anon/publishable key in the browser. NEVER expose service_role.
-- Existing V1.2 personal data is migrated into a personal organisation per user.
-- The script uses three explicit transactions: core tenancy migration, organization/warehouse policies, then V2.0 operations and communication extensions.

begin;

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  created_by uuid not null references auth.users(id) on delete restrict,
  personal_workspace boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists organizations_one_personal_workspace
  on public.organizations(created_by) where personal_workspace;

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','operator','viewer')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invite_code uuid not null unique default gen_random_uuid(),
  email text,
  role text not null check (role in ('admin','operator','viewer')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz
);
alter table public.organization_invites drop constraint if exists organization_invites_role_check;
alter table public.organization_invites add constraint organization_invites_role_check check (role in ('admin','operator','viewer'));

-- Core application tables (create on a fresh project, then add tenant key to V1.2).
create table if not exists public.grain_batches (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  crop text not null,
  site text not null,
  quantity_kg numeric default 0,
  stored_on date,
  moisture_pct numeric,
  moisture_method text,
  variety text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.grain_readings (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id text,
  batch_id uuid references public.grain_batches(id) on delete set null,
  recorded_at timestamptz not null,
  grain_temp_c numeric,
  ambient_temp_c numeric,
  ambient_rh_pct numeric,
  co2_ppm numeric,
  grain_moisture_pct numeric,
  battery_v numeric,
  sensor_health text,
  source text not null default 'hardware',
  created_at timestamptz not null default now()
);
create index if not exists grain_readings_user_time on public.grain_readings (user_id, recorded_at desc);
create table if not exists public.grain_moisture_records (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  batch_id uuid references public.grain_batches(id) on delete set null,
  recorded_at timestamptz not null,
  moisture_pct numeric not null,
  method text,
  source text,
  note text,
  sample_ref text,
  created_at timestamptz not null default now()
);
create table if not exists public.lab_validation_records (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sample text not null,
  parameter text,
  device_result text,
  reference_result text,
  method text,
  test_date date,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.emc_profiles (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  crop text not null,
  profile jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.site_settings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text,
  location text,
  lat numeric,
  lon numeric,
  updated_at timestamptz not null default now()
);

-- New tenant columns. Existing records are assigned to the owner's personal workspace below.
alter table public.grain_batches add column if not exists organization_id uuid;
alter table public.grain_readings add column if not exists organization_id uuid;
alter table public.grain_moisture_records add column if not exists organization_id uuid;
alter table public.lab_validation_records add column if not exists organization_id uuid;
alter table public.emc_profiles add column if not exists organization_id uuid;
alter table public.site_settings add column if not exists organization_id uuid;

-- Create one personal organisation for each existing user who has V1.2 records.
insert into public.organizations(name, created_by, personal_workspace)
select coalesce(nullif(trim(u.raw_user_meta_data->>'organization_name'), ''), split_part(coalesce(u.email, 'user'), '@', 1) || ' workspace'),
       u.id, true
from auth.users u
where exists (select 1 from public.grain_batches x where x.user_id=u.id and x.organization_id is null)
   or exists (select 1 from public.grain_readings x where x.user_id=u.id and x.organization_id is null)
   or exists (select 1 from public.grain_moisture_records x where x.user_id=u.id and x.organization_id is null)
   or exists (select 1 from public.lab_validation_records x where x.user_id=u.id and x.organization_id is null)
   or exists (select 1 from public.emc_profiles x where x.user_id=u.id and x.organization_id is null)
   or exists (select 1 from public.site_settings x where x.user_id=u.id and x.organization_id is null)
on conflict (created_by) where personal_workspace do nothing;

insert into public.organization_members(organization_id, user_id, role)
select id, created_by, 'owner' from public.organizations where personal_workspace
on conflict (organization_id, user_id) do nothing;

update public.grain_batches t set organization_id=o.id from public.organizations o where t.organization_id is null and o.created_by=t.user_id and o.personal_workspace;
update public.grain_readings t set organization_id=o.id from public.organizations o where t.organization_id is null and o.created_by=t.user_id and o.personal_workspace;
update public.grain_moisture_records t set organization_id=o.id from public.organizations o where t.organization_id is null and o.created_by=t.user_id and o.personal_workspace;
update public.lab_validation_records t set organization_id=o.id from public.organizations o where t.organization_id is null and o.created_by=t.user_id and o.personal_workspace;
update public.emc_profiles t set organization_id=o.id from public.organizations o where t.organization_id is null and o.created_by=t.user_id and o.personal_workspace;
update public.site_settings t set organization_id=o.id from public.organizations o where t.organization_id is null and o.created_by=t.user_id and o.personal_workspace;

-- If a pre-existing table has records without a corresponding user, stop rather than silently orphan them.
do $$
begin
  if exists (select 1 from public.grain_batches where organization_id is null)
  or exists (select 1 from public.grain_readings where organization_id is null)
  or exists (select 1 from public.grain_moisture_records where organization_id is null)
  or exists (select 1 from public.lab_validation_records where organization_id is null)
  or exists (select 1 from public.emc_profiles where organization_id is null)
  or exists (select 1 from public.site_settings where organization_id is null) then
    raise exception 'GrainGuard migration stopped: a legacy record could not be assigned to a personal workspace. Review user_id values before rerunning.';
  end if;
end $$;

alter table public.grain_batches alter column organization_id set not null;
alter table public.grain_readings alter column organization_id set not null;
alter table public.grain_moisture_records alter column organization_id set not null;
alter table public.lab_validation_records alter column organization_id set not null;
alter table public.emc_profiles alter column organization_id set not null;
alter table public.site_settings alter column organization_id set not null;

-- Indexes for tenant-scoped reads used by the organisation dashboard.
create index if not exists grain_batches_org_created on public.grain_batches(organization_id, created_at desc);
create index if not exists grain_readings_org_time on public.grain_readings(organization_id, recorded_at desc);
create index if not exists grain_moisture_org_time on public.grain_moisture_records(organization_id, recorded_at desc);
create index if not exists grain_lab_org_created on public.lab_validation_records(organization_id, created_at desc);

-- A record cannot be reassigned to another organisation after creation.
create or replace function public.grain_prevent_org_reassignment()
returns trigger language plpgsql set search_path=public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A GrainGuard record cannot be moved between organisations';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'The original record creator cannot be reassigned';
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['grain_batches','grain_readings','grain_moisture_records','lab_validation_records','emc_profiles','site_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_org_immutable', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.grain_prevent_org_reassignment()', t||'_org_immutable', t);
  end loop;
end $$;

-- A batch reference must belong to the same organisation as its child record.
-- The original ON DELETE SET NULL foreign keys are retained; these triggers add tenant validation.
create or replace function public.grain_guard_batch_tenant()
returns trigger language plpgsql set search_path=public
as $$
declare v_batch_org uuid;
begin
  if new.batch_id is null then return new; end if;
  select organization_id into v_batch_org from public.grain_batches where id=new.batch_id;
  if v_batch_org is null or v_batch_org<>new.organization_id then
    raise exception 'Batch reference must belong to the same GrainGuard organisation';
  end if;
  return new;
end $$;
drop trigger if exists grain_readings_batch_tenant_guard on public.grain_readings;
create trigger grain_readings_batch_tenant_guard before insert or update of batch_id,organization_id
  on public.grain_readings for each row execute function public.grain_guard_batch_tenant();
drop trigger if exists grain_moisture_batch_tenant_guard on public.grain_moisture_records;
create trigger grain_moisture_batch_tenant_guard before insert or update of batch_id,organization_id
  on public.grain_moisture_records for each row execute function public.grain_guard_batch_tenant();

-- Organisation-scoped natural keys replace V1.2 user-scoped keys.
alter table public.emc_profiles drop constraint if exists emc_profiles_pkey;
alter table public.emc_profiles add constraint emc_profiles_pkey primary key (organization_id, crop);
alter table public.site_settings drop constraint if exists site_settings_pkey;
alter table public.site_settings add constraint site_settings_pkey primary key (organization_id);

-- Tenant foreign keys. Check names before creating to keep this script rerunnable.
do $$
declare t text;
begin
  foreach t in array array['grain_batches','grain_readings','grain_moisture_records','lab_validation_records','emc_profiles','site_settings'] loop
    if not exists (select 1 from pg_constraint where conname=t||'_organization_fk') then
      execute format('alter table public.%I add constraint %I foreign key (organization_id) references public.organizations(id) on delete cascade', t, t||'_organization_fk');
    end if;
  end loop;
end $$;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_events_org_time on public.audit_events(organization_id, occurred_at desc);

-- Role helpers use SECURITY DEFINER to avoid recursive RLS on organization_members.
create or replace function public.is_grain_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path=public,auth
as $$ select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=auth.uid()) $$;

create or replace function public.grain_org_has_role(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path=public,auth
as $$ select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=auth.uid() and m.role=any(p_roles)) $$;

create or replace function public.create_grain_organization(p_name text)
returns uuid language plpgsql security definer set search_path=public,auth
as $$
declare v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Sign in before creating an organisation'; end if;
  v_name := trim(coalesce(p_name,''));
  if char_length(v_name)<2 or char_length(v_name)>100 then raise exception 'Organisation name must be 2–100 characters'; end if;
  insert into public.organizations(name,created_by) values(v_name,auth.uid()) returning id into v_id;
  insert into public.organization_members(organization_id,user_id,role) values(v_id,auth.uid(),'owner');
  return v_id;
end $$;

create or replace function public.create_grain_invite(p_org_id uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path=public,auth
as $$
declare v_code uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.grain_org_has_role(p_org_id,array['owner','admin']) then raise exception 'Only an organisation owner or admin can invite members'; end if;
  if p_role not in ('admin','operator','viewer') then raise exception 'Invite role must be admin, operator or viewer'; end if;
  if p_role='admin' and not public.grain_org_has_role(p_org_id,array['owner']) then raise exception 'Only the organisation owner can invite an admin'; end if;
  v_email := nullif(lower(trim(coalesce(p_email,''))), '');
  if v_email is null or position('@' in v_email)<2 then raise exception 'Enter a valid invitee email address'; end if;
  insert into public.organization_invites(organization_id,email,role,created_by,expires_at)
  values(p_org_id,v_email,p_role,auth.uid(),now()+interval '7 days') returning invite_code into v_code;
  return v_code;
end $$;

create or replace function public.accept_grain_invite(p_invite_code uuid)
returns uuid language plpgsql security definer set search_path=public,auth
as $$
declare v_inv public.organization_invites%rowtype; v_email text;
begin
  if auth.uid() is null then raise exception 'Sign in before accepting an invitation'; end if;
  v_email := lower(coalesce(auth.jwt()->>'email',''));
  select * into v_inv from public.organization_invites
   where invite_code=p_invite_code and accepted_at is null and expires_at>now() for update;
  if not found then raise exception 'Invitation is invalid, expired or already used'; end if;
  if v_inv.email is not null and v_inv.email<>v_email then raise exception 'This invitation was issued to a different email address'; end if;
  insert into public.organization_members(organization_id,user_id,role)
  values(v_inv.organization_id,auth.uid(),v_inv.role)
  on conflict (organization_id,user_id) do nothing;
  update public.organization_invites set accepted_by=auth.uid(),accepted_at=now() where id=v_inv.id;
  return v_inv.organization_id;
end $$;

create or replace function public.remove_grain_member(p_org_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth
as $$
declare v_actor_role text; v_target_role text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select role into v_actor_role from public.organization_members
    where organization_id=p_org_id and user_id=auth.uid();
  select role into v_target_role from public.organization_members
    where organization_id=p_org_id and user_id=p_user_id;
  if v_target_role is null then raise exception 'Member not found in this organisation'; end if;
  if v_target_role='owner' then raise exception 'The organisation owner cannot be removed'; end if;
  if v_actor_role='owner' then
    delete from public.organization_members where organization_id=p_org_id and user_id=p_user_id;
  elsif v_actor_role='admin' and v_target_role in ('operator','viewer') then
    delete from public.organization_members where organization_id=p_org_id and user_id=p_user_id;
  else
    raise exception 'Only an owner or authorised admin can remove this member';
  end if;
  return true;
end $$;

-- Return member emails only to organisation owners/admins; ordinary operators/viewers see role and ID only.
create or replace function public.list_grain_members(p_org_id uuid)
returns table(user_id uuid, role text, joined_at timestamptz, email text)
language plpgsql security definer set search_path=public,auth
as $$
declare v_can_view_email boolean;
begin
  if auth.uid() is null or not public.is_grain_org_member(p_org_id) then
    raise exception 'You are not a member of this organisation';
  end if;
  v_can_view_email := public.grain_org_has_role(p_org_id,array['owner','admin']);
  return query
    select m.user_id,m.role,m.joined_at,
           case when v_can_view_email then u.email else null end::text
      from public.organization_members m
      left join auth.users u on u.id=m.user_id
     where m.organization_id=p_org_id
     order by m.joined_at asc;
end $$;
revoke all on function public.list_grain_members(uuid) from public,anon;
grant execute on function public.list_grain_members(uuid) to authenticated;

-- RLS: all members can read; only owner/admin/operator can write operational records.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations for select to authenticated using (public.is_grain_org_member(id));
drop policy if exists organizations_admin_update on public.organizations;
-- Organisation metadata is changed only through approved owner-only RPCs; no direct update policy is granted.
drop policy if exists org_members_member_read on public.organization_members;
create policy org_members_member_read on public.organization_members for select to authenticated using (public.is_grain_org_member(organization_id));
-- Memberships/invites are changed only by the SECURITY DEFINER RPCs above.
drop policy if exists audit_events_member_read on public.audit_events;
create policy audit_events_member_read on public.audit_events for select to authenticated using (public.is_grain_org_member(organization_id));
drop policy if exists audit_events_operator_insert on public.audit_events;
create policy audit_events_operator_insert on public.audit_events for insert to authenticated with check (actor_id=auth.uid() and public.grain_org_has_role(organization_id,array['owner','admin','operator']));

-- Replace all V1.2 per-user policies with tenant-aware role policies.
do $$
declare t text;
begin
  foreach t in array array['grain_batches','grain_readings','grain_moisture_records','lab_validation_records','emc_profiles','site_settings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "%1$s_owner_all" on public.%1$I',t);
    execute format('drop policy if exists "%1$s_org_read" on public.%1$I',t);
    execute format('drop policy if exists "%1$s_org_insert" on public.%1$I',t);
    execute format('drop policy if exists "%1$s_org_update" on public.%1$I',t);
    execute format('drop policy if exists "%1$s_org_delete" on public.%1$I',t);
    execute format('create policy "%1$s_org_read" on public.%1$I for select to authenticated using (public.is_grain_org_member(organization_id))',t);
    execute format('create policy "%1$s_org_insert" on public.%1$I for insert to authenticated with check (user_id=auth.uid() and public.grain_org_has_role(organization_id,array[''owner'',''admin'',''operator'']))',t);
    execute format('create policy "%1$s_org_update" on public.%1$I for update to authenticated using (public.grain_org_has_role(organization_id,array[''owner'',''admin'',''operator''])) with check (public.grain_org_has_role(organization_id,array[''owner'',''admin'',''operator'']))',t);
    execute format('create policy "%1$s_org_delete" on public.%1$I for delete to authenticated using (public.grain_org_has_role(organization_id,array[''owner'',''admin'',''operator'']))',t);
  end loop;
end $$;

-- RPC access: authenticated users only. Helpers remain internal to RLS and RPCs.
revoke all on function public.create_grain_organization(text) from public;
revoke all on function public.create_grain_invite(uuid,text,text) from public;
revoke all on function public.accept_grain_invite(uuid) from public;
revoke all on function public.remove_grain_member(uuid,uuid) from public;
grant execute on function public.create_grain_organization(text) to authenticated;
grant execute on function public.create_grain_invite(uuid,text,text) to authenticated;
grant execute on function public.accept_grain_invite(uuid) to authenticated;
grant execute on function public.remove_grain_member(uuid,uuid) to authenticated;
revoke all on function public.is_grain_org_member(uuid) from public;
revoke all on function public.grain_org_has_role(uuid,text[]) from public;
grant execute on function public.is_grain_org_member(uuid) to authenticated;
grant execute on function public.grain_org_has_role(uuid,text[]) to authenticated;

-- Enable realtime for operational changes; safe to rerun.
do $$
begin
  alter publication supabase_realtime add table public.grain_readings;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.grain_batches;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.audit_events;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- Important: configure Supabase Auth email confirmation, password policy, SMTP and allowed redirect URLs
-- in the Supabase dashboard. Invitation codes expire after 7 days and are bound to the invited email.

commit;

-- ============================================================================
-- GrainGuard V2.0 organisation operations extension
-- Adds multi-warehouse/site management, community intake and provider channels.
-- Safe to rerun after the V1.3 schema has been installed successfully.
-- ============================================================================
begin;

alter table public.organizations
  add column if not exists public_reporting_enabled boolean not null default false,
  add column if not exists public_contact_name text,
  add column if not exists country_code text;
alter table public.organizations alter column public_reporting_enabled set default false;

create or replace function public.set_grain_public_reporting(p_org_id uuid,p_enabled boolean,p_contact_name text default null)
returns void language plpgsql security definer set search_path=public,auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.grain_org_has_role(p_org_id,array['owner','admin']) then
    raise exception 'Only an organisation owner or admin can manage public reporting';
  end if;
  update public.organizations
     set public_reporting_enabled=coalesce(p_enabled,false),
         public_contact_name=nullif(left(trim(coalesce(p_contact_name,'')),120),'')
   where id=p_org_id;
  if not found then raise exception 'Organisation not found'; end if;
end $$;
revoke all on function public.set_grain_public_reporting(uuid,boolean,text) from public,anon;
grant execute on function public.set_grain_public_reporting(uuid,boolean,text) to authenticated;

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null check (char_length(trim(name)) between 2 and 120),
  country_code text,
  region text,
  city text,
  address text,
  timezone text not null default 'UTC',
  latitude numeric,
  longitude numeric,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text not null default 'active' check (status in ('active','inactive','maintenance')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);
create unique index if not exists warehouses_one_default_per_org
  on public.warehouses(organization_id) where is_default;
create index if not exists warehouses_org_status on public.warehouses(organization_id,status,name);

-- New organisations automatically receive one default warehouse. Existing organisations
-- are backfilled immediately below; this trigger covers organisations created afterwards.
create or replace function public.grain_create_default_warehouse()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.warehouses(organization_id,code,name,timezone,is_default)
  values(new.id,'MAIN',left(new.name||' Main Warehouse',120),'UTC',true)
  on conflict (organization_id,code) do nothing;
  return new;
end $$;
drop trigger if exists grain_organization_default_warehouse on public.organizations;
create trigger grain_organization_default_warehouse after insert on public.organizations
for each row execute function public.grain_create_default_warehouse();

-- One default warehouse is created for every existing organisation. Legacy site labels
-- are preserved as additional warehouse records and legacy rows are attached below.
insert into public.warehouses(organization_id,code,name,timezone,is_default)
select o.id,'MAIN',coalesce(nullif(trim(s.name),''),o.name||' Main Warehouse'),'UTC',true
from public.organizations o
left join public.site_settings s on s.organization_id=o.id
where not exists(select 1 from public.warehouses w where w.organization_id=o.id and w.is_default)
on conflict (organization_id,code) do update set is_default=true, updated_at=now();

insert into public.warehouses(organization_id,code,name,is_default)
select distinct b.organization_id,
       'SITE-'||upper(substr(md5(b.organization_id::text||'|'||lower(trim(b.site))),1,10)),
       left(trim(b.site),120),false
from public.grain_batches b
where nullif(trim(b.site),'') is not null
  and not exists(select 1 from public.warehouses w where w.organization_id=b.organization_id and lower(trim(w.name))=lower(trim(b.site)))
on conflict (organization_id,code) do nothing;

alter table public.grain_batches add column if not exists warehouse_id uuid;
alter table public.grain_readings add column if not exists warehouse_id uuid;
alter table public.grain_moisture_records add column if not exists warehouse_id uuid;
alter table public.lab_validation_records add column if not exists warehouse_id uuid;

update public.grain_batches b set warehouse_id=w.id
from public.warehouses w
where b.warehouse_id is null and w.organization_id=b.organization_id
  and lower(trim(w.name))=lower(trim(b.site));
update public.grain_batches b set warehouse_id=w.id
from public.warehouses w where b.warehouse_id is null and w.organization_id=b.organization_id and w.is_default;
update public.grain_readings r
set warehouse_id=coalesce(
  (select b.warehouse_id from public.grain_batches b where b.id=r.batch_id and b.organization_id=r.organization_id),
  (select w.id from public.warehouses w where w.organization_id=r.organization_id and w.is_default limit 1)
)
where r.warehouse_id is null;
update public.grain_moisture_records m
set warehouse_id=coalesce(
  (select b.warehouse_id from public.grain_batches b where b.id=m.batch_id and b.organization_id=m.organization_id),
  (select w.id from public.warehouses w where w.organization_id=m.organization_id and w.is_default limit 1)
)
where m.warehouse_id is null;
update public.lab_validation_records l set warehouse_id=w.id
from public.warehouses w where l.warehouse_id is null and w.organization_id=l.organization_id and w.is_default;

alter table public.grain_batches alter column warehouse_id set not null;
alter table public.grain_readings alter column warehouse_id set not null;
alter table public.grain_moisture_records alter column warehouse_id set not null;
alter table public.lab_validation_records alter column warehouse_id set not null;

do $$
declare t text;
begin
  foreach t in array array['grain_batches','grain_readings','grain_moisture_records','lab_validation_records'] loop
    if not exists(select 1 from pg_constraint where conname=t||'_warehouse_fk') then
      execute format('alter table public.%I add constraint %I foreign key (organization_id,warehouse_id) references public.warehouses(organization_id,id) on delete restrict',t,t||'_warehouse_fk');
    end if;
  end loop;
end $$;
create index if not exists grain_batches_org_warehouse on public.grain_batches(organization_id,warehouse_id,created_at desc);
create index if not exists grain_readings_org_warehouse_time on public.grain_readings(organization_id,warehouse_id,recorded_at desc);
create index if not exists grain_moisture_org_warehouse_time on public.grain_moisture_records(organization_id,warehouse_id,recorded_at desc);
create index if not exists grain_lab_org_warehouse_time on public.lab_validation_records(organization_id,warehouse_id,created_at desc);

create table if not exists public.warehouse_members (
  organization_id uuid not null,
  warehouse_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  site_role text not null default 'operator' check (site_role in ('manager','operator','viewer')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (warehouse_id,user_id),
  foreign key (organization_id,warehouse_id) references public.warehouses(organization_id,id) on delete cascade,
  foreign key (organization_id,user_id) references public.organization_members(organization_id,user_id) on delete cascade
);
create index if not exists warehouse_members_org_user on public.warehouse_members(organization_id,user_id);

create or replace function public.grain_can_access_warehouse(p_org uuid,p_warehouse uuid)
returns boolean language sql stable security definer set search_path=public,auth
as $$
  select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=auth.uid())
  and (
    public.grain_org_has_role(p_org,array['owner','admin'])
    -- Before the organisation enables site assignments, members retain organisation access.
    -- Once any assignments exist, every non-admin must be assigned to at least one site.
    or not exists(select 1 from public.warehouse_members wm where wm.organization_id=p_org)
    or exists(select 1 from public.warehouse_members wm where wm.organization_id=p_org and wm.user_id=auth.uid() and wm.warehouse_id=p_warehouse)
  )
$$;

-- Old clients which do not yet send warehouse_id are safely placed in the default site.
create or replace function public.grain_assign_default_warehouse()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if new.warehouse_id is not null then return new; end if;
  if tg_table_name in ('grain_readings','grain_moisture_records') then
    execute 'select warehouse_id from public.grain_batches where id=$1 and organization_id=$2' into v_id using new.batch_id,new.organization_id;
  end if;
  if v_id is null then select id into v_id from public.warehouses where organization_id=new.organization_id and is_default limit 1; end if;
  if v_id is null then raise exception 'No default GrainGuard warehouse exists for this organisation'; end if;
  new.warehouse_id:=v_id;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['grain_batches','grain_readings','grain_moisture_records','lab_validation_records'] loop
    execute format('drop trigger if exists %I on public.%I',t||'_default_warehouse',t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.grain_assign_default_warehouse()',t||'_default_warehouse',t);
  end loop;
end $$;

create or replace function public.grain_guard_warehouse_tenant()
returns trigger language plpgsql set search_path=public
as $$
begin
  if not exists(select 1 from public.warehouses w where w.id=new.warehouse_id and w.organization_id=new.organization_id) then
    raise exception 'Warehouse must belong to the same GrainGuard organisation';
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['grain_batches','grain_readings','grain_moisture_records','lab_validation_records'] loop
    execute format('drop trigger if exists %I on public.%I',t||'_warehouse_tenant_guard',t);
    execute format('create trigger %I before insert or update of warehouse_id,organization_id on public.%I for each row execute function public.grain_guard_warehouse_tenant()',t||'_warehouse_tenant_guard',t);
  end loop;
end $$;

create table if not exists public.communication_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_type text not null check (channel_type in ('ussd','email','sms','meta','telegram','social_links')),
  display_name text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  connection_state text not null default 'not_configured' check (connection_state in ('not_configured','saved','awaiting_provider','connected','error','disabled')),
  last_message_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (organization_id,channel_type)
);
create index if not exists communication_channels_org on public.communication_channels(organization_id,channel_type);

-- Encrypted credentials are only readable by the Edge Function using the service key.
create table if not exists public.integration_secrets (
  channel_id uuid primary key references public.communication_channels(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  encrypted_payload text not null,
  key_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid,
  reference_code text not null,
  source text not null check (source in ('website','ussd','email','sms','whatsapp','facebook','instagram','telegram','x','staff')),
  external_message_id text,
  sender_name text,
  sender_contact text,
  sender_email text,
  subject text,
  category text not null default 'general',
  message text not null check (char_length(message) between 3 and 8000),
  location_text text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'new' check (status in ('new','triaged','assigned','investigating','resolved','closed','rejected')),
  assigned_to uuid references auth.users(id) on delete set null,
  attachment_urls text[] not null default '{}',
  public_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (organization_id,reference_code),
  foreign key (organization_id,warehouse_id) references public.warehouses(organization_id,id) on delete restrict
);
create unique index if not exists community_reports_external_unique
  on public.community_reports(organization_id,source,external_message_id) where external_message_id is not null;
create index if not exists community_reports_org_status_time on public.community_reports(organization_id,status,created_at desc);
create index if not exists community_reports_org_warehouse on public.community_reports(organization_id,warehouse_id,created_at desc);

create table if not exists public.community_report_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.community_reports(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  update_type text not null check (update_type in ('note','status','assignment','reply','system')),
  message text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists community_report_updates_report on public.community_report_updates(report_id,created_at);
-- An update record must reference a report in the same tenant, not merely any report UUID.
create unique index if not exists community_reports_org_id_id on public.community_reports(organization_id,id);
do $$
begin
  if not exists(select 1 from pg_constraint where conname='community_report_updates_same_org_fk') then
    alter table public.community_report_updates
      add constraint community_report_updates_same_org_fk
      foreign key (organization_id,report_id)
      references public.community_reports(organization_id,id) on delete cascade;
  end if;
end $$;

create table if not exists public.community_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_event_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null,
  external_message_id text not null,
  received_at timestamptz not null default now(),
  unique(organization_id,source,external_message_id)
);

-- RLS for operational site records.
alter table public.warehouses enable row level security;
alter table public.warehouse_members enable row level security;
alter table public.communication_channels enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_report_updates enable row level security;
alter table public.community_rate_limits enable row level security;
alter table public.webhook_event_receipts enable row level security;

 drop policy if exists warehouses_member_read on public.warehouses;
create policy warehouses_member_read on public.warehouses for select to authenticated
using (public.grain_can_access_warehouse(organization_id,id));
drop policy if exists warehouses_admin_insert on public.warehouses;
create policy warehouses_admin_insert on public.warehouses for insert to authenticated
with check (public.grain_org_has_role(organization_id,array['owner','admin']));
drop policy if exists warehouses_admin_update on public.warehouses;
create policy warehouses_admin_update on public.warehouses for update to authenticated
using (public.grain_org_has_role(organization_id,array['owner','admin'])) with check (public.grain_org_has_role(organization_id,array['owner','admin']));
drop policy if exists warehouses_admin_delete on public.warehouses;
create policy warehouses_admin_delete on public.warehouses for delete to authenticated
using (public.grain_org_has_role(organization_id,array['owner','admin']) and not is_default);

drop policy if exists warehouse_members_admin_read on public.warehouse_members;
create policy warehouse_members_admin_read on public.warehouse_members for select to authenticated
using (user_id=auth.uid() or public.grain_org_has_role(organization_id,array['owner','admin']));
drop policy if exists warehouse_members_admin_write on public.warehouse_members;
create policy warehouse_members_admin_write on public.warehouse_members for all to authenticated
using (public.grain_org_has_role(organization_id,array['owner','admin']))
with check (public.grain_org_has_role(organization_id,array['owner','admin']));

drop policy if exists channels_member_read on public.communication_channels;
create policy channels_member_read on public.communication_channels for select to authenticated
using (public.is_grain_org_member(organization_id));
drop policy if exists channels_admin_insert on public.communication_channels;
create policy channels_admin_insert on public.communication_channels for insert to authenticated
with check (public.grain_org_has_role(organization_id,array['owner','admin']));
drop policy if exists channels_admin_update on public.communication_channels;
create policy channels_admin_update on public.communication_channels for update to authenticated
using (public.grain_org_has_role(organization_id,array['owner','admin']))
with check (public.grain_org_has_role(organization_id,array['owner','admin']));
drop policy if exists channels_admin_delete on public.communication_channels;
create policy channels_admin_delete on public.communication_channels for delete to authenticated
using (public.grain_org_has_role(organization_id,array['owner','admin']));

-- Explicit app-role grants; RLS below determines which organisation rows are visible.
grant select,insert,update,delete on public.warehouses to authenticated;
grant select,insert,update,delete on public.warehouse_members to authenticated;
grant select,insert,update,delete on public.communication_channels to authenticated;
grant select,insert,update,delete on public.community_reports to authenticated;
grant select,insert on public.community_report_updates to authenticated;
grant select on public.organizations,public.organization_members,public.audit_events to authenticated;
grant insert on public.audit_events to authenticated;

-- Explicit grants for the Edge Function's service-role client. RLS is bypassed by
-- service_role, while browser roles remain constrained by the policies below.
grant select,insert,update,delete on public.organizations,public.organization_members,public.warehouses,
  public.warehouse_members,public.communication_channels,public.integration_secrets,
  public.community_reports,public.community_report_updates,public.community_rate_limits,
  public.webhook_event_receipts to service_role;

-- No browser role can query or mutate provider secrets, rate limits or webhook receipts.
revoke all on public.integration_secrets from anon,authenticated;
revoke all on public.community_rate_limits from anon,authenticated;
revoke all on public.webhook_event_receipts from anon,authenticated;

drop policy if exists community_reports_member_read on public.community_reports;
create policy community_reports_member_read on public.community_reports for select to authenticated
using (public.grain_can_access_warehouse(organization_id,warehouse_id) or (warehouse_id is null and public.is_grain_org_member(organization_id)));
drop policy if exists community_reports_operator_insert on public.community_reports;
create policy community_reports_operator_insert on public.community_reports for insert to authenticated
with check (public.grain_org_has_role(organization_id,array['owner','admin','operator']) and (warehouse_id is null or public.grain_can_access_warehouse(organization_id,warehouse_id)));
drop policy if exists community_reports_operator_update on public.community_reports;
create policy community_reports_operator_update on public.community_reports for update to authenticated
using (public.grain_org_has_role(organization_id,array['owner','admin','operator']) and (warehouse_id is null or public.grain_can_access_warehouse(organization_id,warehouse_id)))
with check (public.grain_org_has_role(organization_id,array['owner','admin','operator']) and (warehouse_id is null or public.grain_can_access_warehouse(organization_id,warehouse_id)));
drop policy if exists community_reports_admin_delete on public.community_reports;
create policy community_reports_admin_delete on public.community_reports for delete to authenticated
using (public.grain_org_has_role(organization_id,array['owner','admin']));

drop policy if exists community_updates_member_read on public.community_report_updates;
create policy community_updates_member_read on public.community_report_updates for select to authenticated
using (
  public.is_grain_org_member(organization_id)
  and exists (
    select 1 from public.community_reports r
    where r.id=community_report_updates.report_id
      and r.organization_id=community_report_updates.organization_id
      and (r.warehouse_id is null or public.grain_can_access_warehouse(r.organization_id,r.warehouse_id))
  )
);
drop policy if exists community_updates_operator_insert on public.community_report_updates;
create policy community_updates_operator_insert on public.community_report_updates for insert to authenticated
with check (
  actor_id=auth.uid()
  and public.grain_org_has_role(organization_id,array['owner','admin','operator'])
  and exists (
    select 1 from public.community_reports r
    where r.id=community_report_updates.report_id
      and r.organization_id=community_report_updates.organization_id
      and (r.warehouse_id is null or public.grain_can_access_warehouse(r.organization_id,r.warehouse_id))
  )
);

-- Re-scope core operational reads and writes by assigned warehouse.
do $$
declare t text;
begin
  foreach t in array array['grain_batches','grain_readings','grain_moisture_records','lab_validation_records'] loop
    execute format('drop policy if exists "%1$s_org_read" on public.%1$I',t);
    execute format('create policy "%1$s_org_read" on public.%1$I for select to authenticated using (public.grain_can_access_warehouse(organization_id,warehouse_id))',t);
    execute format('drop policy if exists "%1$s_org_insert" on public.%1$I',t);
    execute format('create policy "%1$s_org_insert" on public.%1$I for insert to authenticated with check (user_id=auth.uid() and public.grain_org_has_role(organization_id,array[''owner'',''admin'',''operator'']) and public.grain_can_access_warehouse(organization_id,warehouse_id))',t);
    execute format('drop policy if exists "%1$s_org_update" on public.%1$I',t);
    execute format('create policy "%1$s_org_update" on public.%1$I for update to authenticated using (public.grain_org_has_role(organization_id,array[''owner'',''admin'',''operator'']) and public.grain_can_access_warehouse(organization_id,warehouse_id)) with check (public.grain_org_has_role(organization_id,array[''owner'',''admin'',''operator'']) and public.grain_can_access_warehouse(organization_id,warehouse_id))',t);
    execute format('drop policy if exists "%1$s_org_delete" on public.%1$I',t);
    execute format('create policy "%1$s_org_delete" on public.%1$I for delete to authenticated using (public.grain_org_has_role(organization_id,array[''owner'',''admin'',''operator'']) and public.grain_can_access_warehouse(organization_id,warehouse_id))',t);
  end loop;
end $$;

-- Restrict public intake to the Edge Function only. Edge functions use the service key
-- and must validate organisation settings, payload, abuse limits and provider signatures.
revoke all on public.community_reports from anon;
revoke all on public.community_report_updates from anon;
revoke all on public.communication_channels from anon;

revoke all on function public.grain_can_access_warehouse(uuid,uuid) from public;
grant execute on function public.grain_can_access_warehouse(uuid,uuid) to authenticated;

-- Multi-warehouse headquarters view: publish operational updates from every site.
-- This block is intentionally after the site/report tables are created above.
do $$
declare t text;
begin
  foreach t in array array['grain_moisture_records','lab_validation_records','warehouses','warehouse_members','community_reports'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I',t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

commit;

-- Public reporting rate control is atomic and callable by the Edge Function only.
begin;
create or replace function public.grain_consume_community_rate_limit(p_rate_key text,p_max_hits integer default 12)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_hits integer;
begin
  insert into public.community_rate_limits(rate_key,window_started_at,hit_count,updated_at)
  values(p_rate_key,now(),1,now())
  on conflict(rate_key) do update set
    hit_count=case when public.community_rate_limits.window_started_at<now()-interval '1 hour' then 1 else public.community_rate_limits.hit_count+1 end,
    window_started_at=case when public.community_rate_limits.window_started_at<now()-interval '1 hour' then now() else public.community_rate_limits.window_started_at end,
    updated_at=now()
  returning hit_count into v_hits;
  return v_hits<=greatest(1,least(p_max_hits,100));
end $$;
revoke all on function public.grain_consume_community_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.grain_consume_community_rate_limit(text,integer) to service_role;
commit;
