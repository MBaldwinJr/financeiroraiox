
# Finance Vision Pro — Plano MVP

Sistema SaaS de gestão financeira com tema escuro premium, multiempresa, DRE dinâmico e dashboard executivo. Esta entrega cobre a base sólida; módulos avançados (IA, Alertas, Dashboard Analítico Premium, Heatmap, PWA, Metas, Relatórios PDF) ficam para iterações seguintes.

## Escopo desta entrega (MVP)

1. **Autenticação + Multiempresa**
   - Login email/senha + Google (via Lovable Cloud)
   - Cada usuário pode criar/pertencer a múltiplas empresas (tenants)
   - Seletor de empresa no topo da sidebar; todos os dados filtrados por empresa ativa
   - Roles por empresa: `owner`, `admin`, `member` (RBAC via tabela `user_roles` + função `has_role`)

2. **Dashboard Executivo (Módulo 1)**
   - Cards KPI: Receita Bruta, CMV, Lucro Bruto, Total Recebimentos, Total Despesas, Resultado Operacional, Lucro Líquido, Margem %
   - Cada card: valor do mês, variação vs mês anterior (↑↓ + %), sparkline
   - Gráficos: Receita x Despesa (barras), Evolução do Lucro (linha), Composição de Despesas (donut), Recebimentos por Forma de Pagamento (pizza), Fluxo de Caixa Mensal (área), Comparativo Ano Atual x Anterior (barras agrupadas)

3. **DRE Dinâmico (Módulo 2)**
   - Tabela interativa por mês/ano com hierarquia: Receitas (Dinheiro, PIX, Boletos, Cheques, Cartões) → Despesas (Fornecedores, Fretes, Fixas [Aluguel, Energia, Água, Internet, Pró-labore], Variáveis [Combustível, Veículos, Comissões, Descontos, Empréstimos], Operacional, Outras)
   - Cálculos automáticos: Receita Líquida, CMV, Lucro Bruto, Totais, Resultado Operacional, Lucro Líquido, Margem %
   - Visualização mensal (12 colunas) + total anual

4. **Lançamentos (Módulo 7)**
   - Tabela ERP-like: data, descrição, categoria, subcategoria, conta, centro de custo, forma de pagamento, cliente/fornecedor, valor, tipo (receita/despesa), situação, observações
   - Ações: criar, editar, excluir, duplicar, dar baixa, busca instantânea, paginação
   - Form com React Hook Form + Zod

5. **Filtros Avançados (Módulo 3)**
   - Período (ano, mês, intervalo), categoria, centro de custo, forma de pagamento, conta, cliente, fornecedor
   - Estado global via Zustand; gráficos e DRE reagem instantaneamente
   - Botão "Limpar filtros"

6. **Cadastros básicos**
   - Categorias e subcategorias (com seed padrão na criação da empresa)
   - Centros de custo (Administrativo, Comercial, Oficina, Estoque, Logística, Marketing, Outros) — seed inicial
   - Contas bancárias (cadastro simples com saldo inicial; saldo atual = inicial + somatório de lançamentos baixados)
   - Clientes e fornecedores (cadastro simples)
   - Formas de pagamento (enum fixo: Dinheiro, PIX, Boleto, Cheque, Cartão)

7. **Importação CSV/Excel**
   - Upload de arquivo, mapeamento de colunas, preview, validação Zod, inserção em lote
   - Template de exemplo para download

8. **Design System Dark Premium**
   - Tokens em `src/styles.css`: bg `#111827`, cards `#1F2937`, accent verde/vermelho/azul/cinza (convertidos para oklch)
   - Sidebar estilo Power BI com itens: Dashboard, DRE, Lançamentos, Contas, Centros de Custos, Cadastros, Importar, Configurações
   - Glassmorphism sutil, cards arredondados, animações Framer Motion discretas, totalmente responsivo

## Arquitetura técnica

**Stack:** TanStack Start + React + TypeScript + Tailwind v4 + shadcn/ui + Recharts + Framer Motion + TanStack Query + Zustand + RHF + Zod + Lovable Cloud (Supabase).

**Camadas (Clean Architecture):**
```
src/
  features/
    dashboard/   (components, hooks, services)
    dre/
    transactions/
    accounts/
    cost-centers/
    parties/        (clients + suppliers)
    categories/
    import/
    companies/      (multi-tenant)
  components/ui/    (shadcn)
  components/layout/ (Sidebar, AppShell, CompanySwitcher)
  lib/              (formatters, date utils, calculations)
  services/         (server functions wrappers)
  stores/           (zustand: filters, active company)
  routes/
    _authenticated/
      dashboard.tsx
      dre.tsx
      transactions.tsx
      accounts.tsx
      cost-centers.tsx
      cadastros.{categories,parties}.tsx
      importar.tsx
      configuracoes.tsx
    auth.tsx
    index.tsx       (landing/redirect)
```

**Acesso a dados:** componentes → hooks (TanStack Query) → server functions (`createServerFn` com `requireSupabaseAuth`) → Supabase. Cálculos do DRE feitos no servidor para garantir consistência.

## Modelo de dados (Supabase, snake_case, UUIDs, RLS)

- `companies` (id, name, owner_id, created_at, updated_at)
- `user_roles` (user_id, company_id, role: owner|admin|member) — função `has_role(user_id, company_id, role)` security definer
- `bank_accounts` (id, company_id, name, type, initial_balance_cents, created_at)
- `cost_centers` (id, company_id, name, color)
- `categories` (id, company_id, name, parent_id nullable, kind: revenue|expense, dre_group)
- `parties` (id, company_id, name, kind: client|supplier|both, document)
- `transactions` (id, company_id, date, description, amount_cents, kind: revenue|expense, payment_method, category_id, cost_center_id, bank_account_id, party_id, status: pending|paid, paid_at, notes, created_by, created_at, updated_at, deleted_at)
- `attachments` (futuro)

Valores monetários em **inteiros (centavos)**. Soft delete via `deleted_at`. RLS: usuário só vê linhas onde `has_role(auth.uid(), company_id, any)`. Mutations escrevem `company_id` da empresa ativa. Índices em `(company_id, date)`, `(company_id, category_id)`.

## Fora de escopo (próximas iterações)

- Módulo 9 Metas, Módulo 10 Relatórios (PDF/Excel export), Módulo 11 IA Copiloto, Módulo 12 Dashboard Analítico Premium (heatmap, calendário, score), Módulo 13 Alertas, PWA instalável, conciliação bancária, anexos em lançamentos, Insights avançados (EBITDA, ponto de equilíbrio).

Após aprovar o MVP, te aviso para escolher qual módulo avançar primeiro.
