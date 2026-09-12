-- Financeiro Raio-X
-- P0.3: financial domain foundation.
-- This migration introduces obligations/payments/transfers without removing
-- the legacy transactions table, allowing a controlled migration.

CREATE TABLE IF NOT EXISTS public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  entry_type text NOT NULL CHECK (entry_type IN ('receivable','payable','other')),
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  competence_date date NOT NULL DEFAULT CURRENT_DATE,
  category_id uuid,
  cost_center_id uuid,
  party_id uuid,
  bank_account_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','partially_paid','paid','cancelled')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  financial_entry_id uuid NOT NULL REFERENCES public.financial_entries(id) ON DELETE RESTRICT,
  bank_account_id uuid,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'other',
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.financial_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  source_bank_account_id uuid NOT NULL,
  destination_bank_account_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (source_bank_account_id <> destination_bank_account_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_entries_company_id
  ON public.financial_entries(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_company_id
  ON public.payments(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfers_company_id
  ON public.financial_transfers(company_id, id);

ALTER TABLE public.financial_entries
  ADD CONSTRAINT fk_financial_entries_company_category
  FOREIGN KEY (company_id, category_id)
  REFERENCES public.categories(company_id, id)
  NOT VALID;

ALTER TABLE public.financial_entries
  ADD CONSTRAINT fk_financial_entries_company_cost_center
  FOREIGN KEY (company_id, cost_center_id)
  REFERENCES public.cost_centers(company_id, id)
  NOT VALID;

ALTER TABLE public.financial_entries
  ADD CONSTRAINT fk_financial_entries_company_party
  FOREIGN KEY (company_id, party_id)
  REFERENCES public.parties(company_id, id)
  NOT VALID;

ALTER TABLE public.financial_entries
  ADD CONSTRAINT fk_financial_entries_company_bank
  FOREIGN KEY (company_id, bank_account_id)
  REFERENCES public.bank_accounts(company_id, id)
  NOT VALID;

ALTER TABLE public.payments
  ADD CONSTRAINT fk_payments_company_entry
  FOREIGN KEY (company_id, financial_entry_id)
  REFERENCES public.financial_entries(company_id, id)
  NOT VALID;

ALTER TABLE public.payments
  ADD CONSTRAINT fk_payments_company_bank
  FOREIGN KEY (company_id, bank_account_id)
  REFERENCES public.bank_accounts(company_id, id)
  NOT VALID;

ALTER TABLE public.financial_transfers
  ADD CONSTRAINT fk_transfers_company_source_bank
  FOREIGN KEY (company_id, source_bank_account_id)
  REFERENCES public.bank_accounts(company_id, id)
  NOT VALID;

ALTER TABLE public.financial_transfers
  ADD CONSTRAINT fk_transfers_company_destination_bank
  FOREIGN KEY (company_id, destination_bank_account_id)
  REFERENCES public.bank_accounts(company_id, id)
  NOT VALID;

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read financial entries" ON public.financial_entries;
CREATE POLICY "members read financial entries"
  ON public.financial_entries FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

DROP POLICY IF EXISTS "members insert financial entries" ON public.financial_entries;
CREATE POLICY "members insert financial entries"
  ON public.financial_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(company_id, auth.uid())
    AND public.has_company_permission(company_id, auth.uid(), 'finance.transaction.create')
  );

DROP POLICY IF EXISTS "members update financial entries" ON public.financial_entries;
CREATE POLICY "members update financial entries"
  ON public.financial_entries FOR UPDATE TO authenticated
  USING (
    public.is_company_member(company_id, auth.uid())
    AND public.has_company_permission(company_id, auth.uid(), 'finance.transaction.update')
  )
  WITH CHECK (
    public.is_company_member(company_id, auth.uid())
    AND public.has_company_permission(company_id, auth.uid(), 'finance.transaction.update')
  );

DROP POLICY IF EXISTS "members read payments" ON public.payments;
CREATE POLICY "members read payments"
  ON public.payments FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

DROP POLICY IF EXISTS "members insert payments" ON public.payments;
CREATE POLICY "members insert payments"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(company_id, auth.uid())
    AND public.has_company_permission(company_id, auth.uid(), 'finance.payment.create')
  );

DROP POLICY IF EXISTS "members read transfers" ON public.financial_transfers;
CREATE POLICY "members read transfers"
  ON public.financial_transfers FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

DROP POLICY IF EXISTS "members insert transfers" ON public.financial_transfers;
CREATE POLICY "members insert transfers"
  ON public.financial_transfers FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(company_id, auth.uid())
    AND public.has_company_permission(company_id, auth.uid(), 'finance.transaction.create')
  );

CREATE INDEX IF NOT EXISTS idx_financial_entries_company_due
  ON public.financial_entries(company_id, due_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_financial_entries_company_competence
  ON public.financial_entries(company_id, competence_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_company_date
  ON public.payments(company_id, payment_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transfers_company_date
  ON public.financial_transfers(company_id, transfer_date)
  WHERE deleted_at IS NULL;
