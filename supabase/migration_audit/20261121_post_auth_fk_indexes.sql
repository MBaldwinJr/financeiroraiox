-- Post-Auth restoration FK indexes. All indexes are additive and preserve existing data.
create index if not exists idx_financeiro_companies_owner_id on public.companies(owner_id);
create index if not exists idx_financeiro_company_invitations_invited_by on public.company_invitations(invited_by);
create index if not exists idx_financeiro_erp_account_mappings_category_id on public.erp_account_mappings(category_id);
create index if not exists idx_financeiro_inventory_snapshots_created_by on public.inventory_snapshots(created_by);
create index if not exists idx_financeiro_transactions_created_by on public.transactions(created_by);
create index if not exists idx_financeiro_transactions_party_id on public.transactions(party_id);
