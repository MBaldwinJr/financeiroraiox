import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { financialFiltersKey, selectFinancialFilters } from "@/lib/financial-filters";
import { getCashMovements } from "@/features/cashflow/cashflow.functions";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { formatBRL, formatBRLCompact, fromCents, MONTH_LABELS } from "@/lib/money";

export function CashflowPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const filters = selectFinancialFilters(useFilterStore());
  const filterKey = financialFiltersKey(filters);
  const fetcher = useServerFn(getCashMovements);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["cash-movements", companyId, range.year, filterKey],
    queryFn: () =>
      fetcher({ data: { companyId: companyId!, year: range.year, ...filters } }),
    enabled: !!companyId,
    staleTime: 90_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa para começar.</p>;
  if (isError) return <p role="alert" className="text-sm text-destructive">Erro nos lançamentos de caixa: {error.message}</p>;
  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">Carregando fluxo de caixa…</p>;

  const { monthly } = data;
  const periodMonthly = range.month ? [monthly[range.month - 1]] : monthly;
  const sum = (key: keyof (typeof monthly)[number]) =>
    periodMonthly.reduce((total, item) => total + item[key], 0);
  const totalIn = sum("receiptsCents");
  const totalSuppliers = sum("supplierPaymentsCents");
  const totalOperating = sum("operatingPaymentsCents");
  const totalPatrimonial = sum("otherPatrimonialPaymentsCents");
  const totalCmvExcluded = sum("cmvExcludedCents");
  const countCmvExcluded = sum("cmvExcludedCount");
  const totalOut = sum("outflowsCents");
  const saldo = totalIn - totalOut;

  const series = monthly.reduce<
    { month: string; entradas: number; saidas: number; fornecedores: number; saldoMes: number; saldoAcum: number }[]
  >((acc, item, index) => {
    const prev = acc[index - 1]?.saldoAcum ?? 0;
    const saldoMes = fromCents(item.receiptsCents - item.outflowsCents);
    acc.push({
      month: MONTH_LABELS[index],
      entradas: fromCents(item.receiptsCents),
      saidas: fromCents(item.outflowsCents),
      fornecedores: fromCents(item.supplierPaymentsCents),
      saldoMes,
      saldoAcum: prev + saldoMes,
    });
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Fluxo de Caixa — {range.year}</h1>
        <p className="text-sm text-muted-foreground">
          Movimentações registradas como liquidadas, por data de pagamento. Pagamentos a fornecedores entram no caixa, mas não são somados ao CMV da DRE. Valores ainda não conciliados com extratos bancários.
        </p>
      </header>
      <FilterBar showRevenueBasis={false} />
      {data && isLoading === false && (
        <p className="text-xs text-muted-foreground" role="status">
          Fonte: lançamentos com status pago e data de liquidação. Não representa saldo bancário confirmado.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Entradas Registradas" value={totalIn} icon={TrendingUp} accent="success" />
        <KpiCard
          label="Saídas Registradas (sem CMV)"
          value={totalOut}
          icon={TrendingDown}
          accent="danger"
        />
        <KpiCard
          label="Movimento Líquido Estimado"
          value={saldo}
          icon={Wallet}
          accent={saldo >= 0 ? "success" : "danger"}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Composição das saídas registradas">
        <Card className="glass-card">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium">Pagamentos a fornecedores</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold tabular-nums">{formatBRL(totalSuppliers)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Saída financeira; não é outra despesa da DRE.</p></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium">Despesas operacionais pagas</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold tabular-nums">{formatBRL(totalOperating)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Lançamentos não patrimoniais, excluído CMV.</p></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium">Outras saídas patrimoniais</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold tabular-nums">{formatBRL(totalPatrimonial)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ex.: principal de empréstimos ou compra de ativos, a conferir.</p></CardContent>
        </Card>
      </section>

      {countCmvExcluded > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <strong>CMV não duplicado:</strong> {formatBRL(totalCmvExcluded)} em {countCmvExcluded} lançamento(s)
          classificados como CMV e marcados como pagos foram excluídos das saídas exibidas.
          O CMV continua no resultado por competência. Confirme com a contabilidade se esses registros
          representam apropriação de custo e não pagamentos bancários independentes.
        </p>
      )}

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Movimento Registrado Acumulado (sem saldo inicial ou conciliação)</CardTitle>
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
                name="Movimento Acumulado"
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
