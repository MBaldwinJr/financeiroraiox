# Financeiro Raio-X — substituição mensal atômica (preparação para homologação)

## Estado desta entrega

A implementação da **integração de código** e o rascunho de DDL foram preparados, mas a operação está **DESLIGADA**. O SQL de referência foi salvo exclusivamente em:

`docs/sql/SALES_MONTH_ATOMIC_REPLACE_HOMOLOGATION_DRAFT.sql`

Não está em `supabase/migrations`, não é importado pelo aplicativo e não foi aplicado em nenhum banco. O preview do Lovable é apenas a interface da aplicação, não um ambiente de testes de banco isolado.

### Para habilitar SOMENTE após aplicar/homologar o SQL

As duas variáveis do servidor devem ser configuradas na **instância de homologação**:

```text
SALES_ATOMIC_REPLACEMENT_ENABLED=true
SALES_REPLACEMENT_ENV=homologation
```

Ausência de qualquer uma mantém a alteração desligada. Não configurar essas variáveis em produção. A interface só oferece o botão de substituição após a RPC de versão retornar um fingerprint válido. O servidor reconsulta os registros da mesma empresa e compara a prévia; o Postgres revalida outra versão **dentro da transação**.

A chave `snapshotToken` da prévia e o `databaseVersion` (MD5 de todas as linhas do mês, inclusive excluídas logicamente) são controles distintos. Nenhum deles substitui a autorização.

## Contrato SQL proposto

- `public.sales_month_version(company_id, period_start)`: somente leitura; valida owner/admin; devolve fingerprint de todas as linhas do mês.
- `public.sales_month_commit(company_id, period_start, period_end, expected_version, request_id, rows, source_file)`: recebe o PDF já validado, confere papel do usuário, bloqueia mês com advisory transaction lock, confere versão, salva o conjunto anterior no histórico privado, substitui tudo em uma transação e registra a revisão. Repetir mesmo request_id e mesmo payload é idempotente.
- `public.sales_month_restore(company_id, period_start, revision_id, expected_version, request_id)`: restaura a cópia histórica anterior **somente se a revisão ainda for a versão mais recente**; gera novo registro de auditoria.
- Tabela `finance_internal.sales_month_revisions`: cópias anterior/posterior, ator, versão, momento e identificador idempotente. Não expor o schema `finance_internal` na Data API.
- RPCs públicas são `SECURITY INVOKER`; as rotinas internas usam `SECURITY DEFINER` com `search_path = ''`, verificação explícita da empresa e papel owner/admin, e grants de execução limitados a autenticados.

### Restrição de Data API

A política atual de `sales` ainda permite DML direto a membros da empresa. Por isso o script proposto revoga `INSERT/UPDATE/DELETE` diretos de `authenticated`, mantendo leitura conforme RLS. Após a migração, gravações devem passar pelas RPCs com autorização e auditoria.

**Impacto:** os fluxos de importação inicial e exclusão direta de mês não podem continuar gravando pela Data API. O código novo roteia a importação inicial pela RPC quando as flags de homologação estão ativas; a exclusão direta fica bloqueada nesse modo. Antes de qualquer implantação, validar todos os módulos e integrações que escrevem em `sales`.

O índice único existente `(company_id, period_start, seller_name)` impede inserir nova versão com nomes idênticos enquanto linhas antigas persistem. A proposta faz exclusão física e inserção dentro de uma única transação, preservando antes o conjunto **integral** no histórico privado. O banco retornará erro e fará rollback integral se um dos inserts não puder ser concluído.

## Procedimento de homologação (sem tocar na produção)

1. Identificar e isolar um projeto **separado**, contendo dados sintéticos. Não utilizar a mesma base do Lovable Cloud.
2. Checar a versão atual do Supabase CLI, usar `supabase migration new sales_month_atomic_replace` para gerar o nome e revisar o SQL proposto. A CLI v3 prioriza operação local e confirma alteração hospedada; executar somente no projeto de homologação desejado.
3. Revisar `finance_internal` nos schemas não expostos, grants, owners, RLS, triggers, índices, backups e SQL advisers. Ajustar eventuais objetos existentes.
4. Testar uma importação de mês vazio usando a RPC e uma substituição de mês já existente, com vendedores adicionados, modificados e removidos.
5. Forçar erro no meio da operação e conferir que o mês e a auditoria ficam idênticos ao estado anterior.
6. Executar duas substituições simultâneas com a mesma versão. Apenas uma deve avançar; a outra deve receber erro de versão e manter o banco íntegro.
7. Reenviar o mesmo `request_id`: deve retornar a mesma revisão sem gravar de novo. Reutilizá-lo com dados diferentes deve falhar.
8. Simular `member`, usuário externo à empresa, JWT ausente, owner e admin. Garantir que acesso direto a `sales` para INSERT/UPDATE/DELETE seja negado mesmo se o cliente ignorar a interface.
9. Recuperar uma revisão a partir de backup transacional; tentar restaurar uma versão ultrapassada e confirmar bloqueio.
10. Comparar custo dos PDFs, vendas ERP, Dashboard e conciliação CMV antes/depois. O CMV contábil não deve ser modificado automaticamente pelo novo relatório.
11. Executar o conjunto de testes com sessão autenticada no navegador e registrar resultados de homologação.
12. Somente depois de aprovação, planejar migração em produção com janela operacional, cópia de segurança independente e reversão documentada.

## Critérios impeditivos

Não ativar enquanto não houver: projeto de homologação isolado, testes transacionais reais, revisão de permissões, teste de restauração, compatibilidade com integrações existentes, confirmação explícita de ativação em produção.

**Importante:** o rascunho SQL é uma proposta de engenharia e exige revisão por responsável de banco antes de uso. A passagem em TypeScript, testes unitários e build **não prova** integridade transacional nem validade de RLS.
