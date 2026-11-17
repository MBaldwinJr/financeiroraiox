-- Ensure original owner role is not overwritten by the compatibility column default.
alter table public.company_members alter column role drop default;
create or replace function migration_stage.sync_member_roles()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.role is not null then
   new.member_role := case when new.role='member' then 'editor' else new.role::text end;
 else
   new.role := case new.member_role
    when 'owner' then 'owner'::public.app_role
    when 'admin' then 'admin'::public.app_role
    else 'member'::public.app_role end;
 end if;
 return new;
end $$;

-- Never permit a signed-in creator to assign an arbitrary other owner.
create or replace function migration_stage.set_new_company_owner()
returns trigger language plpgsql set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Authenticated user required'; end if;
 new.owner_id := (select auth.uid());
 return new;
end $$;
drop trigger if exists legacy_company_owner_id on public.companies;
create trigger legacy_company_owner_id before insert on public.companies
for each row execute function migration_stage.set_new_company_owner();

-- Owner membership is already created by app_private.assign_company_owner.
-- Restore only the default business catalogs for *new* companies.
create or replace function migration_stage.seed_new_company()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.cost_centers(company_id,name)
 values(new.id,'Administrativo'),(new.id,'Comercial'),(new.id,'Oficina'),
 (new.id,'Estoque'),(new.id,'Logística'),(new.id,'Marketing'),(new.id,'Outros');
 insert into public.categories(company_id,name,kind,dre_group)
 values (new.id,'Vendas','revenue','revenue'),
 (new.id,'Serviços','revenue','revenue'),
 (new.id,'Outras Receitas','revenue','revenue'),
 (new.id,'CMV','expense','cmv'),
 (new.id,'Fornecedores','expense','supplier'),
 (new.id,'Fretes','expense','freight'),
 (new.id,'Aluguel','expense','fixed'),
 (new.id,'Energia','expense','fixed'),
 (new.id,'Água','expense','fixed'),
 (new.id,'Internet','expense','fixed'),
 (new.id,'Pró-labore','expense','fixed'),
 (new.id,'Combustível','expense','variable'),
 (new.id,'Compras de Veículos','expense','variable'),
 (new.id,'Comissões','expense','variable'),
 (new.id,'Descontos','expense','variable'),
 (new.id,'Parcelas de Empréstimos','expense','variable'),
 (new.id,'Despesas Operacionais','expense','operational'),
 (new.id,'Outras Despesas','expense','other');
 insert into public.bank_accounts(company_id,name,type)
 values(new.id,'Caixa','cash');
 return new;
end $$;
revoke all on function migration_stage.seed_new_company() from public;
drop trigger if exists legacy_seed_company on public.companies;
create trigger legacy_seed_company after insert on public.companies
for each row execute function migration_stage.seed_new_company();
