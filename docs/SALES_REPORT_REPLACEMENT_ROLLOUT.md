# Relatórios de vendas — substituição controlada (Fase 1: prévia e preservação)

## Escopo integrado nesta etapa

O módulo "Importar Vendas (PDF)" agora oferece a **comparação de versões de um mês** sem executar escrita no Supabase. Um usuário owner/admin autenticado pode visualizar:

- Custo total do PDF anterior e do novo, delta em centavos e quantidade de vendedores.
- Vendas líquidas após devoluções e variação de contribuição comercial, sem tratar isso automaticamente como CMV contábil.
- Diferenças por vendedor: adicionado, removido, alterado ou inalterado.
- Sinais de possível alteração de grafia.
- Um arquivo JSON local contendo os registros ativos originais do mês para conferência e recuperação supervisionada. O arquivo não é publicado no repositório nem armazenado na nuvem pelo fluxo.

**A importação normal passou a ser insert-only por competência**: quando já existe pelo menos um registro ativo, a UI bloqueia e o servidor também recusa a sobrescrita. Isso elimina o caminho antigo de sobrescrita silenciosa por `upsert` quando vendedores têm o mesmo nome.

Nenhuma alteração automática de dados, reclassificação contábil, exclusão, migração ou mudança RLS é realizada nesta fase.

## Status da substituição

**A substituição está DESATIVADA até validação de operação atômica do banco.**

O que falta para permitir "Confirmar substituição":

1. Preparar uma migração real usando o CLI do Supabase, a partir de `supabase migration new`, no ambiente de homologação conectado à instância correta.
2. Criar uma operação transacional única no Postgres (RPC ou equivalente), com bloqueio por **company_id + period_start**, comparação de versão anterior, validação de esquema e autorização explícita.
3. Salvar a revisão anterior em estrutura de auditoria com RLS própria, escopo por empresa, ator e horário, com histórico imutável acessível apenas a administradores autorizados.
4. Alterar as linhas existentes e inserir as novas em **uma única transação**; se qualquer validação ou gravação falhar, fazer rollback integral. Os registros removidos da nova versão não podem permanecer somados indevidamente.
5. Verificar o estado atualizado antes de confirmar sucesso e disponibilizar recuperação controlada a partir da revisão anterior, também em uma transação, impedindo troca entre empresas.
6. Testar concorrência real, execução duplicada (idempotência), múltiplos usuários, falha no meio da operação, empresas diferentes e reversão após erro. Simular dados sintéticos, nunca dados financeiros reais.
7. Definir e aplicar em homologação a matriz de permissões em RLS. No banco atual, `sales` contém políticas que permitem mutação direta por membros; checagens da aplicação não resolvem isso. A nova RPC precisa ser instalada apenas após o fechamento dessas lacunas, sem `service_role` no cliente.

Um token hash da prévia é calculado para identificar alterações no conjunto de dados. **É apenas consistência futura**, não autenticação nem autorização; a versão deve ser revalidada no banco na mesma transação.

## Problema do índice atual

A chave única existente é `(company_id, period_start, seller_name)`. Ela permite nomes com variações de grafia e contém registros desativados. Um `upsert` isolado não remove vendedores que saíram do relatório. Uma sequência separada de `UPDATE deleted_at` e `UPSERT` pode deixar o mês parcialmente alterado se a segunda operação falhar; não utilizar essa abordagem.

## Plano de testes e monitoramento

- Abrir a tela com um PDF válido, comparar o custo antigo/proposto e verificar se o delta iguala a soma das diferenças por vendedor.
- Baixar o backup local autenticado e verificar os valores do arquivo **sem compartilhar seu conteúdo** no GitHub público.
- Em mês sem relatório, importação normal continua disponível após validação de integridade. Em mês já cadastrado, a importação simples é sempre negada.
- Editar PDF/categoria/empresa antes da prévia deve cancelar a possibilidade de utilizar o plano anterior.
- Validar que o código não executa mutação a partir do painel de comparação.
- Testar apenas com contas owner/admin da empresa; perfis member não podem obter o backup completo pela prévia.
- Depois de implantada a migração em homologação, medir comportamento transacional e reversão antes da ativação de produção.

## Limitações

O arquivo JSON é um ponto de recuperação local e **não** é uma função automática de restauração. A recuperação automática só poderá existir quando a migração e os controles de autorização estiverem homologados. A soma dos custos de PDFs comerciais não equivale à validação do CMV da DRE.
