-- Financeiro Raio-X
-- P0.4: centralized financial engine.
-- DRE = competence (financial_entries.competence_date)
-- Cash flow = realized payments (payments.payment_date)
-- Projected cash = open/partially-paid entries by due_date
-- Transfers are intentionally excluded from revenue/expense totals.

CREATE OR REPLACE VIEW public.v_financial_dre AS
SELECT
  fe.company_id,
  fe.competence_date,
  date_trunc('month', fe.competence_date)::date AS competence_month,
  fe.entry_type,
  fe.category_id,
  fe.cost_center_id,
  fe.party_id,
  SUM(
    CASE
      WHEN fe.entry_type = 'receivable' THEN fe.amount_cents
      WHEN fe.entry_type = 'payable' THEN -fe.amount_cents
      ELSE 0
    END
  )::bigint AS net_amount_cents,
  SUM(CASE WHEN fe.entry_type = 'receivable' THEN fe.amount_cents ELSE 0 END)::bigint AS revenue_cents,
  SUM(CASE WHEN fe.entry_type = 'payable' THEN fe.amount_cents ELSE 0 END)::bigint AS expense_cents
FROM public.financial_entries fe
WHERE fe.deleted_at IS NULL
  AND fe.status <> 'cancelled'
GROUP BY fe.company_id, fe.competence_date, fe.entry_type,
         fe.category_id, fe.cost_center_id, fe.party_id;

CREATE OR REPLACE VIEW public.v_financial_cashflow AS
SELECT
  p.company_id,
  p.payment_date,
  date_trunc('month', p.payment_date)::date AS payment_month,
  fe.entry_type,
  fe.category_id,
  fe.cost_center_id,
  fe.party_id,
  SUM(
    CASE
      WHEN fe.entry_type = 'receivable' THEN p.amount_cents
      WHEN fe.entry_type = 'payable' THEN -p.amount_cents
      ELSE 0
    END
  )::bigint AS net_amount_cents,
  SUM(CASE WHEN fe.entry_type = 'receivable' THEN p.amount_cents ELSE 0 END)::bigint AS inflow_cents,
  SUM(CASE WHEN fe.entry_type = 'payable' THEN p.amount_cents ELSE 0 END)::bigint AS outflow_cents
FROM public.payments p
JOIN public.financial_entries fe
  ON fe.company_id = p.company_id
 AND fe.id = p.financial_entry_id
WHERE p.deleted_at IS NULL
  AND fe.deleted_at IS NULL
  AND fe.status <> 'cancelled'
GROUP BY p.company_id, p.payment_date, fe.entry_type,
         fe.category_id, fe.cost_center_id, fe.party_id;

CREATE OR REPLACE VIEW public.v_financial_projected_cashflow AS
SELECT
  fe.company_id,
  fe.due_date,
  date_trunc('month', fe.due_date)::date AS due_month,
  fe.entry_type,
  fe.category_id,
  fe.cost_center_id,
  fe.party_id,
  fe.amount_cents AS gross_amount_cents,
  COALESCE(p.paid_cents, 0)::bigint AS paid_cents,
  GREATEST(fe.amount_cents - COALESCE(p.paid_cents, 0), 0)::bigint AS open_amount_cents,
  CASE
    WHEN fe.entry_type = 'receivable' THEN GREATEST(fe.amount_cents - COALESCE(p.paid_cents, 0), 0)
    WHEN fe.entry_type = 'payable' THEN -GREATEST(fe.amount_cents - COALESCE(p.paid_cents, 0), 0)
    ELSE 0
  END::bigint AS net_open_amount_cents
FROM public.financial_entries fe
LEFT JOIN (
  SELECT company_id, financial_entry_id, SUM(amount_cents)::bigint AS paid_cents
  FROM public.payments
  WHERE deleted_at IS NULL
  GROUP BY company_id, financial_entry_id
) p
  ON p.company_id = fe.company_id
 AND p.financial_entry_id = fe.id
WHERE fe.deleted_at IS NULL
  AND fe.due_date IS NOT NULL
  AND fe.status IN ('open', 'partially_paid');

CREATE OR REPLACE FUNCTION public.get_financial_summary(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  revenue_competence_cents bigint,
  expense_competence_cents bigint,
  net_competence_cents bigint,
  inflow_realized_cents bigint,
  outflow_realized_cents bigint,
  net_cash_realized_cents bigint,
  receivable_open_cents bigint,
  payable_open_cents bigint,
  projected_net_cents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH competence AS (
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'receivable' THEN amount_cents ELSE 0 END), 0)::bigint AS revenue,
      COALESCE(SUM(CASE WHEN entry_type = 'payable' THEN amount_cents ELSE 0 END), 0)::bigint AS expense
    FROM financial_entries
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND status <> 'cancelled'
      AND competence_date BETWEEN p_start_date AND p_end_date
  ),
  realized AS (
    SELECT
      COALESCE(SUM(CASE WHEN fe.entry_type = 'receivable' THEN p.amount_cents ELSE 0 END), 0)::bigint AS inflow,
      COALESCE(SUM(CASE WHEN fe.entry_type = 'payable' THEN p.amount_cents ELSE 0 END), 0)::bigint AS outflow
    FROM payments p
    JOIN financial_entries fe
      ON fe.company_id = p.company_id
     AND fe.id = p.financial_entry_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND fe.deleted_at IS NULL
      AND fe.status <> 'cancelled'
      AND p.payment_date BETWEEN p_start_date AND p_end_date
  ),
  open_items AS (
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'receivable' THEN open_amount_cents ELSE 0 END), 0)::bigint AS receivable,
      COALESCE(SUM(CASE WHEN entry_type = 'payable' THEN open_amount_cents ELSE 0 END), 0)::bigint AS payable,
      COALESCE(SUM(net_open_amount_cents), 0)::bigint AS projected
    FROM v_financial_projected_cashflow
    WHERE company_id = p_company_id
      AND due_date BETWEEN p_start_date AND p_end_date
  )
  SELECT
    c.revenue,
    c.expense,
    (c.revenue - c.expense)::bigint,
    r.inflow,
    r.outflow,
    (r.inflow - r.outflow)::bigint,
    o.receivable,
    o.payable,
    o.projected
  FROM competence c, realized r, open_items o;
$$;

REVOKE ALL ON FUNCTION public.get_financial_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_summary(uuid, date, date) TO authenticated, service_role;

GRANT SELECT ON public.v_financial_dre TO authenticated;
GRANT SELECT ON public.v_financial_cashflow TO authenticated;
GRANT SELECT ON public.v_financial_projected_cashflow TO authenticated;

COMMENT ON VIEW public.v_financial_dre IS 'Central DRE engine: competence basis. Payments do not affect this view.';
COMMENT ON VIEW public.v_financial_cashflow IS 'Central cash engine: realized payments only. Transfers are excluded.';
COMMENT ON VIEW public.v_financial_projected_cashflow IS 'Central projected cash engine: remaining open obligations/receivables by due date.';
COMMENT ON FUNCTION public.get_financial_summary(uuid, date, date) IS 'Returns DRE, realized cash and open/projected financial KPIs for one company and period.';
