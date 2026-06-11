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
import { getFinancials } from "@/features/dashboard/dashboard.functions";
import { getAnalytics } from "@/features/analytics/analytics.functions";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  "oklch(0.72 0.17 156)",
  "oklch(0.65 0.23 22)",
  "oklch(0.65 0.18 256)",
  "oklch(0.78 0.16 75)",
  "oklch(0.68 0.2 310)",
  "oklch(0.6 0.18 200)",
  "oklch(0.55 0.16 35)",
];

export function DashboardPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const fetcher = useServerFn(getFinancials);

  const query = useQuery({
    queryKey: ["financials", companyId, range.year, range.month],
    queryFn: () =>
      fetcher({ data: { companyId: companyId!, year: range.year, month: range.month } }),
    enabled: !!companyId,
  });

  if (!companyId) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Crie ou selecione uma empresa para começar.
      </div>
    );
  }

  if (query.isLoading || !query.data) {
    return <div className="text-sm text-muted-foreground">Carregando dados financeiros…</div>;
  }

  const { kpis, monthly, prevMonthly, byPayment, expenseComposition } = query.data;
  const isMonth = range.month != null;
  const periodLabel = isMonth ? `${MONTH_LABELS[range.month! - 1]}/${range.year}` : `${range.year}`;

  const sparkRev = monthly.map((m) => fromCents(m.revenue));
  const sparkExp = monthly.map((m) => fromCents(m.expense));
  const sparkProfit = monthly.map((m) => fromCents(m.revenue - m.expense));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Executivo</h1>
          <p className="text-sm text-muted-foreground">Resumo financeiro — {periodLabel}</p>
        </div>
      </header>

      <FilterBar />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Receita Bruta"
          value={kpis.grossRevenue}
          prev={kpis.prev?.revenue}
          icon={TrendingUp}
          accent="success"
          sparkline={sparkRev}
        />
        <KpiCard label="CMV" value={kpis.cmv} icon={ShoppingCart} accent="warning" />
        <KpiCard
          label="Lucro Bruto"
          value={kpis.grossProfit}
          icon={PiggyBank}
          accent="info"
          sparkline={sparkProfit}
        />
        <KpiCard
          label="Total Despesas"
          value={kpis.totalExpenses}
          prev={kpis.prev?.expense}
          icon={TrendingDown}
          accent="danger"
          sparkline={sparkExp}
        />
        <KpiCard
          label="Total Recebimentos"
          value={kpis.totalRevenue}
          icon={Banknote}
          accent="success"
        />
        <KpiCard
          label="Resultado Operacional"
          value={kpis.operatingResult}
          icon={CircleDollarSign}
          accent={kpis.operatingResult >= 0 ? "success" : "danger"}
        />
        <KpiCard
          label="Lucro Líquido"
          value={kpis.netProfit}
          prev={kpis.prev?.netProfit}
          icon={Receipt}
          accent={kpis.netProfit >= 0 ? "success" : "danger"}
          sparkline={sparkProfit}
        />
        <KpiCard
          label="Margem"
          value={kpis.margin}
          icon={Percent}
          format="percent"
          accent={kpis.margin >= 0.1 ? "success" : kpis.margin >= 0 ? "warning" : "danger"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Receita x Despesa — {range.year}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthly.map((m, i) => ({
                  month: MONTH_LABELS[i],
                  Receita: fromCents(m.revenue),
                  Despesa: fromCents(m.expense),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.02 260 / 0.4)" />
                <XAxis dataKey="month" stroke="oklch(0.7 0.02 255)" fontSize={11} />
                <YAxis
                  stroke="oklch(0.7 0.02 255)"
                  fontSize={11}
                  tickFormatter={(v) => formatBRLCompact(v * 100)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => formatBRL(v * 100)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Receita" fill="oklch(0.72 0.17 156)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Despesa" fill="oklch(0.65 0.23 22)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Composição de Despesas</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={Object.entries(expenseComposition)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => ({ name: EXPENSE_LABELS[k] ?? k, value: fromCents(v) }))}
                  dataKey="value"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {Object.keys(expenseComposition).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => formatBRL(v * 100)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Evolução do Lucro</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={monthly.map((m, i) => ({
                  month: MONTH_LABELS[i],
                  Lucro: fromCents(m.revenue - m.expense),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.02 260 / 0.4)" />
                <XAxis dataKey="month" stroke="oklch(0.7 0.02 255)" fontSize={11} />
                <YAxis
                  stroke="oklch(0.7 0.02 255)"
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
                  stroke="oklch(0.65 0.18 256)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recebimentos por Forma</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={Object.entries(byPayment)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => ({ name: PAYMENT_LABELS[k], value: fromCents(v) }))}
                  dataKey="value"
                  outerRadius={90}
                >
                  {Object.keys(byPayment).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => formatBRL(v * 100)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Fluxo de Caixa Mensal</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={monthly.reduce<{ month: string; saldo: number }[]>((acc, m, i) => {
                  const prev = acc[i - 1]?.saldo ?? 0;
                  acc.push({
                    month: MONTH_LABELS[i],
                    saldo: prev + fromCents(m.revenue - m.expense),
                  });
                  return acc;
                }, [])}
              >
                <defs>
                  <linearGradient id="flow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.17 156)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="oklch(0.72 0.17 156)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.02 260 / 0.4)" />
                <XAxis dataKey="month" stroke="oklch(0.7 0.02 255)" fontSize={11} />
                <YAxis
                  stroke="oklch(0.7 0.02 255)"
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
                  stroke="oklch(0.72 0.17 156)"
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
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.02 260 / 0.4)" />
                <XAxis dataKey="month" stroke="oklch(0.7 0.02 255)" fontSize={11} />
                <YAxis
                  stroke="oklch(0.7 0.02 255)"
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
                  fill="oklch(0.45 0.05 260)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey={`Receita ${range.year}`}
                  fill="oklch(0.65 0.18 256)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

const tooltipStyle = {
  background: "oklch(0.18 0.02 260)",
  border: "1px solid oklch(0.32 0.02 260 / 0.6)",
  borderRadius: 8,
  fontSize: 12,
};
