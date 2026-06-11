CREATE POLICY "owners read own companies"
ON public.companies
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());