CREATE TABLE public.inventory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  cost_cents bigint NOT NULL CHECK (cost_cents >= 0),
  retail_cents bigint CHECK (retail_cents IS NULL OR retail_cents >= 0),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, snapshot_date)
);

CREATE INDEX inventory_snapshots_company_date_idx
  ON public.inventory_snapshots (company_id, snapshot_date DESC)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_snapshots TO authenticated;
GRANT ALL ON public.inventory_snapshots TO service_role;

ALTER TABLE public.inventory_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read company inventory snapshots"
  ON public.inventory_snapshots
  FOR SELECT
  TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "members insert company inventory snapshots"
  ON public.inventory_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "members update company inventory snapshots"
  ON public.inventory_snapshots
  FOR UPDATE
  TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "members delete company inventory snapshots"
  ON public.inventory_snapshots
  FOR DELETE
  TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE TRIGGER inventory_snapshots_set_updated_at
  BEFORE UPDATE ON public.inventory_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();