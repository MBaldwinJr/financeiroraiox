import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  ShoppingCart,
  PiggyBank,
  Banknote,
  Percent,
  CircleDollarSign,
  Info,
  ChevronDown,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { financialFiltersKey, selectFinancialFilters } from "@/lib/financial-filters";
import { getFinancials } from "@/features/dashboard/dashboard.functions";
import { accumulatedNetResult } from "@/features/dashboard/dashboard.domain";
import { getAnalytics } from "@/features/analytics/analytics.functions";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { DreReconciliationCard } from "@/features/dre/reconciliation-card";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TopList } from "@/components/charts/top-list";
import { TreemapChart } from "@/components/charts/treemap-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { Waterfall } from "@/components/charts/waterfall";
import { formatBRL, formatBRLCompact, fromCents, MONTH_LABELS } from "@/lib/money";


const EXPENSE_LABELS: Record<string, string> = {
  cmv: "CMV",
  supplier: "Fornecedores",
  freight: "Fretes",
  fixed: "Fixas",
  variable: "Variáveis",
  operational: "Operacional",
  other: "Outras",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  boleto: "Boleto",
  cheque: "Cheque",
  card: "Cartão",
};

const CHART_COLORS = [
  "#2563eb",
  "#06b6d4",
  "#4f46e5",
  "oklch(0.78 0.16 75)",
  "oklch(0.68 0.2 310)",
  "oklch(0.6 0.18 200)",
  "oklch(0.55 0.16 35)",
];

