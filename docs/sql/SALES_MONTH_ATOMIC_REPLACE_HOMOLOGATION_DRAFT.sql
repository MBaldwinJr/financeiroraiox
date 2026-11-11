-- PROPOSTA PARA HOMOLOGAÇÃO ISOLADA — NÃO APLICADA NO BANCO.
-- NÃO mover para supabase/migrations até testes de RPC, RLS e rollback.
-- Esta proposta revoga escrita direta na tabela sales: migrar os fluxos
-- Importar Vendas e Excluir Período para RPCs antes de executá-la.
-- Supabase: manter finance_internal FORA dos schemas expostos pela Data API.

begin;

create schema if not exists finance_internal;
revoke all on schema finance_internal from public, anon, authenticated;
grant usage on schema finance_internal to authenticated;

create table if not exists finance_internal.sales_month_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  period_start date not null,
  actor_id uuid not null,
  request_id uuid not null,
  action text not null check (action in ('replace', 'restore')),
  restored_revision_id uuid null references finance_internal.sales_month_revisions(id),
  previous_version text not null,
  resulting_version text not null,
  payload_hash text not null,
  previous_rows jsonb not null,
  resulting_rows jsonb not null,
  created_at timestamptz not null default now(),
  unique(company_id, period_start, request_id)
);
alter table finance_internal.sales_month_revisions enable row level security;
revoke all on finance_internal.sales_month_revisions from public, anon, authenticated;

-- Helper interno. A versão cobre inclusive linhas com deleted_at,
-- pois a substituição removerá fisicamente o conjunto do mês.
create or replace function finance_internal.sales_month_version(
  p_company_id uuid, p_period_start date
) returns text
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.md5(
    coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by s.id)::text
      from public.sales s
      where s.company_id = p_company_id and s.period_start = p_period_start
    ), '[]')
  );
$$;
revoke all on function finance_internal.sales_month_version(uuid,date) from public, anon, authenticated;
grant execute on function finance_internal.sales_month_version(uuid,date) to authenticated;

-- Endpoint somente leitura: não retorna linhas nem nomes. Sempre exige owner/admin.
create or replace function public.sales_month_version(
  p_company_id uuid, p_period_start date
) returns text
language plpgsql stable security invoker set search_path = ''
as $$
declare v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null or not exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = v_user
      and m.role::text in ('owner', 'admin')
  ) then
    raise exception 'Permissão insuficiente para consultar a versão de vendas' using errcode='42501';
  end if;
  return finance_internal.sales_month_version(p_company_id,p_period_start);
end;
$$;
revoke all on function public.sales_month_version(uuid,date) from public, anon, authenticated;
grant execute on function public.sales_month_version(uuid,date) to authenticated;

