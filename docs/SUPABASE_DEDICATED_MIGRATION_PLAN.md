# Financeiro Raio-X — Plano de migração Lovable Cloud → Supabase dedicado

Status: **PREPARAÇÃO / NÃO EXECUTAR CUTOVER**. O Lovable permanece como preview, o GitHub como fonte de código e migrações. O banco atual continua sendo a fonte de verdade até homologação e autorização explícita para a janela de virada.

## Decisão arquitetural

Criar um **novo projeto dedicado** no Supabase, preferencialmente `sa-east-1`, sob organização controlada pelo proprietário do sistema. Não reutilizar projetos de outros produtos, mesmo que estejam inativos. Provisionar um ambiente isolado de homologação e um destino de produção separado, sem copiar dados reais para ambientes públicos.

Manter o app TanStack/Lovable existente: sua interface usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; o servidor usa `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e, em operações estritamente privilegiadas, `SUPABASE_SERVICE_ROLE_KEY`. Mudança de ambiente requer configurar **todos os caminhos**, inclusive middleware e preview, nunca apenas a URL no navegador. Não commitar chaves, dumps ou arquivos `.env`.

## Inventário de dependências a migrar

- PostgreSQL: tabelas/relacionamentos, tipos, índices, triggers, funções, permissões/RLS e dados comerciais e financeiros. Comparar esquema ativo com migrations históricas — não presumir que arquivos no repositório reproduzam a estrutura atual.
- Auth: `auth.users`, `auth.identities`, hashes de senha, provedores OAuth, callbacks, SMTP, templates, rate limits, política de sessão e preservação de UUIDs. Contas por Google e e-mail exigem teste específico; sessões antigas podem precisar novo login.
- Configuração: chaves publicáveis/secretas novas, domínios, CORS, redirect URLs, mensagens de convite, agendamentos `pg_cron`, extensões `pg_net`, `pgcrypto`, `uuid-ossp`, `supabase_vault` e funções `SECURITY DEFINER`.
- Storage: inspecionar buckets, políticas e objetos. Não interpretar backup SQL como cópia de arquivos.
- Serviços externos: revisar quais rotas/backend usam o banco atual, dashboards de vendas, importação ERP/PDF, auditoria DRE, convites, relatórios e processamento assíncrono.
- Segurança: revogar privilégios desnecessários e revisar cada política; `service_role` permanece exclusivamente em funções de servidor. A função de substituição mensal é uma mudança independente que exige testes e decisão de implantação.

## Gate 0 — Decisão e proteção da origem

1. Selecionar/autorizar organização Supabase e provisionar projeto **novo**, não reaproveitar bancos de outro produto.
2. Registrar o projeto de destino em gerenciador seguro de segredos; não passar senhas ou service keys em chats, PRs, logs ou URLs.
3. Confirmar backup da origem com possibilidade real de restauração, inclusive Auth; não desligar o Lovable Cloud e não executar `DROP` nem DML corretivo sobre ele.
4. Capturar manifesto de comparação **sem dados privados**: tabelas, contagens por tabela, versões de extensões, índices, RLS, triggers, funções, jobs e Auth identities por provedor. Guardar manifests com contagens financeiras fora do GitHub público.
5. Avaliar se o Lovable permite exportar as credenciais de conexão, um backup completo e o conteúdo de `auth`. Se não permitir, não prometer migração 1:1.

## Gate 1 — Homologação em Supabase dedicado

1. Instalar estrutura da origem em projeto novo isolado, com dados sintéticos. Incluir extensões e políticas compatíveis.
2. Validar Auth: email/senha, Google OAuth, cadastro, renovação de sessão, convites e permissões multiempresa. Verificar UUIDs e FKs após a transferência.
3. Validar módulos: dashboard, fluxo de caixa, DRE, CMV, estoque, vendas, relatórios, IA, importação ERP/PDF e convites.
4. Testar RPC de substituição de vendas separadamente, com rollback, idempotência e concorrência. Não ativar em produção por padrão.
5. Medir latência com dados de volume similar à origem, revisar índices e logs, e conferir queries paginadas e cache.

## Gate 2 — Ensaio completo de migração e reconciliação

1. Exportar de forma criptografada, por meio de canal autenticado, esquema, roles compatíveis e dados. Preservar IDs, timestamps, `deleted_at`, status e referências.
2. Importar para o novo projeto; preservar Auth e identidades com estratégia compatível à versão dos projetos. Não recriar contas manualmente com UUIDs diferentes.
3. Conferir por empresa e competência: número de linhas, vendas/custos/CMV, receitas/despesas, pagamentos a fornecedores, estoque e indicadores. Hashes ou checksums sobre conjuntos canônicos além da contagem.
4. Reconfigurar OAuth Google, email, convites, URL de aplicação e segredos do destino. Revalidar domínios e callback URLs.
5. Testar restauração **antes da virada**, inclusive de Auth e estrutura, e registrar os resultados sem publicar registros financeiros.
6. Executar o ensaio em isolamento, sem duas fontes graváveis simultâneas.

## Gate 3 — Cutover controlado

1. Aprovar janela de manutenção, aviso aos usuários, critérios de GO/NO-GO e responsáveis. Obter backup íntegro e ponto de retorno da origem.
2. Colocar a aplicação **em modo manutenção para escrita** e aguardar finalizar importações e jobs em andamento. Não permitir novas vendas importadas em apenas um dos bancos.
3. Fazer última exportação incremental/total consistente, importar ao destino e repetir reconciliação de totais e integridade referencial.
4. Mudar simultaneamente variáveis do cliente e servidor: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Confirmar build e deploy do Lovable/host e OAuth callbacks.
5. Smoke tests com usuários autorizados: login, DRE, dashboard, fluxo, vendas, estoque, importação, multitenancy e RLS. Somente então liberar escrita.
6. Manter a origem **somente leitura e disponível** pelo prazo de retenção acordado, sem operações de escrita paralelas. Reverter a mudança de configuração e reconciliar novas escritas do destino antes de qualquer rollback.

## Critérios mínimos de sucesso

- Todas as tabelas e registros esperados reconciliados; não aceitar diferenças financeiras sem justificativa documentada.
- Preservação de IDs de empresas, usuários e relações; login funcional tanto com email quanto Google.
- Nenhum vazamento entre empresas, `anon` sem escrita; políticas sensíveis testadas via Auth real.
- Nenhuma duplicação de transações, PDFs ou lançamentos de CMV; validação da DRE por competência.
- Aplicação estável nas telas essenciais e tempos de carregamento medidos antes/depois.
- Processo de backup e restauração funcional, monitoramento e logs sem segredos.

## Bloqueadores presentes (não ignorar)

- **Projeto Supabase exclusivo ainda não selecionado/provisionado.** Há várias contas conectadas; não inferir titularidade da organização.
- É necessário confirmar mecanismo seguro para exportar base e `auth` do Lovable Cloud (o conector SQL permite leitura, mas não é substituto para dump fiel do PostgreSQL).
- OAuth Google e emails exigem configuração no destino; usuários podem precisar entrar novamente.
- A proposta de substituição SQL de vendas continua em `docs/sql`, não foi instalada no banco atual.
- O risco específico de `TRUNCATE` em `public.sales` foi corrigido no banco atual em 12/11/2026; esta proteção não substitui uma revisão das demais tabelas/grants.

## Documentação oficial

- https://supabase.com/docs/guides/platform/migrating-within-supabase
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/platform/clone-project
- https://supabase.com/docs/guides/platform/backups

**Nunca armazenar dump, banco, senhas, JWTs ou IDs de usuários no repositório.**
