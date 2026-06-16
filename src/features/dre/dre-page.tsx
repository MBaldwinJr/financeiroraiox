import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { getFinancials } from "@/features/dashboard/dashboard.functions";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatPct, MONTH_LABELS } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DreGroupKey } from "@/features/dre/dre-group.functions";

export function DrePage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const basis = useFilterStore((s) => s.revenueBasis);
  const fetcher = useServerFn(getFinancials);
  const query = useQuery({
    queryKey: ["financials", companyId, range.year, range.month, basis],
    queryFn: () =>
      fetcher({ data: { companyId: companyId!, year: range.year, month: null, basis } }),
    enabled: !!companyId,
  });

  if (!companyId)
    return (
      <p className="text-sm text-muted-foreground">Selecione uma empresa para ver o DRE.</p>
    );
  if (!query.data) return <p className="text-sm text-muted-foreground">Carregando DRE…</p>;

  const { monthly } = query.data;
  const cols = 12;

  const sumRow = (key: keyof (typeof monthly)[number]) => monthly.map((m) => m[key]);
  const totalOf = (vals: number[]) => vals.reduce((a, b) => a + b, 0);

  const revenue = sumRow("revenue");
  const cmv = sumRow("cmv");
  const supplier = sumRow("supplier");
  const freight = sumRow("freight");
  const fixed = sumRow("fixed");
  const variable = sumRow("variable");
  const operational = sumRow("operational");
  const other = sumRow("other");

  const grossProfit = revenue.map((r, i) => r - cmv[i]);
  // Total Despesas exclui CMV — o CMV já foi deduzido no Lucro Bruto.
  const totalExpense = supplier.map(
    (_, i) => supplier[i] + freight[i] + fixed[i] + variable[i] + operational[i] + other[i],
  );
  const operatingResult = grossProfit.map(
    (gp, i) => gp - supplier[i] - freight[i] - fixed[i] - variable[i] - operational[i],
  );
  const netProfit = grossProfit.map((gp, i) => gp - totalExpense[i]);
  const margin = revenue.map((r, i) => (r > 0 ? netProfit[i] / r : 0));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">DRE Dinâmico — {range.year}</h1>
          <p className="text-sm text-muted-foreground">
            Demonstrativo do Resultado do Exercício mensal com totais anuais calculados automaticamente.
          </p>
        </div>
      </header>
      <FilterBar />

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Mês a mês</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs numeric">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="sticky left-0 z-10 w-56 bg-secondary/40 px-3 py-2 text-left font-medium">
                  Conta
                </th>
                {Array.from({ length: cols }).map((_, i) => (
                  <th key={i} className="px-2 py-2 text-right font-medium text-muted-foreground">
                    {MONTH_LABELS[i]}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              <DreSection
                title="(+) Receita Bruta"
                values={revenue}
                bold
                positive
              />
              <DreSection title="(-) CMV" values={cmv} negative />
              <DreSection title="(=) Lucro Bruto" values={grossProfit} bold highlight />
              <DreSection title="(-) Fornecedores" values={supplier} negative />
              <DreSection title="(-) Fretes" values={freight} negative />
              <DreSection title="(-) Despesas Fixas" values={fixed} negative />
              <DreSection title="(-) Despesas Variáveis" values={variable} negative />
              <DreSection title="(-) Operacional" values={operational} negative />
              <DreSection title="(=) Resultado Operacional" values={operatingResult} bold highlight />
              <DreSection title="(-) Outras Despesas" values={other} negative />
              <DreSection title="(=) Total Despesas" values={totalExpense} bold negative />
              <DreSection title="(=) Lucro Líquido" values={netProfit} bold highlight />
              <tr className="border-t border-border">
                <td className="sticky left-0 z-10 bg-card px-3 py-2 font-semibold">Margem %</td>
                {margin.map((m, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-2 py-2 text-right",
                      m >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {formatPct(m)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold">
                  {formatPct(
                    totalOf(revenue) > 0 ? totalOf(netProfit) / totalOf(revenue) : 0,
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function DreSection({
  title,
  values,
  bold,
  highlight,
  positive,
  negative,
}: {
  title: string;
  values: number[];
  bold?: boolean;
  highlight?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <tr
      className={cn(
        "border-b border-border/60",
        highlight && "bg-secondary/30",
        bold && "font-semibold",
      )}
    >
      <td className="sticky left-0 z-10 bg-card px-3 py-2 text-left">{title}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn(
            "px-2 py-2 text-right",
            v === 0 && "text-muted-foreground",
            v !== 0 && positive && "text-success",
            v !== 0 && negative && "text-destructive",
          )}
        >
          {v === 0 ? "—" : formatBRL(v)}
        </td>
      ))}
      <td
        className={cn(
          "px-3 py-2 text-right",
          total === 0 && "text-muted-foreground",
          total !== 0 && positive && "text-success",
          total !== 0 && negative && "text-destructive",
        )}
      >
        {total === 0 ? "—" : formatBRL(total)}
      </td>
    </tr>
  );
}
