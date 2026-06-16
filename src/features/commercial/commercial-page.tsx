import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  Banknote,
  AlertTriangle,
  Percent,
  Clock,
  Receipt,
  Users,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { getCommercialPerformance } from "./commercial.functions";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Gauge } from "@/components/charts/gauge";
import { Heatmap } from "@/components/charts/heatmap";
import { formatBRL, formatBRLCompact, formatPct, MONTH_LABELS } from "@/lib/money";
import { cn } from "@/lib/utils";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  boleto: "Boleto",
  cheque: "Cheque",
  card: "Cartão",
  "—": "Sem método",
};

function semaphore(days: number): string {
  if (days <= 30) return "bg-success/15 text-success";
  if (days <= 90) return "bg-warning/15 text-warning";
  return "bg-destructive/15 text-destructive";
}

export function CommercialPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const basis = useFilterStore((s) => s.revenueBasis);
  const fetcher = useServerFn(getCommercialPerformance);

  const query = useQuery({
    queryKey: ["commercial", companyId, range.year, range.month, basis],
    queryFn: () =>
      fetcher({
        data: { companyId: companyId!, year: range.year, month: range.month, basis },
      }),
    enabled: !!companyId,
  });

  const d = query.data;
  const k = d?.kpis;

  const series = d
    ? MONTH_LABELS.map((m, i) => ({
        m,
        vendas: d.sales[i] / 100,
        recebimentos: d.receipts[i] / 100,
        gap: d.monthlyGap[i] / 100,
        overdue: d.overdueByMonth[i] / 100,
      }))
    : [];

  const agingData = d
    ? [
        { faixa: "Até 30 dias", valor: d.aging.d30 },
        { faixa: "31 a 60 dias", valor: d.aging.d60 },
        { faixa: "61 a 90 dias", valor: d.aging.d90 },
        { faixa: "91 a 180 dias", valor: d.aging.d180 },
        { faixa: "180+ dias", valor: d.aging.d180p },
      ]
    : [];

  const healthScore = k ? Math.max(0, Math.min(100, k.conversion * 100)) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            Central de Performance Comercial
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vendas, recebimentos e inadimplência em tempo real.
          </p>
        </div>
      </header>

      <FilterBar />

      <InventorySection />

      {query.isLoading && (
        <p className="py-12 text-center text-sm text-muted-foreground">Carregando…</p>
      )}

      {k && d && (
        <>
          {/* KPI grid */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Vendas do Mês"
              value={k.curSales}
              prev={k.prevSales}
              icon={ShoppingCart}
              accent="info"
              sparkline={d.sales}
            />
            <KpiCard
              label="Recebimentos do Mês"
              value={k.curReceipts}
              prev={k.prevReceipts}
              icon={Banknote}
              accent="success"
              sparkline={d.receipts}
            />
            <KpiCard
              label="Gap Vendas × Recebimentos"
              value={k.curGap}
              prev={k.prevGap}
              icon={TrendingUp}
              accent={k.curGap > k.prevGap ? "danger" : "warning"}
              sparkline={d.monthlyGap}
            />
            <KpiCard
              label="Inadimplência Atual"
              value={k.totalOverdue}
              icon={AlertTriangle}
              accent="danger"
            />
            <KpiCard
              label="Taxa de Inadimplência"
              value={k.delinquencyRate}
              icon={Percent}
              accent={k.delinquencyRate > 0.1 ? "danger" : "warning"}
              format="percent"
            />
            <KpiCard
              label="Prazo Médio Recebimento"
              value={Math.round(k.avgDaysToReceive)}
              icon={Clock}
              accent="info"
              format="percent"
            />
            <KpiCard
              label="Ticket Médio"
              value={k.avgTicket}
              icon={Receipt}
              accent="muted"
            />
            <KpiCard
              label="Clientes em Atraso"
              value={k.overdueClients}
              icon={Users}
              accent="warning"
              format="percent"
            />
          </section>

          {/* Sales vs Receipts */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Vendas × Recebimentos</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="m" />
                  <YAxis tickFormatter={(v) => formatBRLCompact(v * 100)} />
                  <Tooltip
                    formatter={(v: number) => formatBRL(v * 100)}
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="vendas"
                    name="Vendas"
                    stroke="oklch(0.65 0.18 256)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="recebimentos"
                    name="Recebimentos"
                    stroke="oklch(0.72 0.17 156)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Gap chart */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Gap mensal (Vendas − Recebimentos)</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="m" />
                    <YAxis tickFormatter={(v) => formatBRLCompact(v * 100)} />
                    <Tooltip
                      formatter={(v: number) => formatBRL(v * 100)}
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Bar dataKey="gap" name="Gap" radius={[6, 6, 0, 0]}>
                      {series.map((s, i) => (
                        <Cell
                          key={i}
                          fill={
                            s.gap > 0 ? "oklch(0.65 0.23 22)" : "oklch(0.72 0.17 156)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Evolução inadimplência */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Evolução da Inadimplência</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="m" />
                    <YAxis tickFormatter={(v) => formatBRLCompact(v * 100)} />
                    <Tooltip
                      formatter={(v: number) => formatBRL(v * 100)}
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Bar
                      dataKey="overdue"
                      name="Em atraso"
                      fill="oklch(0.65 0.23 22)"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Aging + Health Gauge */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="glass-card lg:col-span-2">
              <CardHeader>
                <CardTitle>Aging — envelhecimento dos recebíveis</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => formatBRLCompact(v)}
                    />
                    <YAxis dataKey="faixa" type="category" width={110} />
                    <Tooltip
                      formatter={(v: number) => formatBRL(v)}
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                      {agingData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={
                            [
                              "oklch(0.72 0.17 156)",
                              "oklch(0.78 0.16 75)",
                              "oklch(0.7 0.2 50)",
                              "oklch(0.65 0.23 22)",
                              "oklch(0.55 0.25 22)",
                            ][i]
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Saúde — Conversão em Caixa</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <Gauge value={healthScore} label="% Recebido" />
              </CardContent>
            </Card>
          </div>

          {/* Top delinquents */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Top 20 Inadimplentes</CardTitle>
            </CardHeader>
            <CardContent>
              {d.topDelinquents.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum cliente em atraso 🎉
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Em aberto</TableHead>
                      <TableHead className="text-right">Dias em atraso</TableHead>
                      <TableHead className="text-right">Último pagto</TableHead>
                      <TableHead className="text-right">Recebido</TableHead>
                      <TableHead className="text-right">Vendido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.topDelinquents.map((p) => (
                      <TableRow key={p.partyId}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right numeric font-semibold">
                          {formatBRL(p.open)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium numeric",
                              semaphore(p.daysLate),
                            )}
                          >
                            {p.daysLate}d
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground numeric">
                          {p.lastPaid
                            ? new Date(p.lastPaid).toLocaleDateString("pt-BR")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right numeric">
                          {formatBRL(p.received)}
                        </TableCell>
                        <TableCell className="text-right numeric">
                          {formatBRL(p.sales)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Heatmap */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Mapa de Calor — Inadimplência por Cliente × Mês</CardTitle>
            </CardHeader>
            <CardContent>
              <Heatmap rows={d.heatmap} />
            </CardContent>
          </Card>

          {/* Payment methods */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Ranking por Forma de Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead className="text-right">Em atraso</TableHead>
                    <TableHead className="text-right">% Inadimplência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.paymentMethods
                    .slice()
                    .sort((a, b) => b.sales - a.sales)
                    .map((p) => (
                      <TableRow key={p.method}>
                        <TableCell className="font-medium">
                          {PAYMENT_LABELS[p.method] ?? p.method}
                        </TableCell>
                        <TableCell className="text-right numeric">
                          {formatBRL(p.sales)}
                        </TableCell>
                        <TableCell className="text-right numeric text-success">
                          {formatBRL(p.received)}
                        </TableCell>
                        <TableCell className="text-right numeric text-destructive">
                          {formatBRL(p.overdue)}
                        </TableCell>
                        <TableCell className="text-right numeric">
                          {formatPct(p.delinquencyRate)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
