
-- 1. Fingerprint em transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_company_fingerprint_uniq
  ON public.transactions(company_id, fingerprint)
  WHERE deleted_at IS NULL AND fingerprint IS NOT NULL;

-- 2. import_jobs
CREATE TABLE public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  source text NOT NULL DEFAULT 'erp_pdf',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  total int NOT NULL DEFAULT 0,
  processed int NOT NULL DEFAULT 0,
  inserted int NOT NULL DEFAULT 0,
  duplicates int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  payload jsonb NOT NULL,
  error text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage own company import jobs"
  ON public.import_jobs FOR ALL
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));

CREATE TRIGGER set_import_jobs_updated_at
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX import_jobs_status_idx ON public.import_jobs(status, created_at);
CREATE INDEX import_jobs_company_idx ON public.import_jobs(company_id, created_at DESC);
