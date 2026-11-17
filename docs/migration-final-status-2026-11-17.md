# Financeiro Raio-X — Fechamento técnico de migração (17/11/2026)

## Resultado
**Dados empresariais e financeiros restaurados no Supabase Primary; cutover NÃO realizado.** A produção Lovable Cloud permanece apontada ao banco original.

### Destino
- Projeto: `wamavqanocvollvjpahr`
- Origem Lovable: projeto `ddd280ef-a069-4fdd-af81-32cc7be680ee` (Insight Navigator / Financeiro Raio-X).
- Repositório: `MBaldwinJr/financeiroraiox` main.

### Registros e somatórios verificados entre origem e destino
- `companies`: 1 / 1.
- `cost_centers`: 7 / 7.
- `bank_accounts`: 2 / 2.
- `categories`: 19 / 19.
- `erp_account_mappings`: 78 / 78.
- `goals`: 2 / 2.
- `inventory_snapshots`: 6 / 6.
- `sales`: 166 / 166; soma `net_amount_cents`: 1.644.965.733 em ambos.
- `transactions`: 16.749 / 16.749; soma `amount_cents`: 5.877.619.121 em ambos.
- Lançamentos excluídos logicamente: 6.377 / 6.377.
- 17.030 registros empresariais e financeiros carregados com `BEGIN/COMMIT`.
- 50 registros retidos em `migration_stage`: 3 `company_members`, 6 `company_invitations`, 35 `import_jobs`, 6 `rate_limit_buckets`. Não reativar convites, jobs e throttling históricos inadvertidamente.

### Bloqueio de autenticação e acesso
- Origem: 7 usuários de `auth.users`, 7 `auth.identities`; 2 provedores email e 5 Google; 3 vínculos de empresa.
- Destino: 0 usuários Auth, 0 membros. O acesso funcional com login real ainda NÃO pode ser atestado.
- Tentativa de copiar as credenciais via ferramenta foi bloqueada por política de segurança. Nenhuma identidade foi copiada por via indireta.
- A transferência dos hashes e identidades requer procedimento oficial de exportação e importação de Auth, com direitos apropriados, verificação de provedores, redirecionamentos e login real. Guia oficial: https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects
- Tokens de sessão existentes não foram transportados. A mudança de projeto exige nova autenticação, salvo configuração segura específica de JWT, que não foi realizada.

### Compatibilização implementada
- Tabelas originais adicionais, tipos e defaults para compatibilidade com o aplicativo.
- Políticas RLS por empresa e validações de acesso: `anon` e `authenticated` sem JWT veem zero lançamentos.
- Índices de empresa, competência, datas e FKs de integridade.
- Visualizações privadas para conciliação de fluxo e categorias.
- RPCs restauradas para roles e convites; execução anônima das RPCs revogada.
- O gatilho original `company_owner_on_create` está novamente habilitado.
- Perfis comerciais: compras a fornecedores não equivalem automaticamente a CMV/DRE; manter modelos separados.
- Aviso de segurança de baixa criticidade esperado: `rate_limit_buckets` usa RLS sem políticas para clientes. Convites com execução privilegiada por usuários autenticados demandam revisão de segurança adicional antes do cutover.
- `consume_rate_limit` e demais comportamentos de processamento/trigger não foram validados integralmente na aplicação.

### Critérios de cutover ainda pendentes
1. Migrar 7 usuários e 7 identidades com IDs preservados usando Auth export/import autorizado; validar Google OAuth e e-mail, sem publicar credenciais em GitHub.
2. Reconciliar e carregar 3 membros após autenticação; conferir perfis owner/admin/member.
3. Decidir restauração segura dos 6 convites, 35 jobs e 6 rate limits (preferível não reativar jobs passados).
4. Testar login real, convite, novos cadastros, fluxo de caixa, DRE, CMV, exclusões lógicas, edição de lançamentos, importação ERP e isolamento de empresas.
5. Confirmar que nenhum registro surgiu na origem após o último snapshot e reconciliar novamente.
6. Configurar as variáveis de ambiente do frontend para a nova URL e chave publicável, configurar provedores OAuth e redirects, testar e só então fazer o cutover com reversão preparada.

**Sem cutover e sem confirmação dos testes funcionais, o Financeiro Raio-X não deve ser declarado migrado integralmente.**
