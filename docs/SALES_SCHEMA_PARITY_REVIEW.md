# Financeiro Raio-X — Paridade estrutural e controle de privilégios da tabela `sales`

**Leitura do catálogo Lovable Cloud:** 11/11/2026. **Este documento não autoriza implantação.** Nenhum dado financeiro ou identidade foi exportado.

## Descobertas confirmadas por introspecção somente leitura

A tabela `public.sales` possui 16 colunas, FK `sales.company_id -> companies.id ON DELETE CASCADE`, chave única `(company_id, period_start, seller_name)`, índice adicional `sales_company_period_idx` e trigger `set_sales_updated_at`. Não foram encontrados outros relacionamentos FK apontando para `sales` no escopo inspecionado.

`public.companies.owner_id` referencia `auth.users(id)` e `company_members.user_id` também. `company_members` possui `id` próprio, default para `role=member`, FKs com exclusão em cascata e índices por empresa e usuário. O banco utiliza `is_company_member` e `has_company_role` como funções `SECURITY DEFINER` de consulta a associações. **A fixture anterior não reproduzia esses elementos.**

### Achado crítico de permissão

A inspeção de `information_schema.role_table_grants` confirmou que **`anon` e `authenticated` têm `TRUNCATE` na tabela `sales`**, entre outros privilégios excessivos, mesmo com RLS ativada. `TRUNCATE` não é uma operação protegida por políticas RLS. O rascunho anterior revogava somente `INSERT/UPDATE/DELETE`; corrigimos o rascunho para:

```sql
revoke all privileges on table public.sales from public, anon, authenticated;
grant select on table public.sales to authenticated;
drop policy if exists "members write sales" on public.sales;
```

**Essas linhas não foram executadas em produção.** A manutenção de `service_role` e de outros papéis privilegiados deve ser avaliada separadamente, e todos os fluxos que gravam em `sales` precisam migrar para APIs auditadas antes da aplicação.

## Validação local automatizada

A fixture `tests/supabase/sales-auth-fixture.sql` modela agora a estrutura observada, incluindo FKs nativas do GoTrue, índices, defaults, funções de associação e políticas RLS. O script `tests/supabase/test_auth_rls.py` cria cinco usuários reais **somente no Supabase local** e depois insere empresas e vendas sintéticas; nenhuma conexão hospedada é permitida. O teste `tests/supabase/sales-schema-contract.sql` verifica contratos de DDL e que `TRUNCATE`, `REFERENCES`, `TRIGGER` e DML diretos foram revogados, enquanto o `SELECT` autenticado continua protegido por RLS.

O workflow de integração PostgreSQL também simula inicialmente grants excessivos antes de aplicar a mesma proposta corrigida, validando o bloqueio real.

## Compatibilidade com outros módulos

O código mantém leitura `sales` em Vendas por Colaborador, Dashboard, conciliação CMV e Performance Comercial. Essas operações continuam possíveis com `SELECT` e RLS por empresa.

Os endpoints **`importSales`** e **`deleteSalesPeriod`** hoje ainda fazem escrita direta quando a implantação não está explicitamente configurada para homologação. A proposta SQL bloqueará essa escrita. O roteiro seguro exige atualizar/deprecar todos esses caminhos e verificar cronogramas de importação antes de implantar. Uma migração prematura causará erros nas importações e exclusões, embora não deva permitir acesso indevido.

## Limites e próximos critérios

- A paridade cobre o recorte relevante `companies`, `company_members`, `sales` e as funções/políticas relacionadas. Não é um clone integral do projeto Lovable Cloud nem prova de ausência de outras dependências funcionais.
- Uma validação com uma cópia integral **sem dados reais**, incluindo funções/triggers/vistas fora do recorte, deve preceder qualquer produção.
- Antes de execução em produção, verificar novamente o catálogo e os grants no ambiente hospedado, conferir quais clientes usam DML direto, revisar o SQL de alteração e ter backup/reversão supervisionados.
- `finance_internal` não deve ser schema exposto pela Data API.
- CI bem-sucedido em dados sintéticos não significa migração aplicada nem CMV homologado.

**Nenhuma migração, substituição de PDF, alteração de RLS ou revogação de privilégios foi feita no banco usado pelo Lovable.**
