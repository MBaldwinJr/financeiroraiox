import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Trophy, AlertTriangle, Wallet, Receipt, Percent, Target } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { getAnalytics } from "@/features/analytics/analytics.functions";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatPct, MONTH_LABELS } from "@/lib/money";

export function IndicatorsPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const fetcher = useServerFn(getAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", companyId, range.year, range.month],
    queryFn: () =>
      fetcher({ data: { companyId: companyId!, year: range.year, month: range.month } }),
    enabled: !!companyId,
  });

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa para começar.</p>;
  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">Calculando indicadores…</p>;

  const i = data.indicators;

  const cards = [
    {
      label: "Melhor mês",
      value: formatBRL(i.bestMonth.value),
      sub: MONTH_LABELS[i.bestMonth.month - 1],
      icon: Trophy,
      accent: "text-success",
    },
    {
      label: "Pior mês",
      value: formatBRL(i.worstMonth.value),
      sub: MONTH_LABELS[i.worstMonth.month - 1],
      icon: AlertTriangle,
      accent: "text-destructive",
    },
    {
      label: "Maior despesa",
      value: formatBRL(i.biggestExpenseCategory.amount),
      sub: i.biggestExpenseCategory.name,
      icon: TrendingDown,
      accent: "text-destructive",
    },
    {
      label: "Maior fornecedor",
      value: formatBRL(i.biggestSupplier.amount),
      sub: i.biggestSupplier.name,
      icon: TrendingDown,
      accent: "text-warning",
    },
    {
      label: "Média mensal de receita",
      value: formatBRL(i.monthlyAvgRevenue),
      sub: "Média dos meses ativos",
      icon: TrendingUp,
      accent: "text-success",
    },
    {
      label: "Ticket médio",
      value: formatBRL(i.avgTicket),
      sub: "Por lançamento de receita",
      icon: Receipt,
      accent: "text-info",
    },
    {
      label: "Margem média",
      value: formatPct(i.avgMargin),
      sub: "Média mensal",
      icon: Percent,
      accent: i.avgMargin >= 0.1 ? "text-success" : "text-warning",
    },
    {
      label: "Lucro acumulado",
      value: formatBRL(i.accumulatedProfit),
      sub: `Ano ${range.year}`,
      icon: Wallet,
      accent: i.accumulatedProfit >= 0 ? "text-success" : "text-destructive",
    },
    {
      label: "EBITDA",
      value: formatBRL(i.ebitda),
      sub: "Receita − CMV − Var − Fixas",
      icon: TrendingUp,
      accent: i.ebitda >= 0 ? "text-success" : "text-destructive",
    },
    {
      label: "EBITDA %",
      value: formatPct(i.ebitdaPct),
      sub: "Margem EBITDA",
      icon: Percent,
      accent: i.ebitdaPct >= 0.15 ? "text-success" : "text-warning",
    },
    {
      label: "Ponto de equilíbrio",
      value: formatBRL(i.breakEven),
      sub: "Receita necessária / ano",
      icon: Target,
      accent: "text-info",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Análises e Indicadores</h1>
        <p className="text-sm text-muted-foreground">
          Indicadores estratégicos calculados automaticamente sobre {range.year}.
        </p>
      </header>
      <FilterBar />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-4 w-4 ${c.accent}`} />
            </CardHeader>
            <CardContent>
              <p className={`numeric text-xl font-bold ${c.accent}`}>{c.value}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
