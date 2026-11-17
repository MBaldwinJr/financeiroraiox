begin;
insert into public.import_jobs select (jsonb_populate_record(null::public.import_jobs,r.payload)).*
from migration_stage.source_records r where r.source_table='import_jobs'
and r.payload->>'status' in ('completed','failed')
on conflict(id) do nothing;
insert into public.company_invitations select (jsonb_populate_record(null::public.company_invitations,r.payload)).*
from migration_stage.source_records r where r.source_table='company_invitations'
and (r.payload->>'expires_at')::timestamptz < now()
on conflict(id) do nothing;
select (select count(*) from public.import_jobs) jobs,(select count(*) from public.company_invitations) invitations;
commit;