-- A transação do PostgREST é única para toda a execução da função.
-- O bloqueio por empresa/mês protege duas chamadas simultâneas desta RPC.
-- A revogação de DML direto, abaixo, é imprescindível para que outros clientes
-- não contornem o lock/arquivo imutável.
create or replace function finance_internal.sales_month_commit(
  p_company_id uuid,
  p_period_start date,
  p_period_end date,
  p_expected_version text,
  p_request_id uuid,
  p_rows jsonb,
  p_source_file text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
  v_version text;
  v_previous jsonb;
  v_after jsonb;
  v_id uuid;
  v_hash text;
  v_duplicate finance_internal.sales_month_revisions%rowtype;
begin
  if v_actor is null or not exists (
    select 1 from public.company_members m
    where m.company_id=p_company_id and m.user_id=v_actor
      and m.role::text in ('owner','admin')
  ) then
    raise exception 'Somente owner/admin pode substituir relatórios' using errcode='42501';
  end if;
  if p_company_id is null or p_period_start is null or p_period_end is null
     or p_request_id is null or p_expected_version is null
     or p_expected_version !~ '^[0-9a-f]{32}$' then
    raise exception 'Parâmetros de substituição inválidos' using errcode='22023';
  end if;
  if extract(day from p_period_start) <> 1
     or p_period_end <> (date_trunc('month',p_period_start) + interval '1 month - 1 day')::date then
    raise exception 'O relatório precisa cobrir o mês civil completo' using errcode='22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array'
     or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>500
     or octet_length(p_rows::text)>500000 then
    raise exception 'Relatório excede limites de importação' using errcode='22023';
  end if;
  if length(coalesce(p_source_file,''))>255 then
    raise exception 'Nome do arquivo inválido' using errcode='22023';
  end if;

  -- Validação numérica, identidade e nomes repetidos.
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as x(
      "sellerName" text, "sellerCode" text, "netAmountCents" bigint,
      "returnsCents" bigint, "costCents" bigint,
      "itemsQty" integer, "salesQty" integer
    ) where x."sellerName" is null or btrim(x."sellerName")=''
        or length(x."sellerName")>160
        or x."netAmountCents" is null or x."returnsCents" is null
        or x."costCents" is null or x."itemsQty" is null or x."salesQty" is null
        or x."itemsQty"<0 or x."salesQty"<0
  ) then
    raise exception 'Dados de vendedor incompletos ou inválidos' using errcode='22023';
  end if;
  if (
    select count(distinct lower(regexp_replace(btrim(x."sellerName"),'[[:space:]]+',' ','g')))
    from jsonb_to_recordset(p_rows) as x("sellerName" text)
  ) <> jsonb_array_length(p_rows) then
    raise exception 'Vendedores duplicados no PDF' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text||'|'||p_period_start::text,0)
  );
  v_hash := md5(p_rows::text||'|'||coalesce(p_source_file,'')||'|'||p_period_end::text);

  -- Idempotência: repetir a MESMA requisição retorna o resultado original.
  select * into v_duplicate
  from finance_internal.sales_month_revisions r
  where r.company_id=p_company_id and r.period_start=p_period_start
    and r.request_id=p_request_id;
  if found then
    if v_duplicate.action<>'replace' or v_duplicate.actor_id<>v_actor
       or v_duplicate.payload_hash<>v_hash
       or v_duplicate.previous_version<>p_expected_version then
      raise exception 'Identificador de requisição reutilizado com dados diferentes' using errcode='23505';
    end if;
    return pg_catalog.jsonb_build_object(
      'revisionId', v_duplicate.id, 'version', v_duplicate.resulting_version,
      'saved', jsonb_array_length(v_duplicate.resulting_rows), 'replayed',true
    );
  end if;

  -- Com RLS/DML diretos bloqueados, este lock serializa todas as gravações.
  -- FOR UPDATE também bloqueia as linhas já existentes na transação corrente.
  perform 1 from public.sales s
    where s.company_id=p_company_id and s.period_start=p_period_start
    for update;
  v_version := finance_internal.sales_month_version(p_company_id,p_period_start);
  if v_version<>p_expected_version then
    raise exception 'O mês mudou depois da prévia. Atualize e confira novamente'
      using errcode='40001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb)
    into v_previous from public.sales s
    where s.company_id=p_company_id and s.period_start=p_period_start;

  -- Todos os registros, inclusive antigos soft-deleted, ficam preservados
  -- no histórico privado. DELETE+INSERT são uma única transação do Postgres.
  delete from public.sales s
    where s.company_id=p_company_id and s.period_start=p_period_start;
  insert into public.sales (
    company_id,period_start,period_end,seller_name,seller_code,
    net_amount_cents,returns_cents,cost_cents,items_qty,sales_qty,
    source_file,imported_at,deleted_at
  )
  select p_company_id,p_period_start,p_period_end,
    btrim(x."sellerName"),x."sellerCode",
    x."netAmountCents",x."returnsCents",x."costCents",
    x."itemsQty",x."salesQty",p_source_file,now(),null
  from jsonb_to_recordset(p_rows) as x(
    "sellerName" text, "sellerCode" text, "netAmountCents" bigint,
    "returnsCents" bigint, "costCents" bigint,
    "itemsQty" integer,"salesQty" integer
  );
  get diagnostics v_count = row_count;
  if v_count<>jsonb_array_length(p_rows) then
    raise exception 'Quantidade gravada diverge do arquivo' using errcode='40001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb)
    into v_after from public.sales s
    where s.company_id=p_company_id and s.period_start=p_period_start;
  v_version := finance_internal.sales_month_version(p_company_id,p_period_start);

  insert into finance_internal.sales_month_revisions (
    company_id,period_start,actor_id,request_id,action,
    previous_version,resulting_version,payload_hash,previous_rows,resulting_rows
  ) values (
    p_company_id,p_period_start,v_actor,p_request_id,'replace',
    p_expected_version,v_version,v_hash,v_previous,v_after
  ) returning id into v_id;

  return jsonb_build_object('revisionId',v_id,'version',v_version,'saved',v_count,'replayed',false);
end;
$$;

revoke all on function finance_internal.sales_month_commit(uuid,date,date,text,uuid,jsonb,text)
  from public, anon, authenticated;
grant execute on function finance_internal.sales_month_commit(uuid,date,date,text,uuid,jsonb,text)
  to authenticated;

create or replace function public.sales_month_commit(
  p_company_id uuid, p_period_start date, p_period_end date,
  p_expected_version text, p_request_id uuid, p_rows jsonb, p_source_file text
) returns jsonb
language sql volatile security invoker set search_path = ''
as $$
  select finance_internal.sales_month_commit(
    p_company_id,p_period_start,p_period_end,p_expected_version,p_request_id,p_rows,p_source_file
  );
