import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, TrendingUp, Receipt, Users } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { listSales } from "./sales.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/layout/filter-bar";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { formatBRL, formatPct } from "@/lib/money";

export function SalesPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const fetcher = useServerFn(listSales);

  const query = useQuery({
    queryKey: ["sales", companyId, range.year, range.month],
    queryFn: () =>
      fetcher({ data: { companyId: companyId!, year: range.year, month: range.month } }),
    enabled: !!companyId,
  });

  const aggregated = useMemo(() => {
    const map = new Map<
      string,
      {
        sellerName: string;
        sellerCode: string | null;
        net: number;
        returns: number;
        cost: number;
        items: number;
        sales: number;
      }
    >();
    for (const r of query.data?.rows ?? []) {
      const key = r.seller_name;
      const cur = map.get(key) ?? {
        sellerName: r.seller_name,
        sellerCode: r.seller_code,
        net: 0,
        returns: 0,
        cost: 0,
        items: 0,
        sales: 0,
      };
      cur.net += r.net_amount_cents;
      cur.returns += r.returns_cents;
      cur.cost += r.cost_cents;
      cur.items += r.items_qty;
      cur.sales += r.sales_qty;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.net - a.net);
  }, [query.data]);

  const totals = useMemo(
    () =>
      aggregated.reduce(
        (acc, r) => ({
          net: acc.net + r.net,
          cost: acc.cost + r.cost,
          items: acc.items + r.items,
          sales: acc.sales + r.sales,
        }),
        { net: 0, cost: 0, items: 0, sales: 0 },
      ),
    [aggregated],
  );

  const margin = totals.net - totals.cost;
  const marginPct = totals.net > 0 ? margin / totals.net : 0;
  const avgTicket = totals.sales > 0 ? totals.net / totals.sales : 0;
  const top = aggregated[0];

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Vendas por Colaborador</h1>
        <p className="text-sm text-muted-foreground">
          Dados importados do PDF do ERP. Independente dos lançamentos financeiros.
        </p>
      </header>

      <FilterBar />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Vendido" value={totals.net} icon={TrendingUp} accent="success" />
        <KpiCard
          label="Margem Bruta"
          value={margin}
          icon={HandCoins}
          accent={margin >= 0 ? "success" : "danger"}
        />
        <KpiCard
          label="Ticket Médio"
          value={Math.round(avgTicket)}
          icon={Receipt}
          accent="info"
        />
        <KpiCard
          label="Top Vendedor"
          value={top?.net ?? 0}
          icon={Users}
          accent="info"
          subtitle={top?.sellerName ?? "—"}
        />
      </section>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Ranking — {aggregated.length} colaboradores · Margem {formatPct(marginPct)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!query.isLoading && aggregated.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nenhum dado de venda no período. Importe um PDF em "Importar Vendas".
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Colaborador</th>
                    <th className="px-3 py-2 text-right">Vendas</th>
                    <th className="px-3 py-2 text-right">Custo</th>
                    <th className="px-3 py-2 text-right">Margem</th>
                    <th className="px-3 py-2 text-right">Margem %</th>
                    <th className="px-3 py-2 text-right">Itens</th>
                    <th className="px-3 py-2 text-right">Nº Vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregated.map((r, i) => {
                    const m = r.net - r.cost;
                    const mp = r.net > 0 ? m / r.net : 0;
                    return (
                      <tr key={r.sellerName} className="border-t border-border/40">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">
                          {r.sellerName}
                          {r.sellerCode && (
                            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                              {r.sellerCode}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right numeric">{formatBRL(r.net)}</td>
                        <td className="px-3 py-2 text-right numeric text-muted-foreground">
                          {formatBRL(r.cost)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right numeric ${m >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {formatBRL(m)}
                        </td>
                        <td className="px-3 py-2 text-right numeric">{formatPct(mp)}</td>
                        <td className="px-3 py-2 text-right numeric">{r.items}</td>
                        <td className="px-3 py-2 text-right numeric">{r.sales}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/40 font-semibold">
                    <td className="px-3 py-2" colSpan={2}>
                      Totais
                    </td>
                    <td className="px-3 py-2 text-right numeric">{formatBRL(totals.net)}</td>
                    <td className="px-3 py-2 text-right numeric">{formatBRL(totals.cost)}</td>
                    <td
                      className={`px-3 py-2 text-right numeric ${margin >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {formatBRL(margin)}
                    </td>
                    <td className="px-3 py-2 text-right numeric">{formatPct(marginPct)}</td>
                    <td className="px-3 py-2 text-right numeric">{totals.items}</td>
                    <td className="px-3 py-2 text-right numeric">{totals.sales}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
