-- Read-only GO/NO-GO gate for Financeiro Raio-X cutover.
-- Execute in Supabase SQL Editor only after the official Auth import
-- and after running 20261117_activate_members_after_auth.sql.
-- No secrets, emails or user IDs are returned.
with checks as (
 select 'company_count' name,(select count(*) from public.companies)=1 ok
 union all select 'transactions_count',(select count(*) from public.transactions)=16749
 union all select 'sales_count',(select count(*) from public.sales)=166
 union all select 'transactions_sum',(select sum(amount_cents) from public.transactions)=5877619121
 union all select 'sales_sum',(select sum(net_amount_cents) from public.sales)=1644965733
 union all select 'soft_deletions',(select count(*) from public.transactions where deleted_at is not null)=6377
 union all select 'auth_users',(select count(*) from auth.users)=7
 union all select 'auth_identities',(select count(*) from auth.identities)=7
 union all select 'company_members',(select count(*) from public.company_members)=3
 union all select 'member_fk',(select count(*) from public.company_members m left join auth.users u on u.id=m.user_id where u.id is null)=0
 union all select 'import_jobs',(select count(*) from public.import_jobs)=35
 union all select 'invitations',(select count(*) from public.company_invitations)=6
 union all select 'owner_trigger',(select count(*) from pg_trigger where tgrelid='public.companies'::regclass and tgname='company_owner_on_create' and tgenabled='O')=1
)
select name,case when ok then 'PASS' else 'BLOCK' end result from checks order by name;

-- Cutover also requires external smoke tests for email/password login, Google login,
-- DRE, CMV, invoice imports, OAuth redirects, server environment variables, and
-- controlled write freeze on the source. SQL validation alone is not sufficient.
