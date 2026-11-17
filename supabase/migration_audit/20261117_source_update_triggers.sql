-- Original updated_at behavior; no data rewrite.
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at=now();
  return new;
end $$;
create trigger "trg_bank_accounts_updated" before update on public."bank_accounts" for each row execute function public.set_updated_at();
create trigger "trg_company_invitations_updated" before update on public."company_invitations" for each row execute function public.set_updated_at();
create trigger "set_updated_at_erp_account_mappings" before update on public."erp_account_mappings" for each row execute function public.set_updated_at();
create trigger "goals_set_updated_at" before update on public."goals" for each row execute function public.set_updated_at();
create trigger "set_import_jobs_updated_at" before update on public."import_jobs" for each row execute function public.set_updated_at();
create trigger "inventory_snapshots_set_updated_at" before update on public."inventory_snapshots" for each row execute function public.set_updated_at();
create trigger "set_sales_updated_at" before update on public."sales" for each row execute function public.set_updated_at();
create trigger "trg_transactions_updated" before update on public."transactions" for each row execute function public.set_updated_at();
