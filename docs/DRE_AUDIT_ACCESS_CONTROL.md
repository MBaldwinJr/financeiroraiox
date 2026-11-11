# Auditoria DRE — controles de acesso e risco residual

Esta nota descreve apenas a arquitetura, sem dados reais ou identificadores de usuários.

## Situação confirmada

- A aplicação já possui papéis por empresa: `owner`, `admin`, `member`.
- As operações de leitura da Auditoria DRE precisam continuar acessíveis aos membros autorizados.
- As políticas RLS atualmente registradas para `public.transactions` e `public.categories` permitem `ALL` a qualquer usuário para o qual `is_company_member(company_id, auth.uid())` seja verdadeiro.
- A política RLS evita cruzar empresas, mas **não restringe a escrita apenas a proprietários e administradores**.
- As rotas sensíveis da Auditoria DRE agora exigem `owner/admin` **no backend**, usando `context.userId` do JWT verificado e uma leitura de `company_members` com o mesmo JWT.

## Endpoints com checagem de papel

- `fillMissingCompetencia`
- `reassignCategory`
- `deleteBulkTransactions`
- `purgeImportedTransactions`

A prévia de impacto e os relatórios permanecem somente leitura. O front-end oculta a possibilidade de aplicar alterações quando a permissão administrativa não foi confirmada.

## Risco residual — não considerar resolvido

Estas checagens restringem os **endpoints da Auditoria DRE**, não as permissões SQL de toda a aplicação. Um usuário com acesso às credenciais públicas do projeto e um JWT de membro ainda poderá chamar a Data API do Supabase conforme as políticas RLS atuais. Outros endpoints de alteração também precisam de inspeção.

**Não foi executada nenhuma migração ou atualização de políticas.**

## Próxima decisão de governança

Definir, com o proprietário e o responsável pela operação, se membros devem continuar podendo criar/editar transações comuns. Uma política que simplesmente remova UPDATE de todos os membros pode interromper funcionalidades existentes (lançamentos, conciliação e importação).

Após definir a matriz de autorização por ação, preparar migração revisada e testada em homologação que restrinja especificamente alterações sensíveis de classificação, competência, exclusão lógica e importações, inclusive via Data API. Não depender de controles visuais nem de cabeçalhos enviados pelo cliente.

## Plano mínimo de homologação

1. Conta `owner`: pode consultar e preparar prévia; testar atualização apenas em dados de teste.
2. Conta `admin`: mesmos direitos no fluxo da Auditoria DRE.
3. Conta `member`: pode visualizar e investigar, mas recebe negativa nos quatro endpoints de escrita.
4. Usuário de outra empresa: RLS impede ver ou alterar dados.
5. Tentativas sem JWT: bloqueadas pelo middleware de autenticação.
6. Uma prévia desatualizada deve ser rejeitada pelo servidor.
7. Testar cada módulo existente que grava em `transactions` antes de qualquer restrição RLS.

Evitar testes com alterações irreversíveis nos lançamentos reais.
