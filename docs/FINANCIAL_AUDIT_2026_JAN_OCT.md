# Financeiro Raio-X — Auditoria contábil e gerencial (procedimento técnico)

> **Privacidade:** este repositório é público. Não armazenar neste documento valores financeiros reais, nomes de clientes, fornecedores, extratos ou descrições de lançamentos. Dados reais devem ser consultados somente no aplicativo autenticado.

## Escopo

- DRE contábil: apuração por `competencia` e `categories.dre_line`.
- Dashboard gerencial: apuração por `competencia` e `categories.dre_group`.
- Diferenças entre os dois motores devem ser investigadas, nunca corrigidas automaticamente.
- Movimentações patrimoniais não devem ser tratadas como despesas de resultado.
- O saldo bancário não pode ser inferido do resultado gerencial acumulado.

## Diagnósticos possíveis

- Categorias não patrimoniais com `dre_line = nao_aplicavel` ficam fora da DRE, mas podem aparecer na visão gerencial.
- Lançamentos sem categoria precisam ser classificados após conferência da natureza econômica e dos documentos de origem.
- Deduções de receita podem ser mostradas como despesas em agrupamentos gerenciais distintos.
- Financiamentos/rotativos exigem separação entre principal, juros e tarifas; o texto de um lançamento por si só não determina seu tratamento.
- Reembolsos, devoluções e permutas também exigem revisão antes do enquadramento.

## Fluxo de investigação

1. Abrir a **Auditoria DRE** com a empresa e o ano corretos.
2. Conferir os agrupamentos de categoria sem linha contábil válida.
3. Usar **Investigar** para abrir o detalhe somente de leitura, pesquisar descrições e navegar por competência.
4. Verificar documentos de origem e conciliação com os registros contábeis.
5. Registrar decisões contábeis fora do repositório público, em ambiente protegido.
6. Somente após aprovação do responsável, aplicar mudanças explicitamente autorizadas e conferir a DRE e o Dashboard.

## Mudanças de engenharia já realizadas

- Resultado acumulado calcula `revenue - expense` sem adicionar CMV novamente.
- Auditoria e DRE compartilham validação das linhas efetivamente apuradas.
- Conciliação e análises avançadas são carregadas sob demanda.
- Gráficos financeiros identificam a origem e o período das medidas.
- IA Financeira usa os totais calculados por serviços do sistema e apresenta divergências entre DRE e gestão.

## Segurança

- A investigação deve ser somente leitura por padrão, com autenticação e RLS.
- Nenhuma alteração de registros, migração ou reclassificação é autorizada por este documento.
- Não registrar resultados do banco ou dados pessoais em repositórios públicos.
- Este texto substitui o conteúdo sensível **na versão atual**, mas não apaga commits anteriores do histórico público do Git. Para proteger os dados anteriormente publicados, alterar a visibilidade do repositório e avaliar a remoção segura do histórico com o administrador.
