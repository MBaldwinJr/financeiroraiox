DROP POLICY IF EXISTS "members manage own company import jobs" ON public.import_jobs;
CREATE POLICY "members manage own company import jobs"
  ON public.import_jobs
  FOR ALL
  TO authenticated
  USING (public.is_company_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_member(company_id, auth.uid()));