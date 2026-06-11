
CREATE TABLE public.erp_account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  erp_code text NOT NULL,
  erp_name text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  default_kind text CHECK (default_kind IN ('revenue','expense')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, erp_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_account_mappings TO authenticated;
GRANT ALL ON public.erp_account_mappings TO service_role;

ALTER TABLE public.erp_account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read erp mappings"
  ON public.erp_account_mappings FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "members can write erp mappings"
  ON public.erp_account_mappings FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE TRIGGER set_updated_at_erp_account_mappings
  BEFORE UPDATE ON public.erp_account_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_erp_mappings_company ON public.erp_account_mappings(company_id);
