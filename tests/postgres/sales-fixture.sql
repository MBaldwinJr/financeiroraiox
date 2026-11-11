-- Synthetic schema for disposable GitHub Actions PostgreSQL ONLY.
-- No Supabase credentials, production data, network calls or external accounts.
create role anon nologin;
create role authenticated nologin;

create schema auth;
grant usage on schema auth to authenticated, anon;
create function auth.uid() returns uuid
language sql stable set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant execute on function auth.uid() to authenticated;

create type public.app_role as enum ('owner', 'admin', 'member');
create table public.companies (id uuid primary key);
create table public.company_members (
  company_id uuid not null references public.companies(id),
  user_id uuid not null,
  role public.app_role not null,
  unique (company_id, user_id)
);
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
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

create function public.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger set_sales_updated_at before update on public.sales
for each row execute function public.set_updated_at();

-- Force a failure during the post-delete INSERT to test complete rollback.
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

create function public.is_company_member(p_company uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.company_members m
    where m.company_id = p_company and m.user_id = p_user
  );
$$;
grant execute on function public.is_company_member(uuid,uuid) to authenticated;

alter table public.sales enable row level security;
alter table public.company_members enable row level security;
create policy "members read company members" on public.company_members
  for select to authenticated
  using (public.is_company_member(company_id, auth.uid()));
create policy "members read sales" on public.sales
  for select to authenticated
  using (public.is_company_member(company_id, auth.uid()));
create policy "members write sales" on public.sales
  for all to authenticated
  using (public.is_company_member(company_id, auth.uid()))
  with check (public.is_company_member(company_id, auth.uid()));

grant usage on schema public to authenticated, anon;
grant select on public.company_members to authenticated;
grant select, insert, update, delete on public.sales to authenticated;

-- Synthetic company A and B, with owner, admin, member and unrelated user.
insert into public.companies (id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.company_members (company_id, user_id, role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111','owner'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222','admin'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333','member'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444','owner');
insert into public.sales
 (company_id,period_start,period_end,seller_name,net_amount_cents,cost_cents,source_file)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-05-01','2026-05-31','Ana Teste',100000,60000,'old.pdf'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-05-01','2026-05-31','Outra Empresa',90000,40000,'other.pdf');
