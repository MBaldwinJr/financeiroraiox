alter table public.companies add column if not exists owner_id uuid;
alter table public.companies add column if not exists updated_at timestamptz;
alter table public.company_members add column if not exists id uuid default gen_random_uuid();
alter table public.company_members add column if not exists role text;
alter table public.cost_centers add column if not exists color text;
create or replace function migration_stage.is_member(p_company uuid) returns boolean language sql stable security definer set search_path='' as $$select (select auth.uid()) is not null and exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=(select auth.uid()))$$;
revoke all on function migration_stage.is_member(uuid) from public; grant usage on schema migration_stage to authenticated; grant execute on function migration_stage.is_member(uuid) to authenticated;
create or replace function migration_stage.can_write(p_company uuid) returns boolean language sql stable security definer set search_path='' as $$select (select auth.uid()) is not null and exists(select 1 from public.company_members m where m.company_id=p_company and m.user_id=(select auth.uid()) and m.member_role in ('owner','admin','editor'))$$;
revoke all on function migration_stage.can_write(uuid) from public; grant execute on function migration_stage.can_write(uuid) to authenticated;
create table if not exists public.bank_accounts (
 "color" text,
 "company_id" uuid,
 "created_at" timestamptz,
 "id" uuid,
 "initial_balance_cents" bigint,
 "name" text,
 "type" text,
 "updated_at" timestamptz,
 primary key ("id")
);
alter table public.bank_accounts enable row level security;
create policy "legacy_read_bank_accounts" on public.bank_accounts for select to authenticated using (migration_stage.is_member(company_id));
create policy "legacy_write_bank_accounts" on public.bank_accounts for all to authenticated using (migration_stage.can_write(company_id)) with check (migration_stage.can_write(company_id));
grant select,insert,update,delete on public.bank_accounts to authenticated;
create table if not exists public.categories (
 "account_class" text,
 "codigo" text,
 "company_id" uuid,
 "created_at" timestamptz,
 "dre_group" text,
 "dre_line" text,
 "id" uuid,
 "is_balance_sheet" boolean,
 "kind" text,
 "name" text,
 "ordem" integer,
 "parent_id" uuid,
 primary key ("id")
);
alter table public.categories enable row level security;
create policy "legacy_read_categories" on public.categories for select to authenticated using (migration_stage.is_member(company_id));
create policy "legacy_write_categories" on public.categories for all to authenticated using (migration_stage.can_write(company_id)) with check (migration_stage.can_write(company_id));
grant select,insert,update,delete on public.categories to authenticated;
create table if not exists public.company_invitations (
 "accepted_at" timestamptz,
 "accepted_by" uuid,
 "cancelled_at" timestamptz,
 "company_id" uuid,
 "created_at" timestamptz,
 "email" text,
 "expires_at" timestamptz,
 "id" uuid,
 "invite_type" text,
 "invited_at" timestamptz,
 "invited_by" uuid,
 "role" text,
 "status" text,
 "token_hash" text,
 "updated_at" timestamptz,
 primary key ("id")
);
alter table public.company_invitations enable row level security;
create policy "legacy_read_company_invitations" on public.company_invitations for select to authenticated using (migration_stage.is_member(company_id));
create policy "legacy_write_company_invitations" on public.company_invitations for all to authenticated using (migration_stage.can_write(company_id)) with check (migration_stage.can_write(company_id));
grant select,insert,update,delete on public.company_invitations to authenticated;
create table if not exists public.erp_account_mappings (
 "category_id" uuid,
 "company_id" uuid,
 "created_at" timestamptz,
 "default_kind" text,
 "erp_code" text,
 "erp_name" text,
 "id" uuid,
 "updated_at" timestamptz,
 primary key ("id")
);
alter table public.erp_account_mappings enable row level security;
create policy "legacy_read_erp_account_mappings" on public.erp_account_mappings for select to authenticated using (migration_stage.is_member(company_id));
create policy "legacy_write_erp_account_mappings" on public.erp_account_mappings for all to authenticated using (migration_stage.can_write(company_id)) with check (migration_stage.can_write(company_id));
grant select,insert,update,delete on public.erp_account_mappings to authenticated;
create table if not exists public.goals (
 "company_id" uuid,
 "created_at" timestamptz,
 "created_by" uuid,
 "id" uuid,
 "kind" text,
 "month" integer,
 "notes" text,
 "target_cents" bigint,
 "updated_at" timestamptz,
 "year" integer,
 primary key ("id")
);
alter table public.goals enable row level security;
create policy "legacy_read_goals" on public.goals for select to authenticated using (migration_stage.is_member(company_id));
create policy "legacy_write_goals" on public.goals for all to authenticated using (migration_stage.can_write(company_id)) with check (migration_stage.can_write(company_id));
grant select,insert,update,delete on public.goals to authenticated;
create table if not exists public.import_jobs (
 "attempts" integer,
 "company_id" uuid,
 "created_at" timestamptz,
 "created_by" uuid,
 "duplicates" integer,
 "error" text,
 "id" uuid,
 "inserted" integer,
 "locked_at" timestamptz,
 "max_attempts" integer,
 "payload" jsonb,
 "processed" integer,
 "source" text,
 "status" text,
 "total" integer,
 "updated_at" timestamptz,
 primary key ("id")
);
alter table public.import_jobs enable row level security;
create policy "legacy_read_import_jobs" on public.import_jobs for select to authenticated using (migration_stage.is_member(company_id));
create policy "legacy_write_import_jobs" on public.import_jobs for all to authenticated using (migration_stage.can_write(company_id)) with check (migration_stage.can_write(company_id));
grant select,insert,update,delete on public.import_jobs to authenticated;
create table if not exists public.inventory_snapshots (
 "company_id" uuid,
 "cost_cents" bigint,
 "created_at" timestamptz,
 "created_by" uuid,
 "deleted_at" timestamptz,
 "id" uuid,
 "notes" text,
 "retail_cents" bigint,
 "snapshot_date" date,
 "updated_at" timestamptz,
 primary key ("id")
);
alter table public.inventory_snapshots enable row level security;
create policy "legacy_read_inventory_snapshots" on public.inventory_snapshots for select to authenticated using (migration_stage.is_member(company_id));
create policy "legacy_write_inventory_snapshots" on public.inventory_snapshots for all to authenticated using (migration_stage.can_write(company_id)) with check (migration_stage.can_write(company_id));
grant select,insert,update,delete on public.inventory_snapshots to authenticated;
create table if not exists public.parties (
 "company_id" uuid,
 "created_at" timestamptz,
 "document" text,
 "email" text,
 "id" uuid,
 "kind" text,
 "name" text,
 "phone" text,
 primary key ("id")
);
alter table public.parties enable row level security;
create policy "legacy_read_parties" on public.parties for select to authenticated using (migration_stage.is_member(company_id));
create policy "legacy_write_parties" on public.parties for all to authenticated using (migration_stage.can_write(company_id)) with check (migration_stage.can_write(company_id));
grant select,insert,update,delete on public.parties to authenticated;
create table if not exists public.rate_limit_buckets (
 "key" text,
 "last_refill" text,
 "tokens" integer,
 "updated_at" timestamptz,
 primary key ("key")
);
revoke all on public.rate_limit_buckets from anon,authenticated;
create table if not exists public.sales (
 "company_id" uuid,
 "cost_cents" bigint,
 "created_at" timestamptz,
 "deleted_at" timestamptz,
 "id" uuid,
 "imported_at" timestamptz,
 "items_qty" integer,
 "net_amount_cents" bigint,
 "period_end" date,
 "period_start" date,
 "returns_cents" bigint,
 "sales_qty" integer,
 "seller_code" text,
 "seller_name" text,
 "source_file" text,
 "updated_at" timestamptz,
 primary key ("id")
);
alter table public.sales enable row level security;
create policy "legacy_read_sales" on public.sales for select to authenticated using (migration_stage.is_member(company_id));
create policy "legacy_write_sales" on public.sales for all to authenticated using (migration_stage.can_write(company_id)) with check (migration_stage.can_write(company_id));
grant select,insert,update,delete on public.sales to authenticated;
create table if not exists public.transactions (
 "amount_cents" bigint,
 "bank_account_id" uuid,
 "category_id" uuid,
 "company_id" uuid,
 "competencia" date,
 "cost_center_id" uuid,
 "created_at" timestamptz,
 "created_by" uuid,
 "date" date,
 "deleted_at" timestamptz,
 "description" text,
 "fingerprint" text,
 "id" uuid,
 "kind" text,
 "notes" text,
 "paid_at" timestamptz,
 "party_id" uuid,
 "payment_method" text,
 "status" text,
 "updated_at" timestamptz,
 primary key ("id")
);
alter table public.transactions enable row level security;
create policy "legacy_read_transactions" on public.transactions for select to authenticated using (migration_stage.is_member(company_id));
create policy "legacy_write_transactions" on public.transactions for all to authenticated using (migration_stage.can_write(company_id)) with check (migration_stage.can_write(company_id));
grant select,insert,update,delete on public.transactions to authenticated;
