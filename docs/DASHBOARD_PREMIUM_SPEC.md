# Financeiro Raio-X — Dashboard Premium (referência visual 2026-11-10)

## Direção de design
Referência fornecida pelo usuário: painel financeiro claro, modular, com cartões de KPI brancos, navegação compacta, linhas azuis e ciano, gráfico donut, insight em destaque e tabela curta de movimentos. **Não** reutilizar nome, logotipo, números de exemplo ou ativos da marca da referência.

## Tokens
| Token | Cor / valor | Uso |
|---|---|---|
| `--ui-surface` | `#F5F8FE` | Canvas claro |
| `--ui-card` | `#FFFFFF` | Cards e tabelas |
| `--ui-ink` | `#16243A` | Texto principal |
| `--ui-muted` | `#718096` | Descrições |
| `--ui-brand` | `#2563EB` | Seleção/navegação |
| `--ui-cyan` | `#06B6D4` | Segunda série |
| `--ui-positive` | `#16A34A` | Crescimento bom |
| `--ui-negative` | `#E5484D` | Queda/risco |
| `--ui-border` | `#E9EEF6` | Bordas |
| `--ui-radius` | 18px | Cards |
| `--ui-shadow` | `0 10px 28px rgba(39,61,110,.06)` | Elevacão sutil |

Usar ícones Lucide, tipografia Inter já existente, Recharts, Tailwind. Suportar tema escuro existente em outras páginas sem regressão (theme rollout em etapas).

## Hierarquia desktop
```text
Financeiro Raio-X    [Dashboard] [Lançamentos] [DRE] ...  [Busca] [Notificações] [Perfil]
Visão executiva             [empresa] [mês/ano] [regime] [mais filtros]
┌────────────┬────────────┬────────────┬────────────┐
│ Receita    │ CMV        │ Lucro Bruto│ Despesas   │
│ variação   │ variação   │ variação   │ variação   │
├────────────┼────────────┼────────────┼────────────┤
│Resultado   │Lucro Líquido│ Margem    │ Caixa*     │
└────────────┴─────────────┴───────────┴────────────┘
┌───────────────────────────┬──────────────┐
│ Evolução de resultado     │ Composição   │
│ (linhas: receita,         │ despesas     │
│ despesas, lucro)          │ (donut)      │
├───────────────────────────┼──────────────┤
│ Últimos lançamentos       │ Insight      │
│ 5–8 linhas, status, link  │ diagnóstico  │
└───────────────────────────┴──────────────┘
[Análise avançada: gráficos extras, heatmap, waterfall e alertas, opcional/aba]
```

* Caixa: mostrar apenas após existir saldo conciliado confiável. Até lá, usar **recebimentos realizados** ou outra métrica com regime explícito.

## Componentes e dados
1. `DashboardHeader`: título, subtítulo do período, empresa e seletor; mostra rótulo de regime.
2. `ExecutiveKpiGrid`: 8 cards responsivos, unidade BRL ou %, comparação apenas com período/regime equivalente, sparkline apenas com série válida.
3. `FinancialTrendChart`: linha azul = receitas, ciano = despesas, verde/roxo = resultado; tooltip BRL e legenda visível. Padrão 12 meses; realce do mês selecionado.
4. `ExpenseBreakdown`: donut por grupo; centro = valor, legenda textual com cores acessíveis; estados vazios reais.
5. `RecentTransactions`: últimas movimentações (com filtros), descrição, categoria, valor, data, situação e ligação para lançamentos.
6. `FinancialInsight`: diagnóstico determinístico com origem dos números, sem alegação de IA se for regra; no futuro resumo de IA fundamentado no mesmo contrato.
7. `AdvancedAnalytics`: painéis existentes preservados, acessíveis em seção colapsável ou rota Analíticas.
8. `DashboardSkeleton` e `DashboardError`: placeholders reais, retry, aviso de fonte/regime e sem dados.

## Responsividade e acessibilidade
- Desktop >=1280: 4 cards por linha, área principal 2:1; tablet >=768: 2 cards por linha; mobile <768: 1 ou 2 cards conforme largura e legibilidade.
- Gráficos sem overflow horizontal de tela; tabela pode rolar horizontalmente dentro do próprio card.
- Botões com área mínima de toque 44px, foco visível, contraste WCAG AA e não depender apenas de cor.
- Não usar números fictícios como se fossem dados reais; mostrar **sem dados** / **não disponível** quando contrato não fornecer.
- Preservar formato brasileiro (R$, separador milhar, vírgula decimal) e sinal das variações.

## Critérios de aceite da interface
- Estética semelhante à referência: canvas suave, cards brancos, azul/ciano, gradiente exclusivo de insight.
- 8 KPIs clicáveis/legíveis, com títulos financeiros sem ambiguidade.
- Filtros globais refletem cartões, linhas, donut e tabela ou ficam desabilitados com explicação clara até integração.
- Nenhum gráfico chama resultado gerencial de saldo bancário; caixa e lucro são distintos.
- DRE e Dashboard em competência apresentam mesmo lucro conforme o novo contrato após a Fase A2.
- Lovable acompanha o commit integrado em `main`; *preview* não é deploy de produção.
- Sem alteração no banco, RLS, permissões ou registros financeiros para mudança puramente visual.

## Ordem de entregas
1. Design tokens e wrappers scoped + hierarquia visual do Dashboard (sem mudar semântica).
2. Unificação de domínio/cálculo/filtros e validação com dados controlados.
3. Conexão definitiva de indicadores, últimos movimentos e insights.
4. Melhorias na navegação e transição gradual de outras telas ao mesmo design.
