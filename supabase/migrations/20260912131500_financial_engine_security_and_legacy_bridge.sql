-- Financeiro Raio-X
-- P0.4 follow-up: harden the centralized engine and provide a legacy-compatible bridge.
-- The legacy transactions table remains readable while the new financial core is adopted.

-- 1) Prevent the SECURITY DEFINER summary function from being used as a
-- cross-company data oracle.
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(p_company_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for company';
  END IF;

  RETURN QUERY
  WITH competence AS (
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'receivable' THEN amount_cents ELSE 0 END), 0)::bigint AS revenue,
      COALESCE(SUM(CASE WHEN entry_type = 'payable' THEN amount_cents ELSE 0 END), 0)::bigint AS expense
    FROM public.financial_entries
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
      AND status <> 'cancelled'
      AND competence_date BETWEEN p_start_date AND p_end_date
  ),
  realized AS (
    SELECT
      COALESCE(SUM(CASE WHEN fe.entry_type = 'receivable' THEN p.amount_cents ELSE 0 END), 0)::bigint AS inflow,
      COALESCE(SUM(CASE WHEN fe.entry_type = 'payable' THEN p.amount_cents ELSE 0 END), 0)::bigint AS outflow
    FROM public.payments p
    JOIN public.financial_entries fe
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
    FROM public.v_financial_projected_cashflow
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
END;
$$;

REVOKE ALL ON FUNCTION public.get_financial_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_summary(uuid, date, date) TO authenticated, service_role;

-- 2) Make the read views execute with the caller's privileges/RLS context.
ALTER VIEW public.v_financial_dre SET (security_invoker = true);
ALTER VIEW public.v_financial_cashflow SET (security_invoker = true);
ALTER VIEW public.v_financial_projected_cashflow SET (security_invoker = true);

-- 3) Strengthen payment/entry integrity.
CREATE OR REPLACE FUNCTION public.validate_financial_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_amount bigint;
  v_paid_amount bigint;
BEGIN
  IF NEW.company_id IS DISTINCT FROM (
    SELECT company_id FROM public.financial_entries WHERE id = NEW.financial_entry_id
  ) THEN
    RAISE EXCEPTION 'Payment and financial entry must belong to the same company';
  END IF;

  SELECT amount_cents INTO v_entry_amount
  FROM public.financial_entries
  WHERE id = NEW.financial_entry_id
    AND deleted_at IS NULL
    AND status <> 'cancelled';

  IF v_entry_amount IS NULL THEN
    RAISE EXCEPTION 'Financial entry does not exist or is cancelled';
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_paid_amount
  FROM public.payments
  WHERE company_id = NEW.company_id
    AND financial_entry_id = NEW.financial_entry_id
    AND deleted_at IS NULL
    AND id <> COALESCE(NEW.id, gen_random_uuid());

  IF v_paid_amount + NEW.amount_cents > v_entry_amount THEN
    RAISE EXCEPTION 'Payment total exceeds financial entry amount';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_financial_payment ON public.payments;
CREATE TRIGGER trg_validate_financial_payment
BEFORE INSERT OR UPDATE OF amount_cents, financial_entry_id, company_id
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.validate_financial_payment();

-- 4) Keep entry status synchronized with realized payments.
CREATE OR REPLACE FUNCTION public.sync_financial_entry_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_total bigint;
  v_paid bigint;
  v_status text;
BEGIN
  v_entry_id := COALESCE(NEW.financial_entry_id, OLD.financial_entry_id);

  SELECT amount_cents, status
    INTO v_total, v_status
  FROM public.financial_entries
  WHERE id = v_entry_id;

  IF v_total IS NULL OR v_status = 'cancelled' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_paid
  FROM public.payments
  WHERE company_id = COALESCE(NEW.company_id, OLD.company_id)
    AND financial_entry_id = v_entry_id
    AND deleted_at IS NULL;

  UPDATE public.financial_entries
  SET status = CASE
    WHEN v_paid <= 0 THEN 'open'
    WHEN v_paid < v_total THEN 'partially_paid'
    ELSE 'paid'
  END,
  updated_at = now()
  WHERE id = v_entry_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_financial_entry_status ON public.payments;
CREATE TRIGGER trg_sync_financial_entry_status
AFTER INSERT OR UPDATE OF amount_cents, financial_entry_id, deleted_at OR DELETE
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_financial_entry_status();

-- 5) Legacy bridge: expose legacy transactions using the new financial semantics.
-- This is read-only and deliberately does not duplicate rows into financial_entries.
CREATE OR REPLACE VIEW public.v_legacy_financial_bridge AS
SELECT
  t.id AS legacy_transaction_id,
  t.company_id,
  CASE WHEN t.kind = 'revenue' THEN 'receivable' ELSE 'payable' END AS entry_type,
  t.description,
  t.amount_cents,
  t.date AS competence_date,
  t.date AS due_date,
  CASE WHEN t.status = 'paid' THEN COALESCE(t.paid_at::date, t.date) END AS realized_date,
  CASE WHEN t.status = 'paid' THEN t.amount_cents ELSE 0 END AS realized_amount_cents,
  t.category_id,
  c.dre_group,
  t.cost_center_id,
  t.party_id,
  t.bank_account_id,
  t.status,
  t.deleted_at
FROM public.transactions t
LEFT JOIN public.categories c
  ON c.company_id = t.company_id
 AND c.id = t.category_id
WHERE t.deleted_at IS NULL;

GRANT SELECT ON public.v_legacy_financial_bridge TO authenticated;

COMMENT ON VIEW public.v_legacy_financial_bridge IS
'Compatibility bridge from legacy transactions to the financial core. Read-only; does not create duplicate financial entries.';

-- Supporting indexes for the new core.
CREATE INDEX IF NOT EXISTS idx_financial_entries_company_status
  ON public.financial_entries(company_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_company_entry
  ON public.payments(company_id, financial_entry_id)
  WHERE deleted_at IS NULL;
