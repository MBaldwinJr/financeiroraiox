import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/money";
import {
  DRE_LINE_LABELS,
  getDreLineBreakdown,
  type StoredDreLine,
} from "./dre-line.functions";

interface Props {
  line: StoredDreLine;
}

export function DreLineDetailPage({ line }: Props) {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const year = useFilterStore((s) => s.range.year);
  const fetcher = useServerFn(getDreLineBreakdown);
  const query = useQuery({
    queryKey: ["dre-line-breakdown", companyId, line, year],
    queryFn: () => fetcher({ data: { companyId: companyId!, line, year } }),
    enabled: !!companyId,
  });

  const [search, setSearch] = useState("");

  const filteredTx = useMemo(() => {
    const list = query.data?.transactions ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (t) =>
        t.description?.toLowerCase().includes(q) ||
        t.party_name?.toLowerCase().includes(q) ||
        t.category_name?.toLowerCase().includes(q),
    );
  }, [query.data, search]);

  if (!companyId) return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;

  const totals = query.data?.totals ?? [];
  const grandTotal = query.data?.grandTotal ?? 0;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dre"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar ao DRE</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{DRE_LINE_LABELS[line]} — {year}</h1>
          <p className="text-sm text-muted-foreground">
            Total da linha: <span className="font-semibold text-foreground">{formatBRL(grandTotal)}</span>
            {" · "}{query.data?.transactions.length ?? 0} lançamentos
          </p>
        </div>
      </header>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Categorias que compõem esta linha</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {totals.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Categoria</th>
                  <th className="px-4 py-2 text-right font-medium">Lançamentos</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.categoryId} className="border-b border-border/60">
                    <td className="px-4 py-2">{t.categoryName}</td>
                    <td className="px-4 py-2 text-right numeric">{t.count}</td>
                    <td className="px-4 py-2 text-right numeric font-medium">{formatBRL(t.total)}</td>
                    <td className="px-4 py-2 text-right numeric text-muted-foreground">
                      {grandTotal > 0 ? ((t.total / grandTotal) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
          <CardTitle className="text-sm font-medium">Lançamentos</CardTitle>
          <Input
            placeholder="Buscar descrição, fornecedor ou categoria…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="p-0">
          {filteredTx.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento encontrado.</p>
          ) : (
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 border-b border-border bg-secondary/60 uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Competência</th>
                    <th className="px-3 py-2 text-left font-medium">Categoria</th>
                    <th className="px-3 py-2 text-left font-medium">Descrição</th>
                    <th className="px-3 py-2 text-left font-medium">Fornecedor/Cliente</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.slice(0, 1000).map((t) => (
                    <tr key={t.id} className="border-b border-border/60">
                      <td className="px-3 py-2 numeric">{t.competencia}</td>
                      <td className="px-3 py-2">{t.category_name ?? "—"}</td>
                      <td className="px-3 py-2">{t.description ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.party_name ?? "—"}</td>
                      <td className="px-3 py-2 text-right numeric font-medium">{formatBRL(t.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTx.length > 1000 && (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  Exibindo 1000 de {filteredTx.length} lançamentos. Refine a busca para ver mais.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
