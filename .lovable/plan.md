# Finance Vision BI

Transformar o app atual em uma suíte de BI financeiro estilo Power BI, com tema dark premium, múltiplos dashboards interativos, DRE dinâmica, IA financeira e Raio-X com gauge de saúde.

Como o escopo é grande, proponho entregar em **5 fases**. Cada fase fica utilizável sozinha; você revisa antes de eu seguir para a próxima.

---

## Fase 1 — Fundação visual e navegação

- Aplicar tema **Dark Premium** nos design tokens (`src/styles.css`):
  - `--background #111827`, `--card #1F2937`, `--success #22C55E`, `--destructive #EF4444`, `--primary #3B82F6`, bordas sutis, sombras suaves.
  - Utilitários para glassmorphism leve (`backdrop-blur`, borda translúcida).
- Reformular a **Sidebar** (shadcn) com os 12 menus: Dashboard, DRE, Fluxo de Caixa, Receitas, Despesas, Centros de Custos, Contas Bancárias, Metas, Relatórios, Análises, IA Financeira, Configurações.
- Barra superior de **Filtros Globais** (Zustand store): ano, mês, período custom, categoria, conta, forma de pagamento, centro de custo, botão "Limpar".
- Instalar `framer-motion` para microanimações (fade/scale nos cards).

## Fase 2 — Dashboard Executivo

- **8 KPI cards** com sparkline (Recharts) e variação vs mês anterior: Receita Líquida, CMV, Lucro Bruto, Despesas Fixas, Despesas Variáveis, Resultado Operacional, Lucro Líquido, Margem %.
- **Linha 1**: Receita x Despesa (barras 12 meses) + Evolução do Lucro (linha receita/despesa/lucro).
- **Linha 2**: Donut Composição de Despesas (Fixas/Variáveis/CMV) + Treemap de Categorias.
- **Linha 3**: Top 10 Despesas + Top 10 Fornecedores + Heatmap Categorias × Meses (verde/amarelo/vermelho).
- **Waterfall** Receita → CMV → Lucro Bruto → Fixas → Variáveis → Operacional → Líquido.

## Fase 3 — DRE, Fluxo de Caixa, Centros de Custo, Indicadores

- **DRE interativa**: tabela pivot meses × linhas (Receitas, CMV, Lucro Bruto, Fixas, Variáveis, Operacional, Líquido) + Total anual, expandir/recolher categorias.
- **Fluxo de Caixa**: gráfico de área acumulada (entradas, saídas, saldo).
- **Centro de Custos**: pizza (Administrativo, Comercial, Estoque, Filial, Marketing, Logística, Outros).
- **Indicadores Financeiros**: cards automáticos (melhor mês, pior mês, maior despesa, maior fornecedor, média mensal, ticket médio, margem média, lucro acumulado, EBITDA, EBITDA %, ponto de equilíbrio).

## Fase 4 — Raio-X Financeiro

- Página dedicada com **score 0–100** (🟢/🟡/🔴) calculado a partir de: crescimento da receita, margem líquida, peso de despesas fixas, CMV, fluxo de caixa, lucro acumulado.
- **Gauge Chart** (Recharts RadialBar) estilo executivo + breakdown por critério com recomendações.

## Fase 5 — IA Financeira (Copiloto)

- Página de chat com Lovable AI Gateway (`google/gemini-3-flash-preview`).
- ServerFn que monta um contexto com agregados da DRE do ano corrente e envia junto ao prompt.
- Sugestões prontas: "Por que meu lucro caiu em março?", "Qual categoria mais cresceu?", "Quanto gastei com Marketing no trimestre?", "Qual foi meu melhor mês?", "Quais despesas posso reduzir?".
- Renderização markdown das respostas.

---

## Detalhes técnicos

- **Stack**: TanStack Start + React 19 + TS estrito + Tailwind v4 + shadcn + Recharts + Framer Motion + TanStack Query + Zustand + Supabase (já configurado).
- **Dados**: criar `src/features/analytics/analytics.functions.ts` com serverFns autenticadas (`requireSupabaseAuth`) que retornam agregados por mês/categoria/centro/fornecedor a partir de `transactions`, `categories`, `cost_centers`, `parties`. Mapeamento de `dre_group` já existente (`cmv`, `fixed`, `variable`, `operational`, `revenue`, `supplier`, `freight`, `other`).
- **Filtros globais**: Zustand store; cada chart faz `useSuspenseQuery` keyed pelos filtros.
- **Estrutura de pastas** (seguindo convenções do projeto):
  ```text
  src/features/
    dashboard/  dre/  cashflow/  cost-centers/  indicators/
    raio-x/     ai-copilot/      analytics/ (services compartilhados)
  src/components/charts/ (KPI, Sparkline, Waterfall, Heatmap, Treemap, Gauge)
  src/stores/filters-store.ts
  ```
- **Rotas** (`src/routes/_authenticated/...`): `dashboard.tsx`, `dre.tsx`, `fluxo-caixa.tsx`, `centros-custos.tsx`, `indicadores.tsx`, `raio-x.tsx`, `ia.tsx` etc.
- **Performance**: `React.memo` nos charts, agregações no servidor, queries paginadas onde aplicável.
- **Acessibilidade**: aria-labels nos charts, contraste WCAG AA garantido no tema dark.

---

## Confirmação

Posso começar pela **Fase 1 (fundação visual + sidebar + filtros globais)** já neste turno? Ou prefere ajustar a ordem / paleta / escopo de alguma fase antes?
