-- Financeiro Raio-X
-- P0.4: non-breaking legacy compatibility for the cash-flow engine.

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS legacy_transaction_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_financial_entries_legacy_transaction'
  ) THEN
    ALTER TABLE public.financial_entries
      ADD CONSTRAINT fk_financial_entries_legacy_transaction
      FOREIGN KEY (legacy_transaction_id)
      REFERENCES public.transactions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_entries_company_legacy_transaction
  ON public.financial_entries(company_id, legacy_transaction_id)
  WHERE legacy_transaction_id IS NOT NULL;

-- Unified realized cash for the migration period:
--  * legacy paid transactions remain visible;
--  * new payments are included;
--  * once a legacy transaction is mapped to financial_entries.legacy_transaction_id,
--    its legacy cash row is excluded to prevent double counting.
CREATE OR REPLACE FUNCTION public.get_legacy_compatible_cashflow(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  payment_date date,
  inflow_cents bigint,
  outflow_cents bigint,
  net_cash_cents bigint
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
  WITH legacy AS (
    SELECT
      COALESCE(t.paid_at::date, t.date) AS payment_date,
      CASE WHEN t.kind = 'revenue' THEN t.amount_cents ELSE 0 END::bigint AS inflow_cents,
      CASE WHEN t.kind = 'expense' THEN t.amount_cents ELSE 0 END::bigint AS outflow_cents
    FROM public.transactions t
    WHERE t.company_id = p_company_id
      AND t.deleted_at IS NULL
      AND t.status = 'paid'
      AND COALESCE(t.paid_at::date, t.date) BETWEEN p_start_date AND p_end_date
      AND NOT EXISTS (
        SELECT 1
        FROM public.financial_entries fe
        WHERE fe.company_id = t.company_id
          AND fe.legacy_transaction_id = t.id
          AND fe.deleted_at IS NULL
      )
  ),
  modern AS (
    SELECT
      p.payment_date,
      CASE WHEN fe.entry_type = 'receivable' THEN p.amount_cents ELSE 0 END::bigint AS inflow_cents,
      CASE WHEN fe.entry_type = 'payable' THEN p.amount_cents ELSE 0 END::bigint AS outflow_cents
    FROM public.payments p
    JOIN public.financial_entries fe
      ON fe.company_id = p.company_id
     AND fe.id = p.financial_entry_id
    WHERE p.company_id = p_company_id
      AND p.deleted_at IS NULL
      AND fe.deleted_at IS NULL
      AND fe.status <> 'cancelled'
      AND p.payment_date BETWEEN p_start_date AND p_end_date
  )
  SELECT
    x.payment_date,
    SUM(x.inflow_cents)::bigint,
    SUM(x.outflow_cents)::bigint,
    (SUM(x.inflow_cents) - SUM(x.outflow_cents))::bigint
  FROM (
    SELECT * FROM legacy
    UNION ALL
    SELECT * FROM modern
  ) x
  GROUP BY x.payment_date
  ORDER BY x.payment_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_legacy_compatible_cashflow(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_legacy_compatible_cashflow(uuid, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_legacy_compatible_cashflow(uuid, date, date)
IS 'Migration-safe realized cashflow combining legacy paid transactions and new payments without double counting mapped legacy transactions.';
