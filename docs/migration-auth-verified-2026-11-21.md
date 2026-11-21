# Financeiro Raio-X — Auditoria pós-restauração Auth | 21/11/2026

## Estado confirmado
- Supabase Primary: `wamavqanocvollvjpahr`; backend restaurado, produção original Lovable Cloud mantida.
- **7 usuários Auth, 7 identidades, 3 vínculos empresariais** restaurados e verificados diretamente no destino.
- Provedores presentes: 5 identidades Google, 2 identidades por e-mail.
- **Zero referências órfãs** de usuários em identidades, membros, proprietário, convites, transações e inventário.
- As 4 chaves estrangeiras para `auth.users` estão ativas.
- Comparação com a origem: os 7 registros `auth.identities` coincidem integralmente; dos 34 campos de `auth.users`, 33 coincidem, e apenas o campo `updated_at` mudou na importação. Campos comuns dos três vínculos empresariais coincidem.
- Lançamentos: 16.749, soma 5.877.619.121 centavos; vendas: 166, soma 1.644.965.733 centavos; 6.377 exclusões lógicas. Histórico de importações 35 e convites 6.
- `20261117_cutover_gate.sql`: **13/13 PASS**, executado após a restauração Auth.
- Testes RLS usando contexto PostgreSQL de sessão simulada (não substituem login real): **owner** vê os dados, **member** vê dados mas não convites administrativos; **outsider** não vê nenhuma linha; anônimo sem acesso aos dados.
- Teste transacional de INSERT de lançamento com proprietário autenticado simulado: passou e foi **revertido por ROLLBACK**.
- Índices FK pós-Auth restaurados em `20261121_post_auth_fk_indexes.sql`.

## Avisos do advisor
- Segurança: `rate_limit_buckets` usa RLS propositalmente sem políticas para clientes (somente service role).
- Duas funções `SECURITY DEFINER` para convites são invocáveis por usuários autenticados; elas precisam do contexto privilegiado limitado para examinar/aceitar convite por token, mas exigem revisão com testes de fluxo de convite antes do cutover.
- **Leaked Password Protection** do Supabase Auth deve ser habilitada no painel.
- Avisos `unused_index` logo após a criação são esperados até haver tráfego real.

## Gate de release ainda pendente (NÃO ativar antes)
1. Login **real** por e-mail/senha e login Google para pelo menos um usuário de cada provedor, além de logout/refresh. Não copiar senhas para repositório ou chat.
2. Configurar Google OAuth no projeto de destino, URLs de callback, Site URL, Redirect URLs e, conforme o fluxo, SMTP para recuperação de senha/convites.
3. Hospedar o aplicativo com backend apontando **exclusivamente** ao novo Supabase; configurar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` só no servidor, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no cliente. Nunca commitar segredos.
4. Revisar o adaptador de deploy: `vite.config.ts` utiliza `@lovable.dev/vite-tanstack-config`, cujo build Nitro padrão é Cloudflare. Validar plataforma antes de escolher Vercel ou outra hospedagem.
5. Conferir DRE, CMV, fornecedor, fluxo, compras, vendas, importações/EDI e tempos de resposta em ambiente já conectado ao destino.
6. Congelar escrita na origem, reconciliar diferenças/novos lançamentos, publicar com rollback e validar os testes de fumaça.

A migração de dados e identidades está concluída, mas **o cutover de aplicação NÃO foi realizado**.
