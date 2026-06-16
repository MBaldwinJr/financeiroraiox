
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  seller_code text,
  seller_name text NOT NULL,
  net_amount_cents bigint NOT NULL DEFAULT 0,
  returns_cents bigint NOT NULL DEFAULT 0,
  cost_cents bigint NOT NULL DEFAULT 0,
  items_qty integer NOT NULL DEFAULT 0,
  sales_qty integer NOT NULL DEFAULT 0,
  source_file text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (company_id, period_start, seller_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read sales" ON public.sales FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members write sales" ON public.sales FOR ALL TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE INDEX sales_company_period_idx ON public.sales(company_id, period_start);

CREATE TRIGGER set_sales_updated_at BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
