-- Ephemeral PostgreSQL 17 only. Never run against a hosted project.
\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

select public.sales_month_version(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-05-01'
) as initial_version \gset
select set_config('test.initial_version',:'initial_version',false);

-- Replace the entire month, including disappearing/additional sellers.
with result as (
  select public.sales_month_commit(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-05-01','2026-05-31',:'initial_version',
    '55555555-5555-4555-8555-555555555555',
    '[
      {"sellerName":"Ana Teste","sellerCode":"01","netAmountCents":170000,"returnsCents":10000,"costCents":92000,"itemsQty":15,"salesQty":11},
      {"sellerName":"Beto Teste","sellerCode":"02","netAmountCents":80000,"returnsCents":0,"costCents":46000,"itemsQty":7,"salesQty":6}
    ]'::jsonb,'synthetic-new.pdf'
  ) as payload
)
select payload->>'revisionId' as revision_id,
       payload->>'version' as replacement_version,
       payload->>'replayed' as replayed_flag
from result \gset

select set_config('test.revision_id',:'revision_id',false);
select set_config('test.replacement_version',:'replacement_version',false);

do $$
begin
  if (select count(*) from public.sales
      where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and period_start='2026-05-01' and deleted_at is null) <> 2 then
    raise exception 'Commit did not fully replace seller set';
  end if;
  if (select sum(cost_cents) from public.sales
      where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and period_start='2026-05-01') <> 138000 then
    raise exception 'Cost after replacement is inconsistent';
  end if;
  if (select count(*) from public.sales
      where company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 0 then
    raise exception 'RLS leaked other company';
  end if;
end $$;

-- Repeated request with same payload must be idempotent.
with result as (
  select public.sales_month_commit(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-05-01','2026-05-31',:'initial_version',
    '55555555-5555-4555-8555-555555555555',
    '[
      {"sellerName":"Ana Teste","sellerCode":"01","netAmountCents":170000,"returnsCents":10000,"costCents":92000,"itemsQty":15,"salesQty":11},
      {"sellerName":"Beto Teste","sellerCode":"02","netAmountCents":80000,"returnsCents":0,"costCents":46000,"itemsQty":7,"salesQty":6}
    ]'::jsonb,'synthetic-new.pdf'
  ) as payload
)
select payload->>'replayed' as replay_result from result \gset

do $$
begin
  if current_setting('test.initial_version') = current_setting('test.replacement_version') then
    raise exception 'Version should change after replacement';
  end if;
end $$;

-- Old version, new request: serialization failure, with no partial mutation.
do $$
begin
  begin
    perform public.sales_month_commit(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-05-01','2026-05-31',current_setting('test.initial_version'),
      '66666666-6666-4666-8666-666666666666',
      '[{"sellerName":"Wrong","netAmountCents":1,"returnsCents":0,"costCents":1,"itemsQty":1,"salesQty":1}]'::jsonb,
      'stale.pdf'
    );
    raise exception 'Expected stale fingerprint to be rejected';
  exception when serialization_failure then null;
  end;
end $$;

-- Simulate failure AFTER DELETE by triggering an INSERT error.
-- The original current month must survive the rollback intact.
do $$
begin
  begin
    perform public.sales_month_commit(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '2026-05-01','2026-05-31',current_setting('test.replacement_version'),
      '66666666-6666-4666-8666-666666666667',
      '[{"sellerName":"ROLLBACK_TEST","netAmountCents":1,"returnsCents":0,"costCents":1,"itemsQty":1,"salesQty":1}]'::jsonb,
      'failure-test.pdf'
    );
    raise exception 'Expected simulated INSERT failure';
  exception when raise_exception then
    if SQLERRM not like '%synthetic insert failure%' then
      raise;
    end if;
  end;
  if (select count(*) from public.sales
      where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and period_start='2026-05-01') <> 2 then
    raise exception 'Failed transaction removed rows';
  end if;
  if (select sum(cost_cents) from public.sales
      where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and period_start='2026-05-01') <> 138000 then
    raise exception 'Failed transaction changed cost';
  end if;
end $$;

-- Direct mutations must be blocked even for authenticated owners.
do $$
begin
  begin
    update public.sales set cost_cents=1
    where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'Direct UPDATE unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.sales
    where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'Direct DELETE unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Restore full original version, not merely the totals.
with result as (
  select public.sales_month_restore(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '2026-05-01', :'revision_id'::uuid,
    :'replacement_version', '77777777-7777-4777-8777-777777777777'
  ) as payload
)
select payload->>'version' as restored_version,
       payload->>'revisionId' as restore_revision_id
from result \gset

do $$
begin
  if (select count(*) from public.sales
      where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and period_start='2026-05-01')<>1 then
    raise exception 'Restore did not recover original seller';
  end if;
  if (select sum(cost_cents) from public.sales
      where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and period_start='2026-05-01')<>60000 then
    raise exception 'Restore did not recover original cost';
  end if;
  if current_setting('test.initial_version')<>:'restored_version' then
    raise exception 'Restore must recover identical original fingerprint';
  end if;
end $$;

-- Cannot restore an outdated revision twice with a new request.
do $$
begin
  begin
    perform public.sales_month_restore(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-05-01',
      current_setting('test.revision_id')::uuid,
      current_setting('test.initial_version'),
      '88888888-8888-4888-8888-888888888888'
    );
    raise exception 'Expected stale restore to be rejected';
  exception when serialization_failure then null;
  end;
end $$;

-- Member: authenticated but not owner/admin.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$
begin
  begin
    perform public.sales_month_commit(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-05-01','2026-05-31',
      current_setting('test.initial_version'),
      '99999999-9999-4999-8999-999999999999',
      '[{"sellerName":"Member Test","netAmountCents":1,"returnsCents":0,"costCents":1,"itemsQty":1,"salesQty":1}]'::jsonb,
      'member.pdf'
    );
    raise exception 'Member unexpectedly wrote sales';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Admin may view the version, unrelated owner cannot.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.sales_month_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-05-01')
  as admin_verified_version;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
do $$
begin
  begin
    perform public.sales_month_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-05-01');
    raise exception 'Another company accessed version';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
begin
  if (select count(*) from finance_internal.sales_month_revisions where action='replace')<>1 then
    raise exception 'Expected one replacement revision';
  end if;
  if (select count(*) from finance_internal.sales_month_revisions where action='restore')<>1 then
    raise exception 'Expected one restore revision';
  end if;
  if (select count(*) from public.sales
      where company_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>1 then
    raise exception 'Unrelated company changed';
  end if;
end $$;