$$;
revoke all on function public.sales_month_commit(uuid,date,date,text,uuid,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.sales_month_commit(uuid,date,date,text,uuid,jsonb,text)
  to authenticated;

-- Recuperação restrita à última revisão efetiva daquele mês.
-- Gera nova revisão de auditoria; não apaga o histórico da substituição.
create or replace function finance_internal.sales_month_restore(
  p_company_id uuid, p_period_start date, p_revision_id uuid,
  p_expected_version text, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_source finance_internal.sales_month_revisions%rowtype;
  v_duplicate finance_internal.sales_month_revisions%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_version text;
  v_id uuid;
  v_hash text;
begin
  if v_actor is null or not exists (
    select 1 from public.company_members m
    where m.company_id=p_company_id and m.user_id=v_actor
      and m.role::text in ('owner','admin')
  ) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if p_company_id is null or p_period_start is null or p_revision_id is null
     or p_request_id is null or p_expected_version !~ '^[0-9a-f]{32}$' then
    raise exception 'Pedido de restauração inválido' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text||'|'||p_period_start::text,0)
  );
  v_hash := md5(p_revision_id::text||'|'||p_expected_version);

  select * into v_duplicate
  from finance_internal.sales_month_revisions r
  where r.company_id=p_company_id and r.period_start=p_period_start
    and r.request_id=p_request_id;
  if found then
    if v_duplicate.action<>'restore' or v_duplicate.actor_id<>v_actor
       or v_duplicate.restored_revision_id<>p_revision_id
       or v_duplicate.payload_hash<>v_hash then
      raise exception 'Requisição de restauração reutilizada' using errcode='23505';
    end if;
    return jsonb_build_object('revisionId',v_duplicate.id,'version',v_duplicate.resulting_version,'replayed',true);
  end if;

  select * into v_source
  from finance_internal.sales_month_revisions r
  where r.id=p_revision_id and r.company_id=p_company_id
    and r.period_start=p_period_start and r.action='replace';
  if not found then
    raise exception 'Revisão não encontrada nesta empresa e competência' using errcode='22023';
  end if;

  perform 1 from public.sales s
    where s.company_id=p_company_id and s.period_start=p_period_start for update;
  v_version := finance_internal.sales_month_version(p_company_id,p_period_start);
  if v_version<>p_expected_version or v_version<>v_source.resulting_version then
    raise exception 'O período mudou desde a substituição. Restauração automática bloqueada'
      using errcode='40001';
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb)
    into v_before from public.sales s
    where s.company_id=p_company_id and s.period_start=p_period_start;

  delete from public.sales s where s.company_id=p_company_id and s.period_start=p_period_start;
  insert into public.sales (
    id,company_id,period_start,period_end,seller_name,seller_code,
    net_amount_cents,returns_cents,cost_cents,items_qty,sales_qty,
    source_file,imported_at,created_at,updated_at,deleted_at
  )
  select x.id,x.company_id,x.period_start,x.period_end,x.seller_name,x.seller_code,
         x.net_amount_cents,x.returns_cents,x.cost_cents,x.items_qty,x.sales_qty,
         x.source_file,x.imported_at,x.created_at,x.updated_at,x.deleted_at
  from jsonb_to_recordset(v_source.previous_rows) as x(
    id uuid,company_id uuid,period_start date,period_end date,
    seller_name text,seller_code text,net_amount_cents bigint,returns_cents bigint,
    cost_cents bigint,items_qty integer,sales_qty integer,source_file text,
    imported_at timestamptz,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz
  );
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb)
    into v_after from public.sales s
    where s.company_id=p_company_id and s.period_start=p_period_start;
  v_version := finance_internal.sales_month_version(p_company_id,p_period_start);
  insert into finance_internal.sales_month_revisions (
    company_id,period_start,actor_id,request_id,action,restored_revision_id,
    previous_version,resulting_version,payload_hash,previous_rows,resulting_rows
  ) values (
    p_company_id,p_period_start,v_actor,p_request_id,'restore',p_revision_id,
    p_expected_version,v_version,v_hash,v_before,v_after
  ) returning id into v_id;
  return jsonb_build_object('revisionId',v_id,'version',v_version,'replayed',false);
end;
$$;
revoke all on function finance_internal.sales_month_restore(uuid,date,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function finance_internal.sales_month_restore(uuid,date,uuid,text,uuid)
  to authenticated;

create or replace function public.sales_month_restore(
  p_company_id uuid,p_period_start date,p_revision_id uuid,
  p_expected_version text,p_request_id uuid
) returns jsonb
language sql volatile security invoker set search_path = ''
as $$
  select finance_internal.sales_month_restore(
    p_company_id,p_period_start,p_revision_id,p_expected_version,p_request_id
  );
$$;
revoke all on function public.sales_month_restore(uuid,date,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.sales_month_restore(uuid,date,uuid,text,uuid)
  to authenticated;

-- CRÍTICO: bloquear Data API de escrita direta. A importação inicial também
-- deve migrar para public.sales_month_commit ANTES de executar esta proposta.
-- RLS SELECT de leitura por membro permanece aplicável.
revoke insert, update, delete on table public.sales from authenticated, anon;
drop policy if exists "members write sales" on public.sales;

commit;
