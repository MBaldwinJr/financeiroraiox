-- Financial migration audit: category totals are NOT final DRE values.
-- Supplier cash payments and CMV must be reconciled separately.
create or replace view migration_stage.category_reconciliation
with (security_invoker = true) as
select
  t.company_id,
  t.kind,
  c.payload->>'name' category_name,
  c.payload->>'dre_group' dre_group,
  c.payload->>'dre_line' dre_line,
  count(*) as active_transactions,
  sum(t.amount_cents) as active_amount_cents,
  sum(t.amount_brl) as active_amount_brl
from migration_stage.normalized_transactions t
left join migration_stage.source_records c
  on c.source_table='categories' and c.source_key=t.category_id::text
where t.deleted_at is null
group by t.company_id,t.kind,c.payload->>'name',c.payload->>'dre_group',c.payload->>'dre_line';

comment on view migration_stage.category_reconciliation is
'Read-only grouping of active source transactions. Supplier payments represent cash outflows, not automatically DRE costs; CMV must be calculated separately and reconciled with sales.';
