import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import {
  DRE_GROUP_LABELS,
  type DreGroupKey,
  getDreGroupBreakdown,
} from "@/features/dre/dre-group.functions";

interface Props {
  group: DreGroupKey;
}

export function DreGroupDetailPage({ group }: Props) {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const year = useFilterStore((s) => s.range.year);

  const fetcher = useServerFn(getDreGroupBreakdown);
  const query = useQuery({
    queryKey: ["dre-group-breakdown", companyId, group, year],
    queryFn: () => fetcher({ data: { companyId: companyId!, group, year } }),
    enabled: !!companyId,
  });

  const grouped = useMemo(() => {
    const cats = query.data?.categories ?? [];
    const mappings = query.data?.mappings ?? [];
    const totals = new Map(
      (query.data?.totals ?? []).map((t) => [t.categoryId, t]),
    );
    return cats.map((c) => ({
      ...c,
      total: totals.get(c.id)?.total ?? 0,
      count: totals.get(c.id)?.count ?? 0,
      mappings: mappings.filter((m) => m.category_id === c.id),
    }));
  }, [query.data]);

  const totalGroup = grouped.reduce((s, c) => s + c.total, 0);

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dre">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar ao DRE
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {DRE_GROUP_LABELS[group]} — {year}
            </h1>
            <p className="text-sm text-muted-foreground">
              Categorias e contas do ERP que compõem esta linha do DRE.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Total no ano
            </p>
            <p className="text-2xl font-bold numeric">{formatBRL(totalGroup)}</p>
          </div>
        </div>
      </header>

      {query.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      )}

      {!query.isLoading && grouped.length === 0 && (
        <Card className="glass-card">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhuma categoria cadastrada neste grupo.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {grouped.map((cat) => (
          <Card key={cat.id} className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle className="text-base">{cat.name}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {cat.count} lançamento(s) · {cat.mappings.length} conta(s) ERP mapeada(s)
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold numeric">{formatBRL(cat.total)}</p>
                <p className="text-xs text-muted-foreground">
                  {totalGroup > 0
                    ? `${((cat.total / totalGroup) * 100).toFixed(1)}%`
                    : "0%"}{" "}
                  do grupo
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {cat.mappings.length === 0 ? (
                <div className="flex items-center gap-2 border-t border-border/40 px-4 py-3 text-xs text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Nenhuma conta ERP mapeada para esta categoria.{" "}
                  <Link
                    to="/mapeamentos-erp"
                    className="ml-1 text-primary hover:underline"
                  >
                    Mapear agora →
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Código ERP</th>
                        <th className="px-3 py-2 text-left">Conta ERP</th>
                        <th className="px-3 py-2 text-left">Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.mappings.map((m) => (
                        <tr
                          key={m.erp_code}
                          className="border-t border-border/40"
                        >
                          <td className="px-3 py-2">
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px]">
                            {m.erp_code}
                          </td>
                          <td className="px-3 py-2">{m.erp_name ?? "—"}</td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {m.default_kind === "revenue"
                                ? "Receita"
                                : "Despesa"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link to="/mapeamentos-erp">Gerenciar mapeamentos ERP</Link>
        </Button>
      </div>
    </div>
  );
}
