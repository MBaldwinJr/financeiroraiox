# Financeiro Raio-X — Vercel Preview (sem troca de produção)

## Escopo
Este procedimento prepara apenas um **preview isolado** do repositório `MBaldwinJr/financeiroraiox`.
A produção publicada no Lovable Cloud continua operando no banco original. **Não** aplicar merge em `main`, associar domínio definitivo ou promover para Production antes dos testes.

## Código preparado
- Branch: `deploy/vercel-preview-20261121`
- `vite.config.ts`: ativa o preset `vercel` do Nitro somente em builds com `VERCEL=1`; o build Lovable mantém seu alvo anterior.
- `src/routes/auth.tsx`: Google OAuth usa `supabase.auth.signInWithOAuth({ provider: 'google' })` em vez do broker proprietário do Lovable Cloud.
- `tests/vercel-preview.test.cjs`: contratos locais de OAuth, build Vercel e segregação de chaves.
- A infraestrutura financeira restaurada permanece no Supabase `wamavqanocvollvjpahr`; nenhuma migration de dados foi executada para o preview.

## Vercel — configuração proposta
1. Conceder acesso à equipe Vercel se solicitado, pelo consentimento oficial (o token de consentimento é temporário).
2. Importar o repositório GitHub e confirmar **Framework Preset: TanStack Start** (ou TanStack Start Lovable, caso detectado); root directory `.`.
3. Para gerar apenas preview: implantar a branch `deploy/vercel-preview-20261121` no ambiente **Preview**; não associar o domínio definitivo. De preferência ativar Deployment Protection para restringir acesso ao preview contendo dados reais.
4. Usar Node.js >= 24 conforme a documentação Vercel para TanStack Start. O comando padrão é `npm run build`; **não** aplicar rewrite catch-all de SPA, pois SSR e server routes exigem Nitro.
5. Se as funções SSR falharem, inspecionar logs Vercel e confirmar a variável `VERCEL=1` do ambiente de build e o preset Nitro.

## Variáveis do Preview — configurar na UI da Vercel (nunca commitar)
| Variável | Local | Valor |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Client (build) | `https://wamavqanocvollvjpahr.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client (build) | Chave publishable do **destino**, obtida no painel Supabase |
| `SUPABASE_URL` | Server | `https://wamavqanocvollvjpahr.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Mesma chave publicável do destino |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service role key do destino; apenas quando forem testar fluxos de servidor privilegiados. Nunca usar prefixo `VITE_`. |

**Cuidado com acesso a dados reais:** mesmo sem domínio definitivo, o preview conectado ao banco de destino pode gravar dados. Proteger o preview, evitar testes destrutivos e não executar importações reais antes da autorização de teste de escrita.

## OAuth e redirecionamentos
1. No Google Cloud OAuth Client (Web), cadastrar como **Authorized redirect URI**:
   `https://wamavqanocvollvjpahr.supabase.co/auth/v1/callback`
2. No Supabase → Authentication → Providers → Google: registrar **Client ID** e **Client Secret** do mesmo cliente OAuth. Manter 'Skip nonce checks' e 'Allow users without an email' desligados.
3. No Supabase → Authentication → URL Configuration: adicionar o endereço **exato** do preview como redirect permitido (por exemplo `https://<dominio-preview>/auth`). A lista de redirecionamentos deve conter os domínios utilizados; evite permissões amplas para produção.
4. A URL do Google Cloud acima aponta ao Supabase; a URL `https://<dominio-preview>/auth` aponta ao frontend Vercel. São URLs diferentes, ambas necessárias.
5. Validar uma conta Google já migrada e uma conta e-mail/senha, sem expor senhas e tokens nos logs.
6. Para e-mails de convite, configurar SMTP e URLs de confirmação/recuperação antes de testes de envio real.

## Checklist de homologação
- [ ] Build Vercel e SSR sem erro/404 na home, `/auth` e `/dashboard`.
- [ ] Login Google e login e-mail/senha para usuários migrados; refresh/logout.
- [ ] Perfil proprietário vê empresa, dashboard, DRE, fluxo de caixa, vendas.
- [ ] Membro acessa dados permitidos mas não os convites administrativos.
- [ ] Usuário autenticado sem vínculo não vê dados de empresa.
- [ ] DRE e CMV não duplicam despesa com fornecedores; contar registros de `deleted_at` apenas conforme regras financeiras.
- [ ] Server functions funcionam sob JWT Supabase e políticas RLS.
- [ ] Importação ERP, convites e e-mails testados de forma controlada; alterações de teste removidas/verificadas antes da liberação.
- [ ] Performance e erros observados nos logs, em especial em acessos grandes a `transactions`.
- [ ] Manifesto/checksum financeiro comparado novamente à origem antes do cutover.

## Cutover (etapa separada)
Somente após validação e autorização de uma janela: congelar escrita no Lovable, reconciliar delta, manter backup e rollback; apontar a hospedagem definitiva ao Supabase Primary, confirmar login e reabrir gravações. **Este branch/PR não realiza cutover.**

## Referências
- https://vercel.com/docs/frameworks/full-stack/tanstack-start
- https://vercel.com/kb/guide/deploy-a-tanstack-start-app-to-vercel
- https://supabase.com/docs/guides/auth/social-login/auth-google
