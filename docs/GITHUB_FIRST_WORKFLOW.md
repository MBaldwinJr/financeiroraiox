# Fluxo de desenvolvimento — Financeiro Raio-X

## Fonte de verdade

- **GitHub:** `MBaldwinJr/financeiroraiox`, branch principal `main`.
- **Lovable:** projeto `ddd280ef-a069-4fdd-af81-32cc7be680ee` (Insight Navigator), utilizado para **preview visual**.
- As alterações de código são preparadas, revisadas, testadas e commitadas pelo GitHub. Não usar o agente do Lovable para editar código enquanto este fluxo estiver em vigor.
- O preview do Lovable acompanha os commits sincronizados na branch `main`; isso não equivale à publicação automática em produção.

## Procedimento para melhorias

1. Confirmar a versão de `main` antes de começar uma alteração.
2. Para mudanças funcionais, usar uma branch dedicada, com um escopo definido.
3. Implementar preservando autenticação, segurança de dados, cálculos financeiros, permissões e migrações existentes.
4. Validar, sempre que o ambiente permitir: `npm run lint` e `npm run build`, além de testes específicos da mudança.
5. Revisar o diff e criar commits descritivos (ex.: `fix(dre): evitar dupla contabilização do CMV`).
6. Integrar na `main` apenas alterações verificadas, para refletir no preview Lovable.
7. Verificar o commit sincronizado e revisar o preview. Informar explicitamente quando não for possível testar.

## Segurança

- Não executar alterações de banco, migrações destrutivas ou modificações de dados financeiros de produção para validar mudanças visuais.
- Não adicionar credenciais, tokens ou chaves secretas ao repositório. Variáveis locais devem ficar fora do controle de versão.
- Proteger isolamento de dados por empresa, autenticação e políticas RLS.
- Nunca supor que um commit, sincronização ou build passou sem verificar o resultado.

## Endereços

- Repositório: https://github.com/MBaldwinJr/financeiroraiox
- Projeto Lovable: https://lovable.dev/projects/ddd280ef-a069-4fdd-af81-32cc7be680ee
- Preview Lovable: https://id-preview--ddd280ef-a069-4fdd-af81-32cc7be680ee.lovable.app