export function DashboardPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const basis = useFilterStore((s) => s.revenueBasis);
  const setRange = useFilterStore((s) => s.setRange);
  const filterState = useFilterStore();
  const filters = selectFinancialFilters(filterState);
  const filterKey = financialFiltersKey(filters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const fetcher = useServerFn(getFinancials);

  const query = useQuery({
    queryKey: ["financials", companyId, range.year, range.month, basis, filterKey],
    queryFn: () =>
      fetcher({ data: { companyId: companyId!, year: range.year, month: range.month, basis, ...filters } }),
    enabled: !!companyId,
    staleTime: 90_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const analyticsFetcher = useServerFn(getAnalytics);
  const analyticsQuery = useQuery({
    queryKey: ["analytics", companyId, range.year, range.month, filterKey],
    queryFn: () =>
      analyticsFetcher({ data: { companyId: companyId!, year: range.year, month: range.month, ...filters } }),
    enabled: !!companyId && advancedOpen && !!query.data?.periodActivity.hasSelectedPeriodData,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  if (!companyId) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Crie ou selecione uma empresa para começar.
      </div>
    );
  }


  if (query.isError) {
    return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Falha ao carregar indicadores: {query.error.message}</div>;
  }

  if (query.isLoading || !query.data) {
    return (
      <div className="dashboard-premium min-h-[calc(100vh-8rem)] space-y-6 rounded-[28px] bg-[#f5f8fe] p-4 text-[#16243a] sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold">Visão Financeira</h1>
        <FilterBar appearance="light" />
        <div role="status" aria-live="polite" className="space-y-3">
          <p className="text-sm text-slate-500">Carregando indicadores do período selecionado…</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} aria-hidden="true" className="h-28 animate-pulse rounded-2xl border border-slate-100 bg-white" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { kpis, monthly, prevMonthly, byPayment, expenseComposition } = query.data;
  const isMonth = range.month != null;
  const hasPeriodData = query.data.periodActivity.hasSelectedPeriodData;
  const hasExpenseBreakdown = Object.values(expenseComposition).some((value) => value > 0);
  const periodLabel = isMonth ? `${MONTH_LABELS[range.month! - 1]}/${range.year}` : `${range.year}`;

  const sparkRev = monthly.map((m) => fromCents(m.revenue));
  const sparkExp = monthly.map((m) => fromCents(m.expense - m.cmv));
  const sparkProfit = monthly.map((m) => fromCents(m.revenue - m.expense));
  const sparkGrossProfit = monthly.map((m) => fromCents(m.revenue - m.cmv));
  const accumulated = accumulatedNetResult(monthly);
  const paymentBreakdown = Object.entries(byPayment)
    .filter(([, amount]) => amount > 0)
    .map(([method, amount]) => ({ name: PAYMENT_LABELS[method] ?? method, value: fromCents(amount) }));
  const expenseBreakdown = Object.entries(expenseComposition)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ name: EXPENSE_LABELS[key] ?? key, value: fromCents(value) }));

  return (
    <div className="dashboard-premium min-h-[calc(100vh-8rem)] space-y-6 rounded-[28px] bg-[#f5f8fe] p-4 text-[#16243a] shadow-sm sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#16243a] sm:text-3xl">Visão Financeira</h1>
          <p className="mt-1 text-sm text-slate-500">Indicadores e tendências do negócio · {periodLabel}</p>
        </div>
      </header>

      <FilterBar appearance="light" />
      {query.isFetching && (
        <p role="status" className="text-xs text-slate-500">Atualizando os indicadores…</p>
      )}

      {!hasPeriodData && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white px-5 py-4 text-[#294568] shadow-sm">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Nenhuma movimentação encontrada em {periodLabel}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">Os indicadores mostram o período selecionado. Os gráficos de evolução continuam exibindo o ano inteiro; valores de outros meses não pertencem ao resultado deste período.</p>
            </div>
          </div>
          {isMonth && (
            <Button variant="outline" size="sm" onClick={() => setRange({ ...range, month: null })} className="border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 hover:text-blue-900">
              Ver ano inteiro
            </Button>
          )}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard noData={!hasPeriodData}
          label="Receita Bruta"
          value={kpis.grossRevenue}
          prev={hasPeriodData ? kpis.prev?.revenue : undefined}
          icon={TrendingUp}
          accent="success"
          sparkline={!isMonth && hasPeriodData ? sparkRev : undefined}
        />
        <KpiCard noData={!hasPeriodData} label="CMV" value={kpis.cmv} icon={ShoppingCart} accent="warning" />
        <KpiCard noData={!hasPeriodData}
          label="Lucro Bruto (gerencial)"
          value={kpis.grossProfit}
          icon={PiggyBank}
          accent="info"
          sparkline={!isMonth && hasPeriodData ? sparkGrossProfit : undefined}
        />
        <KpiCard noData={!hasPeriodData}
          label="Total Despesas"
          value={kpis.totalExpenses}
          prev={hasPeriodData ? kpis.prev?.expense : undefined}
          icon={TrendingDown}
          accent="danger"
          sparkline={!isMonth && hasPeriodData ? sparkExp : undefined}
        />
        <KpiCard noData={!hasPeriodData}
          label={basis === "cash" ? "Total Recebimentos" : basis === "erp_sales" ? "Vendas ERP" : "Receita no Período"}
          value={kpis.totalRevenue}
          icon={Banknote}
          accent="success"
        />
        <KpiCard noData={!hasPeriodData}
          label="Resultado Operacional"
          value={kpis.operatingResult}
          icon={CircleDollarSign}
          accent={kpis.operatingResult >= 0 ? "success" : "danger"}
        />
        <KpiCard noData={!hasPeriodData}
          label="Lucro Líquido (gerencial)"
          value={kpis.netProfit}
          prev={hasPeriodData ? kpis.prev?.netProfit : undefined}
          icon={Receipt}
          accent={kpis.netProfit >= 0 ? "success" : "danger"}
          sparkline={!isMonth && hasPeriodData ? sparkProfit : undefined}
        />
        <KpiCard noData={!hasPeriodData}
          label="Margem"
          value={kpis.margin}
          icon={Percent}
          format="percent"
          accent={kpis.margin >= 0.1 ? "success" : kpis.margin >= 0 ? "warning" : "danger"}
        />
      </section>

      {basis === "accrual" && hasPeriodData && <DreReconciliationCard />}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Receita x Despesas sem CMV — {range.year}</CardTitle>
            {isMonth && <p className="mt-1 text-xs text-slate-500">Visão de janeiro a dezembro · indicadores acima: {periodLabel}</p>}
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthly.map((m, i) => ({
                  month: MONTH_LABELS[i],
                  Receita: fromCents(m.revenue),
                  Despesa: fromCents(m.expense - m.cmv),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" />
                <XAxis dataKey="month" stroke="#718096" fontSize={11} />
                <YAxis
                  stroke="#718096"
                  fontSize={11}
                  tickFormatter={(v) => formatBRLCompact(v * 100)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => formatBRL(v * 100)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Receita" fill="#2563eb" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Despesa" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Composição de custos e despesas — {periodLabel}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {hasExpenseBreakdown ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseBreakdown}
                    dataKey="value"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {expenseBreakdown.map((entry, i) => (
                      <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => formatBRL(v * 100)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm font-medium text-slate-600">Sem despesas neste período</p>
                <p className="max-w-[240px] text-xs leading-5 text-slate-400">Selecione outro mês ou o ano inteiro para consultar a composição.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Evolução do resultado gerencial</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={monthly.map((m, i) => ({
                  month: MONTH_LABELS[i],
                  Lucro: fromCents(m.revenue - m.expense),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" />
                <XAxis dataKey="month" stroke="#718096" fontSize={11} />
                <YAxis
                  stroke="#718096"
                  fontSize={11}
                  tickFormatter={(v) => formatBRLCompact(v * 100)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => formatBRL(v * 100)}
                />
                <Line
                  type="monotone"
                  dataKey="Lucro"
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{basis === "cash" ? "Recebimentos por Forma" : basis === "erp_sales" ? "Forma de recebimento indisponível nas vendas ERP" : "Receita por Forma"}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {paymentBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentBreakdown}
                  dataKey="value"
                  outerRadius={90}
                >
                  {paymentBreakdown.map((entry, i) => (
                    <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => formatBRL(v * 100)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm font-medium text-slate-600">Sem pagamentos classificados</p>
                <p className="max-w-[250px] text-xs leading-5 text-slate-400">Não há distribuição de pagamentos nesta fonte ou período.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Resultado líquido gerencial acumulado (não é saldo bancário)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={accumulated.map((value, i) => ({
                  month: MONTH_LABELS[i],
                  saldo: fromCents(value),
                }))}
              >
                <defs>
                  <linearGradient id="flow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" />
                <XAxis dataKey="month" stroke="#718096" fontSize={11} />
                <YAxis
                  stroke="#718096"
                  fontSize={11}
                  tickFormatter={(v) => formatBRLCompact(v * 100)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => formatBRL(v * 100)}
                />
                <Area
                  type="monotone"
                  dataKey="saldo"
                  stroke="#2563eb"
                  fill="url(#flow)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Comparativo {range.year - 1} x {range.year}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthly.map((m, i) => ({
                  month: MONTH_LABELS[i],
                  [`Receita ${range.year - 1}`]: fromCents(prevMonthly[i].revenue),
                  [`Receita ${range.year}`]: fromCents(m.revenue),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" />
                <XAxis dataKey="month" stroke="#718096" fontSize={11} />
                <YAxis
                  stroke="#718096"
                  fontSize={11}
                  tickFormatter={(v) => formatBRLCompact(v * 100)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => formatBRL(v * 100)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey={`Receita ${range.year - 1}`}
                  fill="#cbd5e1"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey={`Receita ${range.year}`}
                  fill="#4f46e5"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e9eef6] bg-white px-4 py-3 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-[#16243a]">Análises avançadas</p>
          <p className="text-xs text-slate-500">Fornecedores, centros de custo, heatmap e detalhamento do resultado.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((v) => !v)}
          className="border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-800"
        >
          {advancedOpen ? "Recolher" : "Explorar"}
          <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
        </Button>
      </div>
      {advancedOpen && analyticsQuery.isLoading && (
        <p role="status" className="text-sm text-slate-500">Carregando análises avançadas…</p>
      )}
      {advancedOpen && analyticsQuery.isError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Não foi possível carregar as análises: {analyticsQuery.error.message}
        </p>
      )}
      {advancedOpen && analyticsQuery.data && (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Top 10 Despesas</CardTitle>
              </CardHeader>
              <CardContent>
                <TopList items={analyticsQuery.data.topExpenses} accent="danger" />
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Top 10 Fornecedores</CardTitle>
              </CardHeader>
              <CardContent>
                <TopList items={analyticsQuery.data.topSuppliers} accent="info" />
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Centros de Custos</CardTitle>
              </CardHeader>
              <CardContent>
                <TopList items={analyticsQuery.data.byCostCenter.slice(0, 10)} accent="success" />
              </CardContent>
            </Card>
          </section>

          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Participação das Categorias</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <TreemapChart data={analyticsQuery.data.categoryTreemap} />
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Heatmap Financeiro — Categorias × Meses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Heatmap rows={analyticsQuery.data.heatmap} />
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Waterfall do Resultado</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <Waterfall
                steps={[
                  { label: "Receita", value: query.data.kpis.grossRevenue },
                  { label: "(-) CMV", value: -query.data.kpis.cmv },
                  { label: "Lucro Bruto", value: query.data.kpis.grossProfit, total: true },
                  { label: "(-) Fornecedores", value: -query.data.expenseComposition.supplier },
                  { label: "(-) Fretes", value: -query.data.expenseComposition.freight },
                  { label: "(-) Fixas", value: -query.data.expenseComposition.fixed },
                  { label: "(-) Variáveis", value: -query.data.expenseComposition.variable },
                  { label: "(-) Operacionais", value: -query.data.expenseComposition.operational },
                  {
                    label: "Result. Operacional",
                    value: query.data.kpis.operatingResult,
                    total: true,
                  },
                  { label: "(-) Outras", value: -query.data.expenseComposition.other },
                  { label: "Lucro Líquido", value: query.data.kpis.netProfit, total: true },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}


const tooltipStyle = {
  background: "#ffffff",
  color: "#16243a",
  border: "1px solid #e9eef6",
  borderRadius: 12,
  boxShadow: "0 10px 28px rgba(39, 61, 110, 0.1)",
  fontSize: 12,
};
