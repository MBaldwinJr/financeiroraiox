# Financeiro Raio-X — Cutover integral: gate de 17/11/2026

## Estado objetivo
**NO-GO: banco financeiro restaurado, mas a troca da produção continua bloqueada por Auth.**

Origem: projeto Lovable `ddd280ef-a069-4fdd-af81-32cc7be680ee`.
Destino: projeto Supabase Primary `wamavqanocvollvjpahr`.
GitHub: `MBaldwinJr/financeiroraiox` (branch main).

## Executado e validado
- **17.071 registros** em tabelas operacionais do destino, preservando IDs: 17.030 financeiros/empresariais, 35 importações concluídas/falhas e 6 convites expirados.
- As 11 tabelas de origem não relacionadas à autenticação com dados operacionais restaurados apresentam contagens iguais e **zero chaves ausentes**.
- Transações: **16.749**; soma histórica de `amount_cents` **5.877.619.121** em ambos os bancos.
- Vendas: **166**; soma de `net_amount_cents` **1.644.965.733** em ambos.
- Excluídos logicamente: **6.377** em ambos.
- Hashes agregados comparáveis por ID e campos críticos iguais entre origem e destino:
  - transactions: `1dc65bf9e6c8a6a085199097d59077ec`
  - sales: `05194ee056e7add52fb96cb1642d9c5d`
- RLS testada: `anon` e `authenticated` sem sessão veem zero transações.
- Restauradas interfaces de roles/convites com execução anônima revogada.
- Restaurada a RPC `consume_rate_limit`, executável apenas por `service_role`; teste com limite 2: true, true, false (rollback).
- Índices e constraints relacionais migrados, gatilho de criação do proprietário habilitado.
- Bucket privado na origem `database_export_12_11_26` guarda 1 objeto de backup (~6,9 MB). Não duplicar metadata sem bytes; arquivo segue preservado na origem.
- `rate_limit_buckets` possui 6 registros efêmeros na origem, não migrados para evitar transportar limitação expirada.

## Gatilho de liberação executado
`supabase/migration_audit/20261117_cutover_gate.sql`:
- 10 PASS: contagens/somas, exclusões lógicas, jobs, convites, relacionamento existente e gatilho;
- 3 BLOCK: `auth_users`, `auth_identities`, `company_members`.

## Bloqueios reais
1. Origem: 7 usuários Auth, 7 identidades (2 email, 5 Google) e 3 memberships. Destino: 0/0/0.
2. Transferência de hashes de senha e identidades diretamente via ferramenta foi **bloqueada pelo controle de segurança da plataforma**. Não contornar esse bloqueio, não transportar senhas por chat/GitHub.
3. Realizar transferência do schema Auth por canal privilegiado, apoiado no procedimento oficial de Supabase, preservando UUIDs, provedores, hashed passwords e identidade. Fonte: https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects
4. Depois do Auth, executar `supabase/migration_audit/20261117_activate_members_after_auth.sql`; o script verifica UUIDs e exige 3 memberships.
5. Configurar Google OAuth, redirect URLs, configurações email/SMTP e environment variables da aplicação (cliente e servidor). **Não existe conector de configuração de secrets do host nesta sessão.**
6. Testar login real e recursos integrados: DRE, dashboard, CRM de convites, CMV, pagamentos de fornecedores, vendas, importações e processamento de jobs.
7. Congelar gravações na origem, refazer verificações de sincronização e somente então trocar URLs/keys e publicar, mantendo rollback.

## Proteção
Origem Lovable Cloud não alterada; frontend publicado não reconfigurado. Produção permanece utilizável na conexão original até autenticação e testes serem concluídos.

Este documento não contém senhas, chaves de servidor, emails de usuários, dumps ou tokens.
