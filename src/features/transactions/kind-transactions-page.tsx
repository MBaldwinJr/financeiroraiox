import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, TrendingDown, TrendingUp } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatBRL, formatDate, MONTH_LABELS } from "@/lib/money";
import { listAllTransactions } from "@/features/transactions/transactions.functions";
import { cn } from "@/lib/utils";

interface Props {
  kind: "revenue" | "expense";
  title: string;
  description: string;
}

export function KindTransactionsPage({ kind, title, description }: Props) {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const filters = useFilterStore();
  const [search, setSearch] = useState("");

  const fetcher = useServerFn(listTransactions);
  const query = useQuery({
    queryKey: [
      "transactions-kind",
      kind,
      companyId,
      range.year,
      range.month,
      search,
      filters.categoryIds,
      filters.costCenterIds,
      filters.bankAccountIds,
      filters.paymentMethods,
    ],
    queryFn: () =>
      fetcher({
        data: {
          companyId: companyId!,
          year: range.year,
          month: range.month,
          kind,
          search: search || undefined,
          categoryIds: filters.categoryIds,
          costCenterIds: filters.costCenterIds,
          bankAccountIds: filters.bankAccountIds,
          paymentMethods: filters.paymentMethods as ("cash" | "pix" | "boleto" | "cheque" | "card")[],
          limit: 500,
          offset: 0,
        },
      }),
    enabled: !!companyId,
  });

  const rows = query.data?.rows ?? [];
  const total = useMemo(() => rows.reduce((s, r) => s + r.amount_cents, 0), [rows]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const name = r.categories?.name ?? "Sem categoria";
      m.set(name, (m.get(name) ?? 0) + r.amount_cents);
    });
    return Array.from(m.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [rows]);

  const colorClass = kind === "revenue" ? "text-success" : "text-destructive";
  const Icon = kind === "revenue" ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <FilterBar />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass-card">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total no período</p>
            <p className={cn("mt-2 text-2xl font-bold numeric", colorClass)}>
              <Icon className="mr-1 inline h-5 w-5" />
              {formatBRL(total)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {range.month ? MONTH_LABELS[range.month - 1] : "Ano"} {range.year}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card md:col-span-2">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Top categorias
            </p>
            <ul className="mt-3 space-y-2">
              {byCategory.length === 0 && (
                <li className="text-sm text-muted-foreground">Sem dados no período.</li>
              )}
              {byCategory.map((c) => {
                const pct = total > 0 ? (c.amount / total) * 100 : 0;
                return (
                  <li key={c.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{c.name}</span>
                      <span className={cn("numeric font-medium", colorClass)}>
                        {formatBRL(c.amount)} · {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          kind === "revenue" ? "bg-success" : "bg-destructive",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por descrição…"
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Badge variant="secondary" className="numeric">
              {rows.length} registros
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-left">Categoria</th>
                  <th className="px-3 py-2 text-left">Centro</th>
                  <th className="px-3 py-2 text-left">Conta</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-t border-border/60 hover:bg-secondary/30">
                    <td className="px-3 py-2 numeric text-muted-foreground">
                      {formatDate(t.date)}
                    </td>
                    <td className="px-3 py-2">{t.description}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t.categories?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t.cost_centers?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t.bank_accounts?.name ?? "—"}
                    </td>
                    <td className={cn("px-3 py-2 text-right numeric font-medium", colorClass)}>
                      {kind === "revenue" ? "+" : "-"}
                      {formatBRL(t.amount_cents)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !query.isLoading && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum registro no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
