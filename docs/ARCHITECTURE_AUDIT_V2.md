# Financeiro Raio-X 2.0 — Auditoria e arquitetura de integração
Data: 2026-11-10. Escopo: leitura estática do repositório; **não** constitui validação de dados reais, RLS, build ou testes end-to-end.

## Arquitetura existente (confirmada no código)
- React 19 + TypeScript + TanStack Router/Start + Query, Zustand, Supabase, Tailwind, Recharts.
- Organização funcional em `src/features/*`; funções de servidor com `requireSupabaseAuth`.
- Empresa ativa: `src/stores/company-store.ts` (id persistido no navegador).
- Filtros globais: `src/stores/filter-store.ts` (ano, mês, categorias, centros de custo, formas de pagamento, contas e partes).
- Lançamentos: `transactions.functions.ts` persiste `date`, `competencia`, `paid_at`, `status`, `amount_cents` e classificações.
- DRE: `dre-engine/*` agrupa por `competencia` e `category.dre_line`, exclui `is_balance_sheet`.
- Dashboard: `dashboard.functions.ts` agrupa por `date` e `category.dre_group`, com alternância de receitas `accrual`, `cash` e `erp_sales`.
- Fluxo de caixa: `cashflow-page.tsx` reutiliza `getFinancials` com `basis: cash` e exclui CMV de desembolso, mas não reconcilia saldos bancários.
- Análises e Raio-X: `analytics.functions.ts` computa agregações próprias; IA também monta contexto próprio em `ai-copilot.functions.ts`.
- Relatórios: usam `getFinancials` e `listAllTransactions`, com filtros/semântica próprios.
- Mutação de lançamentos aciona `invalidateQueries()` no cliente; aderência de outros fluxos ainda requer testes.

## Achados e prioridades
| Prioridade | Achado verificável | Impacto / decisão |
|---|---|---|
| P0 | Dashboard no modo `accrual` usa `date` + `dre_group`, enquanto DRE utiliza `competencia` + `dre_line`. | Podem divergir para mesma empresa/período; indicador de lucro gerencial não deve ser rotulado como lucro contábil sem reconciliação. |
| P0 | `getFinancials` ignora filtros de categoria/conta/centro de custo/pagamento presentes no Zustand. | A barra visual muda sem afetar KPIs; alinhar contrato/API + query keys. |
| P0 | `analytics.functions.ts` e `ai-copilot.functions.ts` repetem cálculo por `date` e não excluem `is_balance_sheet` na consulta identificada. | Insights e score podem divergir da DRE; compartilhar agregadores e excluir itens patrimoniais quando a métrica é de resultado. |
| P0 | `computePrevious` usa despesas totais, mas KPI de despesas atuais exclui CMV. | Comparação de despesa do mês contra mês anterior não é equivalente. |
| P1 | Dashboard chama o gráfico de saldo acumulado (sem CMV), mas não integra saldo inicial de contas/transferências bancárias. | Deve ser rotulado como **resultado gerencial acumulado** até existir razão de caixa e conciliação. |
| P1 | `erp_sales` substitui receita, mas mantém despesas da outra fonte/regime. | Comparações precisam informar a base mista; não tratar como DRE contábil. |
| P1 | `upsertTransaction` grava `competencia = date`; altera `paid_at` na edição conforme data informada. | Exigir edição independente da competência e da baixa; testar histórico e importações. |
| P1 | `upsertTransaction`, exclusão e mudança de status filtram por `id`, apoiando-se em RLS para isolamento. | Reforçar filtro por `company_id` e confirmar RLS em ambiente de homologação. |
| P2 | Painel atual tem alto volume de gráficos e tema escuro global; referência enviada tem interface clara e hierarquia mais objetiva. | Criar visão executiva premium, preservar análises profundas em seções secundárias. |

