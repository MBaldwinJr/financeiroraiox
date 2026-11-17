-- Financeiro Raio-X: read-only reconciliation of staged source records.
-- No writes to public tables; no automatic accounting reclassification.
create or replace view migration_stage.normalized_transactions
with (security_invoker = true)
as
select
  (r.payload->>'id')::uuid as id,
  (r.payload->>'company_id')::uuid as company_id,
  nullif(r.payload->>'bank_account_id','')::uuid as bank_account_id,
  nullif(r.payload->>'category_id','')::uuid as category_id,
  nullif(r.payload->>'cost_center_id','')::uuid as cost_center_id,
  (r.payload->>'date')::date as transaction_date,
  nullif(r.payload->>'competencia','')::date as competence_date,
  nullif(r.payload->>'paid_at','')::timestamptz as paid_at,
  nullif(r.payload->>'deleted_at','')::timestamptz as deleted_at,
  r.payload->>'kind' as kind,
  r.payload->>'status' as status,
  r.payload->>'description' as description,
  (r.payload->>'amount_cents')::bigint as amount_cents,
  (r.payload->>'amount_cents')::numeric / 100 as amount_brl,
  r.payload->>'fingerprint' as fingerprint
from migration_stage.source_records r
where r.source_table='transactions';

create or replace view migration_stage.monthly_transaction_reconciliation
with (security_invoker = true)
as
select
  company_id,
  date_trunc('month', transaction_date)::date as transaction_month,
  count(*) as rows_total,
  count(*) filter (where deleted_at is not null) as deleted_rows,
  count(*) filter (where deleted_at is null and kind='revenue') as revenue_rows,
  coalesce(sum(amount_cents) filter (where deleted_at is null and kind='revenue'),0) as revenue_cents,
  count(*) filter (where deleted_at is null and kind='expense') as expense_rows,
  coalesce(sum(amount_cents) filter (where deleted_at is null and kind='expense'),0) as expense_cents,
  count(*) filter (where deleted_at is null and status <> 'paid') as unpaid_rows
from migration_stage.normalized_transactions
group by company_id, date_trunc('month', transaction_date)::date;

comment on view migration_stage.monthly_transaction_reconciliation is
'Origin transaction sums only. NOT a DRE. Sales and CMV remain separately sourced to avoid double counting.';
