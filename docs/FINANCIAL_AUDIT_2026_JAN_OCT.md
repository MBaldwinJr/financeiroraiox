# Auditoria Financeiro Raio-X — Peixoto, janeiro a outubro de 2026

**Data da revisão:** 10/11/2026
**Origem:** leitura agregada, sem escrita, do banco do projeto Lovable Insight Navigator.
**Escopo:** `transactions` não excluídas, com `competencia` de 2026-01-01 (inclusive) a 2026-11-01 (exclusivo).
**Importante:** valores financeiros gerenciais e contábeis ainda não foram homologados; não são orientação para reclassificação automática.

## 1. Reconciliação agregada

| Indicador | Gerencial (R$) | DRE (R$) | Diferença gerencial menos DRE |
|---|---:|---:|---:|
| Receita Bruta | 17.000.123,08 | 16.996.123,08 | +4.000,00 |
| CMV | 11.242.619,79 | 11.242.619,79 | 0,00 |
| Lucro Bruto | 5.757.503,29 | 5.719.585,34 | +37.917,95 |
| Lucro Líquido | 257.232,79 | 882.360,05 | -625.127,26 |

**Explicação provável, conferida por agrupamentos SQL:**
- 758 lançamentos ativos de **Outras Despesas**, R$ 609.068,55: categoria não patrimonial, mas `dre_line = nao_aplicavel`. O gerencial inclui as despesas; a DRE não as agrega.
- 4 lançamentos sem categoria, sendo **3 despesas de R$ 20.058,71** e **1 receita de R$ 4.000,00**. O gerencial inclui todos, a DRE ignora os não classificados.
- 44 registros de **Descontos**, R$ 33.917,95: agrupados como despesa variável no gerencial e como dedução de receita na DRE. Isso explica parte da diferença no *lucro bruto*, não implica por si só diferença adicional no lucro líquido.
- **Outras Despesas + despesas sem categoria - receita sem categoria = R$ 625.127,26**, exatamente a diferença absoluta de lucro líquido verificada.

## 2. Problemas de código corrigidos neste ciclo

1. O gráfico de resultado acumulado somava o CMV de volta, embora ele já estivesse dentro de `expense`. Agora soma mensalmente `revenue - expense`, uma vez.
2. A Auditoria DRE reconhecia apenas `dre_line` vazia como inválida, mas `nao_aplicavel` é uma string preenchida que o motor contábil ignora. Agora ambos usam a mesma validação de linhas armazenadas.
3. O painel de conciliação ocupava o espaço inicial antes dos KPIs e disparava consultas anuais repetidas. Agora aparece após os KPIs, como painel compacto com consulta sob demanda.
4. As análises avançadas faziam consulta mesmo sem o usuário visualizar os gráficos. Passam a carregar sob demanda.
5. Sparkline do Lucro Bruto usava resultado líquido; agora a série representa `receita - CMV`.
6. A composição por forma de pagamento tinha desalinhamento potencial de cores quando categorias sem valores eram ocultadas; agora a série de células segue os mesmos itens do gráfico.

## 3. Alertas que NÃO foram resolvidos automaticamente

- **Classificação de Outras Despesas:** revisar a origem de cada movimento; determinar o tratamento correto antes de editar categorias.
- **Lançamentos sem categoria:** identificar a natureza e a competência; nenhuma reclassificação foi aplicada.
- **Deduções:** o gerencial ainda usa `dre_group`, enquanto a DRE usa `dre_line`. Até harmonizar o contrato de classificação, o KPI do Dashboard é explicitamente identificado como gerencial.
- **Caixa:** o painel de caixa é uma visão gerencial de liquidações, não conciliação completa de saldos bancários; contas patrimoniais (fornecedores, principal de empréstimo) precisam de trilha de pagamentos separada.
- **Novembro de 2026:** ausência confirmada de lançamentos cadastrados; não é inconsistência.
- **Auditoria DRE vs competência:** a consulta de auditoria usa `date` no filtro do ano, ao passo que a DRE usa `competencia`; revisão específica de registros retroativos é etapa separada.

## 4. Regras de segurança e aceite

- Todas as consultas de auditoria foram **SELECT**. Nenhuma alteração de banco/migration foi executada.
- A implementação deste ciclo modifica somente TypeScript/React e documentação; não modifica lançamentos.
- Recomendações de contabilidade devem ser confirmadas por responsável técnico.
- Rodar testes de domínio, TypeScript e build no PR; validar responsividade e disponibilidade no preview Lovable após merge.
