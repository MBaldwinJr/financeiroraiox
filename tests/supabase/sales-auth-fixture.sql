-- Synthetic structural parity with Lovable Cloud Financeiro Raio-X (2026-11-11).
-- ONLY for a disposable local Supabase. Native auth.uid(), auth.users, roles and PostgREST.
-- Never include real users, company records, seller names or financial amounts.
create type public.app_role as enum ('owner', 'admin', 'member');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'member'::public.app_role,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index idx_company_members_company on public.company_members (company_id);
create index idx_company_members_user on public.company_members (user_id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  seller_code text,
  seller_name text not null,
  net_amount_cents bigint not null default 0,
  returns_cents bigint not null default 0,
  cost_cents bigint not null default 0,
  items_qty integer not null default 0,
  sales_qty integer not null default 0,
  source_file text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, period_start, seller_name)
);
create index sales_company_period_idx on public.sales (company_id, period_start);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = 'public'
as $updated$
begin
  new.updated_at = now();
  return new;
end;
$updated$;
create trigger set_sales_updated_at before update on public.sales
for each row execute function public.set_updated_at();

-- Additional synthetic-only trigger for the forced rollback test.
create function public.synthetic_fail_sales_insert() returns trigger
language plpgsql set search_path = ''
as $synthetic_trigger$
begin
  if new.seller_name = 'ROLLBACK_TEST' then
    raise exception 'synthetic insert failure' using errcode='P0001';
  end if;
  return new;
end;
$synthetic_trigger$;
create trigger synthetic_fail_sales_insert before insert on public.sales
for each row execute function public.synthetic_fail_sales_insert();

create function public.is_company_member(_company_id uuid, _user_id uuid) returns boolean
language sql stable security definer set search_path = 'public'
as $member$
  select case
    when auth.uid() is not null and _user_id is distinct from auth.uid() then false
    else exists (
      select 1 from public.company_members
      where company_id = _company_id and user_id = _user_id
    )
  end;
$member$;
create function public.has_company_role(_company_id uuid, _user_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = 'public'
as $rolecheck$
  select case
    when auth.uid() is not null and _user_id is distinct from auth.uid() then false
    else exists (
      select 1 from public.company_members
      where company_id = _company_id and user_id = _user_id and role = any(_roles)
    )
  end;
$rolecheck$;

grant execute on function public.is_company_member(uuid,uuid) to authenticated;
grant execute on function public.has_company_role(uuid,uuid,public.app_role[]) to authenticated;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.sales enable row level security;

create policy "members read companies" on public.companies for select
  to authenticated using (public.is_company_member(id,auth.uid()));
create policy "owners read own companies" on public.companies for select
  to authenticated using (owner_id=auth.uid());
create policy "users create own companies" on public.companies for insert
  to authenticated with check (owner_id=auth.uid());
create policy "owners update companies" on public.companies for update
  to authenticated using (public.has_company_role(id,auth.uid(),array['owner','admin']::public.app_role[]));
create policy "owners delete companies" on public.companies for delete
  to authenticated using (public.has_company_role(id,auth.uid(),array['owner']::public.app_role[]));

create policy "owners manage members" on public.company_members for all
  to authenticated
  using (public.has_company_role(company_id,auth.uid(),array['owner','admin']::public.app_role[]))
  with check (public.has_company_role(company_id,auth.uid(),array['owner','admin']::public.app_role[]));
create policy "members read company members" on public.company_members for select
  to authenticated using (public.is_company_member(company_id,auth.uid()));
create policy "members read sales" on public.sales for select
  to authenticated using (public.is_company_member(company_id,auth.uid()));
create policy "members write sales" on public.sales for all
  to authenticated
  using (public.is_company_member(company_id,auth.uid()))
  with check (public.is_company_member(company_id,auth.uid()));

grant usage on schema public to authenticated, anon;
grant select on public.companies, public.company_members to authenticated;

-- Deliberately reproduces the present overly broad grants BEFORE the draft.
-- The following migration MUST remove TRUNCATE/DELETE/INSERT/UPDATE/REFERENCES/TRIGGER.
grant all privileges on table public.sales to authenticated, anon;

-- Auth users, companies, members and synthetic sales are seeded after signup
-- by tests/supabase/test_auth_rls.py, not in this file.
