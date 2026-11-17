-- Restore source performance and uniqueness indexes for operational parity.
CREATE INDEX IF NOT EXISTS idx_categories_dre_line ON public.categories USING btree (company_id, dre_line) WHERE (is_balance_sheet = false);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_company_invitations_company ON public.company_invitations USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON public.company_invitations USING btree (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_invitations_pending_email ON public.company_invitations USING btree (company_id, lower(email)) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_invitations_token_hash ON public.company_invitations USING btree (token_hash) WHERE (token_hash IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_company_members_company ON public.company_members USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_company ON public.cost_centers USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_erp_mappings_company ON public.erp_account_mappings USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_goals_company_year ON public.goals USING btree (company_id, year);
CREATE INDEX IF NOT EXISTS import_jobs_company_idx ON public.import_jobs USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_status_idx ON public.import_jobs USING btree (status, created_at);
CREATE INDEX IF NOT EXISTS inventory_snapshots_company_date_idx ON public.inventory_snapshots USING btree (company_id, snapshot_date DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_parties_company ON public.parties USING btree (company_id);
CREATE INDEX IF NOT EXISTS sales_company_period_idx ON public.sales USING btree (company_id, period_start);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_company_fingerprint_uniq ON public.transactions USING btree (company_id, fingerprint) WHERE ((deleted_at IS NULL) AND (fingerprint IS NOT NULL));
