-- Execute only AFTER the supported Auth migration and membership restoration.
-- Never execute on the source Lovable Cloud instance.
begin;
do $$
begin
 if (select count(*) from auth.users)<>7 or (select count(*) from auth.identities)<>7 then
   raise exception 'Auth migration not reconciled: expected 7 users and 7 identities';
 end if;
 if (select count(*) from public.company_members)<>3 then
   raise exception 'Membership migration not reconciled: expected 3 members';
 end if;
 if exists(select 1 from public.companies c left join auth.users u on u.id=c.owner_id where u.id is null) then
   raise exception 'Company owner Auth UUID mismatch';
 end if;
 if exists(select 1 from public.company_invitations i left join auth.users u on u.id=i.invited_by where u.id is null) then
   raise exception 'Invitation creator Auth UUID mismatch';
 end if;
 if exists(select 1 from public.transactions t left join auth.users u on u.id=t.created_by
   where t.created_by is not null and u.id is null) then
   raise exception 'Transaction creator Auth UUID mismatch';
 end if;
 if exists(select 1 from public.inventory_snapshots s left join auth.users u on u.id=s.created_by
   where s.created_by is not null and u.id is null) then
   raise exception 'Inventory creator Auth UUID mismatch';
 end if;
end $$;

alter table public.companies
 add constraint companies_owner_id_fkey foreign key(owner_id) references auth.users(id) on delete cascade;
alter table public.company_invitations
 add constraint company_invitations_invited_by_fkey foreign key(invited_by) references auth.users(id) on delete cascade;
alter table public.inventory_snapshots
 add constraint inventory_snapshots_created_by_fkey foreign key(created_by) references auth.users(id) on delete set null;
alter table public.transactions
 add constraint transactions_created_by_fkey foreign key(created_by) references auth.users(id) on delete set null;
commit;
