# Financeiro Raio-X — Procedimento de ativação integral (17/11/2026)

## Estado verificado
- Origem: Lovable Cloud, projeto `ddd280ef-a069-4fdd-af81-32cc7be680ee` (`Insight Navigator`).
- Destino: Supabase Primary `wamavqanocvollvjpahr`.
- Banco financeiro: 17.071 registros (11 tabelas) reconciliados por **contagem e checksum integral**.
- DDL: 142/142 colunas com nomes, tipos e nullability idênticos ao esquema de origem; 32 constraints, 16 índices faltantes e gatilhos updated_at reinstalados.
- Segurança: RLS por empresa, leitura anônima bloqueada, staging sem privilégio SELECT para `anon` ou `authenticated`.
- Auth: origem 7 usuários + 7 identidades (2 email, 5 Google), destino 0/0; 3 membros aguardam vinculação.
- Storage: bucket de backup privado na origem; arquivo original preservado, não exportado ao destino.
- Produção original NÃO foi redirecionada.

## Por que o Auth não foi importado por esta sessão
O Supabase backend administrado pelo Lovable Cloud não aparece nas contas Supabase do usuário e não disponibiliza credenciais de conexão externa. O conector usado nesta sessão não tem operação suportada de export/import Auth e a tentativa de movimentar dados de credenciais foi bloqueada pelas configurações de segurança. Não reutilizar SQL ad hoc com hashes/senhas em chat, log ou repositório.

Documentação oficial:
- https://supabase.com/kb/troubleshooting/cant-access-supabase-project-lovable-cloud
- https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Sequência autorizada para a migração final
1. Acessar o painel do projeto original no Lovable e obter o export completo do backend pelo recurso de exportação permitido, incluindo auth quando suportado. Se o export não incluir as credenciais, solicitar procedimento de exportação Auth ao suporte do Lovable. Fazer tudo via canal privado/local e nunca publicar o material.
2. Fazer a importação autorizada do Auth no destino, com verificação de hashes e identidades. Conservar os mesmos UUIDs dos sete usuários. Não importar sessões antigas/recovery tokens que não devam continuar válidos.
3. Reconfigurar email/SMTP, provedores Google OAuth, callbacks, Site URL e redirecionamentos no projeto Supabase de destino.
4. Executar `supabase/migration_audit/20261117_activate_members_after_auth.sql` para ativar os três vínculos empresariais, sem criar registros de Auth artificiais.
5. Executar `supabase/migration_audit/20261117_finalize_auth_references.sql`, que valida relações dos identificadores com `auth.users` e acrescenta quatro FKs pendentes.
6. Executar `supabase/migration_audit/20261117_cutover_gate.sql` — todos os 13 itens devem estar como PASS; refazer comparação com a origem para detectar novas escritas após a exportação.
7. Executar testes funcionais com sessão real: login por email e Google, cadastro e convites, perfis, DRE/CMV, caixa, vendas, estoque, importação ERP e processamento de jobs, isolamentos RLS. Corrigir falhas antes da troca.
8. Fazer deploy INDEPENDENTE (ou criar novo projeto Lovable configurado desde o início com Supabase externo), pois Lovable Cloud existente não pode ser simplesmente desconectado do backend gerenciado. Variáveis necessárias no host: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor.
9. Em janela controlada, suspender gravações na origem, reconciliar delta, trocar simultaneamente configurações frontend/backend, fazer smoke tests e reabrir escrita. Conservar caminho de rollback.

## Não executar automaticamente
- Não apontar a aplicação publicada para Supabase sem Auth.
- Não regenerar manualmente usuários com UUIDs diferentes sem estratégia formal de mapeamento.
- Não inserir senhas, hashes, JWTs, service_role ou backups em GitHub.
- Não criar nova automação de importação ao reativar jobs históricos.
- Não modificar os dados existentes da origem enquanto não houver janela de virada.

## Paridade pendente
Quatro FKs referenciam Auth e só podem ser aplicadas depois de migrados os UUIDs: `companies.owner_id`, `company_invitations.invited_by`, `transactions.created_by`, `inventory_snapshots.created_by`.
