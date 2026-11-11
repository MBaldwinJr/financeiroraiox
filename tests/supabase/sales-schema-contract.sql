-- This test runs ONLY on a disposable local Supabase after the DDL draft.
-- Expected structure comes from read-only Lovable Cloud catalog inspection.
-- Do NOT run the test (or the proposed DDL) against the hosted database.
\set ON_ERROR_STOP on

do $verify_schema$
declare
  v_sales_columns text;
  v_constraint_count integer;
  v_indexes text[];
begin
  select string_agg(a.attname,',' order by a.attnum)
  into v_sales_columns
  from pg_attribute a
  where a.attrelid = 'public.sales'::regclass
    and a.attnum > 0 and not a.attisdropped;
  if v_sales_columns <> 'id,company_id,period_start,period_end,seller_code,seller_name,net_amount_cents,returns_cents,cost_cents,items_qty,sales_qty,source_file,imported_at,created_at,updated_at,deleted_at' then
    raise exception 'Schema drift: sales column ordering/selection changed: %',v_sales_columns;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='companies'
      and column_name='owner_id' and is_nullable='NO'
  ) then
    raise exception 'Schema drift: companies.owner_id is missing';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.companies'::regclass
      and c.conname='companies_owner_id_fkey'
      and c.confrelid='auth.users'::regclass
  ) then
    raise exception 'Schema drift: company owner FK to real auth.users absent';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.company_members'::regclass
      and c.conname='company_members_user_id_fkey'
      and c.confrelid='auth.users'::regclass
  ) then
    raise exception 'Schema drift: member FK to real auth.users absent';
  end if;

  select count(*) into v_constraint_count from pg_constraint c
  where c.conrelid='public.sales'::regclass
    and c.conname in ('sales_pkey','sales_company_id_fkey',
      'sales_company_id_period_start_seller_name_key');
  if v_constraint_count <> 3 then
    raise exception 'Schema drift: sales constraints do not match production';
  end if;
  select array_agg(indexname order by indexname) into v_indexes
  from pg_indexes where schemaname='public' and tablename='sales'
    and indexname <> 'sales_pkey';
  if v_indexes <> array['sales_company_id_period_start_seller_name_key','sales_company_period_idx'] then
    raise exception 'Schema drift: sales indexes unexpected: %',v_indexes;
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.sales'::regclass
      and tgname='set_sales_updated_at' and not tgisinternal
  ) then
    raise exception 'Schema drift: original updated_at trigger missing';
  end if;
  if not exists (
    select 1 from pg_class c
    where c.oid='public.sales'::regclass and c.relrowsecurity=true
  ) then
    raise exception 'RLS disabled on sales';
  end if;
  if (select count(*) from pg_policies
      where schemaname='public' and tablename='sales') <> 1 or
     not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='sales'
        and policyname='members read sales' and cmd='SELECT'
     ) then
    raise exception 'sales RLS policies not hardened as expected';
  end if;

  if not has_table_privilege('authenticated','public.sales','SELECT')
      or has_table_privilege('authenticated','public.sales','INSERT')
      or has_table_privilege('authenticated','public.sales','UPDATE')
      or has_table_privilege('authenticated','public.sales','DELETE')
      or has_table_privilege('authenticated','public.sales','TRUNCATE')
      or has_table_privilege('authenticated','public.sales','REFERENCES')
      or has_table_privilege('authenticated','public.sales','TRIGGER')
      or has_table_privilege('anon','public.sales','SELECT')
      or has_table_privilege('anon','public.sales','TRUNCATE') then
    raise exception 'Critical: anon/authenticated table privileges still too broad';
  end if;

  if not exists (
     select 1 from pg_namespace where nspname='finance_internal'
  ) or not exists (
     select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='finance_internal' and c.relname='sales_month_revisions'
       and c.relrowsecurity
  ) then
    raise exception 'Audit schema or defense-in-depth RLS is absent';
  end if;
  raise notice 'Schema parity and grant lockdown: PASS';
end;
$verify_schema$;

-- Verify TRUNCATE is actually forbidden for both roles, not merely hidden by RLS.
set role authenticated;
do $authenticated_truncate$
begin
  if has_table_privilege(current_user,'public.sales','TRUNCATE') then
    raise exception 'Authenticated role retained TRUNCATE';
  end if;
  begin
    execute 'TRUNCATE TABLE public.sales';
    raise exception 'Authenticated role unexpectedly truncated sales';
  exception when insufficient_privilege then null;
  end;
end;
$authenticated_truncate$;
reset role;

set role anon;
do $anon_truncate$
begin
  if has_table_privilege(current_user,'public.sales','TRUNCATE') then
    raise exception 'Anonymous role retained TRUNCATE';
  end if;
  begin
    execute 'TRUNCATE TABLE public.sales';
    raise exception 'Anonymous role unexpectedly truncated sales';
  exception when insufficient_privilege then null;
  end;
end;
$anon_truncate$;
reset role;
