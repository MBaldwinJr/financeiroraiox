# Financeiro Raio-X — Log de migração (17/11/2026)

## Escopo e restrições
- Origem: Lovable Cloud, backup de 12/11/2026.
- Destino: Supabase Primary, projeto `wamavqanocvollvjpahr` (`financeiro-raio-x`).
- Não criar branch de homologação; não alterar a origem em produção antes da reconciliação.
- Evitar migração automática com perda de semântica financeira, dados, usuários ou vínculos.

## Evidências verificadas diretamente no destino
- Projeto Supabase em estado `ACTIVE_HEALTHY`, PostgreSQL 17.
- Esquema privado `migration_stage` contém `source_manifest` e `source_records`.
- 14 tabelas no manifesto, com `expected_rows = copied_rows = staged_rows` para todas elas.
- 17.080 registros de origem copiados para staging, incluindo 16.749 `transactions`, 166 `sales`, 78 `erp_account_mappings`, 35 `import_jobs`, 19 `categories` e 1 `companies`.
- Sem duplicidade de `source_key` nas tabelas staging com registros; `payload` JSONB válido em todos os registros verificados.
- `auth.users` no destino: 0. A migração de autenticação não foi executada.
- Tabelas public de produção consultadas (`companies`, `company_members`, `financial_entries`, `cash_movements`, `financial_accounts`, `financial_categories`, `cost_centers`) com 0 registros.
- Auditor de segurança Supabase retornou 0 avisos naquele instante.

## Bloqueio de compatibilidade
O destino atual utiliza estrutura diferente da origem:
- Origem: `transactions.amount_cents`, `kind`, `competencia`, `paid_at`, `bank_account_id`, `category_id`, `fingerprint`, `deleted_at`.
- Destino: `financial_entries.amount`, `nature`, `competence_date`, `financial_accounts`, `financial_categories`.
- Origem tem tabelas sem equivalente direto atualmente listado em public, incluindo `sales`, `inventory_snapshots`, `import_jobs`, `erp_account_mappings`, `goals`, `company_invitations`.
- `companies.owner_id`, `company_members.role` e metadados de categorias/centros de custo exigem mapeamento próprio.
- Portanto, NÃO tratar a cópia em staging como conclusão da migração e NÃO substituir dados diretamente.

## Próximas etapas objetivas
1. Preservar esquema e dados nativos do Financeiro Raio-X no destino, com migrações versionadas.
2. Definir mapeamento exato dos 14 conjuntos de dados, das chaves estrangeiras, de Auth e RLS.
3. Validar tratamento de receitas, despesas, CMV, fornecedores, competências, liquidação, estornos e cancelamentos.
4. Importar com transações controladas e reconciliação quantitativa e financeira.
5. Sincronizar as alterações desde o backup de 12/11, testar login e acesso e só então modificar conexão da aplicação.
6. Registrar contagens, somatórios por mês, divergências e plano de rollback.

## Estado conclusivo
**Staging conferido; carga definitiva, Auth e cutover ainda NÃO realizados.** Nenhuma alteração de dados foi efetuada nesta auditoria.
