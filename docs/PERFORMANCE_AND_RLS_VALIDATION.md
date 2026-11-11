# Financeiro Raio-X — desempenho e endurecimento de acesso (plano de homologação)

## Otimizações de aplicação implementadas

- As consultas anuais do Dashboard, DRE, Caixa e exportações paginam resultados em ordem estável (competência/data + ID).
- A primeira página usa `count: exact` e as seguintes são buscadas em lotes concorrentes limitados a três requisições; se o servidor não fornecer a contagem, a paginação volta ao modo sequencial. Resultados incompletos geram erro explícito, nunca uma soma parcial.
- As consultas de tela usam cache React Query de 90 s (ou 120 s para análises opcionais), sem recarga automática apenas por mudança de foco. **Mutações legítimas continuam invalidando o cache**; testar esse fluxo em homologação.
- Relatórios não trazem todos os lançamentos durante a navegação: leitura integral e bibliotecas de exportação são acionadas somente após o clique em Excel/PDF.
- O Dashboard mostra os filtros e placeholders desde o primeiro carregamento, em vez de deixar a tela vazia.

## Evidências técnicas do banco (metadados, sem valores comerciais)

- A tabela `transactions` já possui índices parciais para `(company_id, competencia)`, `(company_id, date)` e `(company_id, category_id)`, restringidos a linhas não excluídas.
- `sales` já possui índice composto por empresa e início do período.
- `company_members` possui índice único composto por empresa e usuário.
- As políticas RLS de `transactions` e `categories` ainda usam `is_company_member(company_id, auth.uid())` e permitem escrita para todo membro da empresa.
- As funções de verificação de membership têm `STABLE SECURITY DEFINER`; revisão de privilégio `EXECUTE`, `search_path` e escopo de uso deve acompanhar o projeto de RLS.

## Risco de autorização ainda pendente — sem mudança de banco

**A restrição owner/admin feita nos endpoints de Auditoria DRE não impede a escrita direta pela Data API por um membro comum.** As políticas atuais precisam de uma revisão coordenada com os fluxos de lançamento, importação, categorias e integrações.

Matriz proposta para homologação:

| Operação | Owner | Admin | Member |
|---|---|---|---|
| Consultar dados da empresa | Permitido | Permitido | Permitido |
| Criar lançamento ordinário | Permitido | Permitido | Conforme função operacional |
| Reclassificar categoria de lançamento | Permitido | Permitido | Negado |
| Modificar competência histórica | Permitido | Permitido | Negado |
| Exclusão lógica / limpeza de importações | Permitido | Permitido | Negado |
| Alterar catálogo de classificações DRE | Permitido | Permitido | Negado |

**Nota:** políticas RLS isoladas por linha não bastam para limitar **quais colunas** um membro pode atualizar. Avaliar permissões de coluna, operações controladas em esquema interno ou uma RPC revisada, sem conceder `service_role` ao cliente e sem usar uma função `SECURITY DEFINER` pública sem proteção explícita. A implementação final depende de uma matriz operacional aprovada e de testes com três papéis em ambiente de homologação.

## Testes de aceite: desempenho

1. Medir na aba Network do navegador o tempo total da primeira navegação (Dashboard/2026/competência) antes e depois, com cache limpo; repetir 5 vezes.
2. Medir a troca de mês, de empresa e a volta à aba após foco. Cache não pode misturar dados entre empresas ou filtros.
3. Verificar os totais: Dashboard, DRE e exportação antes/depois **devem ser idênticos** para o mesmo conjunto de dados, inclusive quando exceder mil linhas.
4. Exportar Excel com histórico maior que mil lançamentos; conferir contagem, dados e arquivos gerados. PDF deve funcionar sem download prévio de transações.
5. Alterar **um registro de teste em homologação**, confirmar invalidação do cache e atualização dos KPIs; nunca realizar esse teste sobre um lançamento real da empresa.
6. Conferir os limites de queries em caso de erro da primeira página, falha em página intermediária e alteração dos registros durante paginação.

## Testes de aceite: autorização

1. `owner` e `admin` acessam a prévia e ações permitidas com dados **de teste**.
2. `member` acessa somente relatórios e a investigação; chama o endpoint sensível e recebe recusa.
3. `member` tenta alterar `category_id`, `competencia`, `deleted_at` via Data API: deve receber recusa **após a futura migração RLS**.
4. Usuário fora da empresa não vê nem altera nenhum registro; sem JWT, API deve rejeitar a requisição.
5. Comparar fluxos de importação e lançamentos ordinários antes de autorizar a migração.

## Decisão de implantação

Esta etapa **não executa SQL/DDL, cria índices nem modifica RLS ou dados em produção**. A aprovação em testes de domínio, TypeScript e build comprova apenas a integridade técnica do código. O ganho de latência e a experiência com login precisam de medição no preview autenticado e, se disponível, homologação isolada.
