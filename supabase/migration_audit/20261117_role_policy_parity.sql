-- Restore original role-based authorization and avoid extra privileges for members.
create or replace function migration_stage.is_company_admin(p_company uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(
 select 1 from public.company_members m
 where m.company_id=p_company and m.user_id=(select auth.uid())
   and m.member_role in ('owner','admin'));
$$;
revoke all on function migration_stage.is_company_admin(uuid) from public,anon;
grant execute on function migration_stage.is_company_admin(uuid) to authenticated;

drop policy if exists "company_member_self_select" on public.company_members;
create policy "members_read_company_roster" on public.company_members
 for select to authenticated using (migration_stage.is_member(company_id));
create policy "admins_add_members" on public.company_members
 for insert to authenticated with check (migration_stage.is_company_admin(company_id));
create policy "admins_change_members" on public.company_members
 for update to authenticated
 using (migration_stage.is_company_admin(company_id))
 with check (migration_stage.is_company_admin(company_id));
create policy "admins_remove_members" on public.company_members
 for delete to authenticated using (migration_stage.is_company_admin(company_id));

create policy "admins_update_companies" on public.companies
 for update to authenticated
 using (migration_stage.is_company_admin(id))
 with check (migration_stage.is_company_admin(id));
create policy "owners_delete_companies" on public.companies
 for delete to authenticated using (owner_id=(select auth.uid()));

drop policy if exists "legacy_insert_company_invitations" on public.company_invitations;
drop policy if exists "legacy_update_company_invitations" on public.company_invitations;
drop policy if exists "legacy_delete_company_invitations" on public.company_invitations;
drop policy if exists "legacy_read_company_invitations" on public.company_invitations;
create policy "admins_read_invitations" on public.company_invitations
 for select to authenticated using (migration_stage.is_company_admin(company_id));
create policy "admins_create_invitations" on public.company_invitations
 for insert to authenticated
 with check (migration_stage.is_company_admin(company_id) and invited_by=(select auth.uid()));
create policy "admins_update_invitations" on public.company_invitations
 for update to authenticated
 using (migration_stage.is_company_admin(company_id))
 with check (migration_stage.is_company_admin(company_id));
create policy "admins_delete_invitations" on public.company_invitations
 for delete to authenticated using (migration_stage.is_company_admin(company_id));

drop policy if exists "legacy_insert_goals" on public.goals;
drop policy if exists "legacy_update_goals" on public.goals;
drop policy if exists "legacy_delete_goals" on public.goals;
create policy "admins_insert_goals" on public.goals
 for insert to authenticated with check (migration_stage.is_company_admin(company_id));
create policy "admins_update_goals" on public.goals
 for update to authenticated
 using (migration_stage.is_company_admin(company_id))
 with check (migration_stage.is_company_admin(company_id));
create policy "admins_delete_goals" on public.goals
 for delete to authenticated using (migration_stage.is_company_admin(company_id));
