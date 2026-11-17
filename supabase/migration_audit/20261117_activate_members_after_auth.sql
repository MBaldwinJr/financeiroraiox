-- Run ONCE after supported Supabase Auth migration has imported 7 users/identities.
-- Do not execute beforehand; do not create ghost Auth users.
begin;
do $$
declare missing_members int;
begin
 if (select count(*) from auth.users) < 7 then
   raise exception 'Auth migration incomplete: expected at least 7 users';
 end if;
 select count(*) into missing_members
 from migration_stage.source_records s
 where s.source_table='company_members'
 and not exists (select 1 from auth.users u where u.id=(s.payload->>'user_id')::uuid);
 if missing_members<>0 then
   raise exception 'Auth UUID reconciliation failed: % missing member identities', missing_members;
 end if;
end $$;

insert into public.company_members(company_id,user_id,member_role,id,role,created_at)
select
 (r.payload->>'company_id')::uuid,
 (r.payload->>'user_id')::uuid,
 case when r.payload->>'role'='member' then 'editor' else r.payload->>'role' end,
 (r.payload->>'id')::uuid,
 (r.payload->>'role')::public.app_role,
 (r.payload->>'created_at')::timestamptz
from migration_stage.source_records r
where r.source_table='company_members'
on conflict(company_id,user_id) do nothing;

do $$
begin
 if (select count(*) from public.company_members) <> 3 then
   raise exception 'Expected exactly 3 memberships after restore';
 end if;
end $$;
commit;