## Contrato-alvo (sem alterar o banco nesta etapa)
```text
Supabase: companies + company_members + categories + accounts + transactions + sales
                    | validação Auth/RLS + companyId
                    v
financialRepository: entradas canônicas e filtros auditáveis
                    |
                    v
financialDomain (puro, centavos inteiros):
  result/accrual -> dreEngine (competencia + dre_line)
  treasury/cash  -> cashflowEngine (paid_at + saldo inicial e conciliação)
  commercial/erp -> salesEngine (origem ERP sem dupla contagem)
                    |
                    v
financialSummaryService -> contract {period, basis, companyId, filters, source, timestamp,
                                  kpis, monthly, breakdown, comparisons, warnings}
                    |
          +---------+---------+-----------------+-----------+
          v         v         v                 v           v
       Dashboard   DRE     Relatórios         Metas      IA/Raio-X
```

### Política de consistência
1. Mesmo `companyId`, filtros, período, fonte e regime => os mesmos números, independentemente da tela.
2. **DRE/competência**: o cálculo contábil é o motor `dre-engine` e a classificação `dre_line`; CMV só reduz resultado uma vez.
3. **Fluxo de caixa**: entradas/saídas na data de liquidação; pagamentos de fornecedor e CMV não são sinônimos. Não somar dois fluxos pelo mesmo evento.
4. **Vendas ERP**: não duplicar receitas importadas como transações; manter chave de origem e reconciliação.
5. Valores monetários em **centavos inteiros**; arredondar apenas na apresentação; taxas exigem base explícita.
6. Filtro compartilhado único; `queryKey` deve conter todos os argumentos que influenciem resultado. Invalidar após toda mutação relevante.
7. Ser autorizado na empresa ativa é verificado no servidor/RLS, não apenas pelo Zustand.
8. IA consome resumo versionado e aponta fonte, período, regime e limitações; sem inventar números.
9. Diferenciar *lucro contábil*, *resultado gerencial*, *saldo de caixa* e *saldo bancário* nas interfaces.

## Plano de execução incremental
- **Fase A0 (presente):** mapa de dependências, auditoria de código e especificação da UI.
- **Fase A1:** extrair `finance/period.ts`, `finance/filter-contract.ts` e adaptadores entre fontes; preservar endpoints antigos como wrappers.
- **Fase A2:** normalizar KPIs e comparativos a partir do DRE para competência; caixa em serviço separado; testes unitários com datas diferentes.
- **Fase A3:** propagar filtros a Dashboard, Relatórios, Analíticas, Metas e IA; invalidar cache por mutação, empresa e período.
- **Fase A4:** auditar RLS, convites, importação, exclusão e editar/baixar; teste multiempresa em homologação, sem mexer na produção.
- **Fase B1:** criar layout do Dashboard Premium independente dos serviços financeiros e encaixar com prop-contract sem mudar cálculos.
- **Fase B2:** ligar cards, séries e tabela às fontes canônicas; estados de loading/erro/vazio.
- **Fase B3:** responsividade 360px–1440px, acessibilidade AA, visualização de tendências e QA visual no Lovable.

## Matriz mínima de testes
- Mesma venda com `date` no mês 1, `competencia` no mês 2 e `paid_at` no mês 3: cada regime contabiliza no mês correto.
- CMV 1 vez na DRE; boleto de fornecedor pago não duplica CMV e despesas no resultado.
- Contas patrimoniais, transferências e estornos não afetam lucro como receita/despesa operacional.
- Filtro de categoria, centro, conta e forma de pagamento: números, gráficos e tabelas permanecem sincronizados.
- Mesma empresa/ano em Dashboard/DRE/Relatórios/IA: conferir total/margem e metadados de regime.
- Troca de empresa: sem vazamento de cache ou dados; tentar UUID alheio para verificar RLS.
- Paginação acima de 1.000 lançamentos, exclusão lógica, reimportação, revisões de competência e lançamentos retroativos.
- Testes visuais e navegação em mobile, tablet e desktop.
- `npm run lint`, `npm run build`, testes unitários/end-to-end quando disponíveis. Nenhuma verificação de execução está implícita neste documento.

## Limites desta auditoria
A inspeção foi apenas estática no GitHub. Não houve inspeção do banco vivo, execução de migrations, testes funcionais, build ou validação visual renderizada. Os riscos descritos são hipóteses técnicas confirmadas em **fluxo de código**, não evidência de dados financeiros incorretos em produção.
