import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { getFinancials } from "@/features/dashboard/dashboard.functions";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { formatBRL, formatBRLCompact, fromCents, MONTH_LABELS } from "@/lib/money";

export function CashflowPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const fetcher = useServerFn(getFinancials);
  const { data, isLoading } = useQuery({
    queryKey: ["financials", companyId, range.year, range.month],
    queryFn: () => fetcher({ data: { companyId: companyId!, year: range.year, month: null } }),
    enabled: !!companyId,
  });

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa para começar.</p>;
  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">Carregando fluxo de caixa…</p>;

  const { monthly } = data;
  const series = monthly.reduce<
    { month: string; entradas: number; saidas: number; saldoMes: number; saldoAcum: number }[]
  >((acc, m, i) => {
    const prev = acc[i - 1]?.saldoAcum ?? 0;
    const saldoMes = fromCents(m.revenue - m.expense);
    acc.push({
      month: MONTH_LABELS[i],
      entradas: fromCents(m.revenue),
      saidas: fromCents(m.expense),
      saldoMes,
      saldoAcum: prev + saldoMes,
    });
    return acc;
  }, []);

  const totalIn = monthly.reduce((a, m) => a + m.revenue, 0);
  const totalOut = monthly.reduce((a, m) => a + m.expense, 0);
  const saldo = totalIn - totalOut;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Fluxo de Caixa — {range.year}</h1>
        <p className="text-sm text-muted-foreground">
          Entradas, saídas e saldo acumulado ao longo do ano.
        </p>
      </header>
      <FilterBar />

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Total Entradas" value={totalIn} icon={TrendingUp} accent="success" />
        <KpiCard label="Total Saídas" value={totalOut} icon={TrendingDown} accent="danger" />
        <KpiCard
          label="Saldo do Período"
          value={saldo}
          icon={Wallet}
          accent={saldo >= 0 ? "success" : "danger"}
        />
      </section>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Saldo Acumulado</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="acumGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.72 0.17 156)" stopOpacity={0.55} />
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
                dataKey="saldoAcum"
                stroke="oklch(0.72 0.17 156)"
                fill="url(#acumGreen)"
                strokeWidth={2}
                name="Saldo Acumulado"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Entradas x Saídas mensais</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
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
              <Bar dataKey="entradas" name="Entradas" fill="oklch(0.72 0.17 156)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill="oklch(0.65 0.23 22)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

const tooltipStyle = {
  background: "oklch(0.18 0.02 260)",
  border: "1px solid oklch(0.32 0.02 260 / 0.6)",
  borderRadius: 8,
  fontSize: 12,
};
