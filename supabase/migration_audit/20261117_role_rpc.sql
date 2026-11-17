-- Preserve original role enum and RPC signatures without allowing anonymous role inspection.
do $$ begin if not exists (select 1 from pg_type where typnamespace='public'::regnamespace and typname='app_role') then create type public.app_role as enum ('owner','admin','member'); end if; end $$;

alter table public.company_members alter column role drop default;
alter table public.company_members alter column role type public.app_role using role::public.app_role;
alter table public.company_members alter column role set default 'member'::public.app_role;
alter table public.company_invitations alter column role drop default;
alter table public.company_invitations alter column role type public.app_role using role::public.app_role;
alter table public.company_invitations alter column role set default 'member'::public.app_role;

create or replace function migration_stage.sync_member_roles() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.role is not null then
   new.member_role := case when new.role='member' then 'editor' else new.role::text end;
 else
   new.role := case when new.member_role='editor' then 'member'::public.app_role
                    when new.member_role='admin' then 'admin'::public.app_role
                    else 'owner'::public.app_role end;
 end if;
 return new;
end $$;
drop trigger if exists legacy_sync_member_roles on public.company_members;
create trigger legacy_sync_member_roles before insert or update on public.company_members
for each row execute function migration_stage.sync_member_roles();

create or replace function public.is_company_member(_company_id uuid,_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
select (select auth.uid()) is not null
 and _user_id=(select auth.uid())
 and exists(select 1 from public.company_members m where m.company_id=_company_id and m.user_id=_user_id);
$$;
revoke all on function public.is_company_member(uuid,uuid) from public;
grant execute on function public.is_company_member(uuid,uuid) to authenticated;

create or replace function public.has_company_role(_company_id uuid,_user_id uuid,_roles public.app_role[])
returns boolean language sql stable security definer set search_path='' as $$
select (select auth.uid()) is not null
 and _user_id=(select auth.uid())
 and exists(select 1 from public.company_members m where m.company_id=_company_id and m.user_id=_user_id and m.role=any(_roles));
$$;
revoke all on function public.has_company_role(uuid,uuid,public.app_role[]) from public;
grant execute on function public.has_company_role(uuid,uuid,public.app_role[]) to authenticated;

create or replace function public.get_link_invitation(_token_hash text)
returns table(company_name text,role public.app_role,status text,expired boolean,already_member boolean)
language sql stable security definer set search_path='' as $$
select c.name,i.role,i.status,(i.expires_at < now()),
exists(select 1 from public.company_members m where m.company_id=i.company_id and m.user_id=(select auth.uid()))
from public.company_invitations i join public.companies c on c.id=i.company_id
where (select auth.uid()) is not null and i.invite_type='link'
  and length(_token_hash)>=32 and i.token_hash=_token_hash;
$$;
revoke all on function public.get_link_invitation(text) from public;
grant execute on function public.get_link_invitation(text) to authenticated;

create or replace function public.accept_link_invitation(_token_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); inv public.company_invitations%rowtype;
begin
 if uid is null then raise exception 'Não autenticado'; end if;
 if length(_token_hash)<32 then raise exception 'Convite inválido'; end if;
 select * into inv from public.company_invitations where invite_type='link' and token_hash=_token_hash for update;
 if not found or inv.status<>'pending' or inv.expires_at<=now() then
   raise exception 'Convite indisponível ou expirado';
 end if;
 insert into public.company_members(company_id,user_id,role)
 values (inv.company_id,uid,inv.role)
 on conflict(company_id,user_id) do nothing;
 update public.company_invitations
 set status='accepted',accepted_at=now(),accepted_by=uid,updated_at=now()
 where id=inv.id;
 return inv.company_id;
end $$;
revoke all on function public.accept_link_invitation(text) from public;
grant execute on function public.accept_link_invitation(text) to authenticated;
