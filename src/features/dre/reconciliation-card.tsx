import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, GitCompareArrows } from "lucide-react";
import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { financialFiltersKey, selectFinancialFilters } from "@/lib/financial-filters";
import { getDreReconciliation } from "./reconciliation.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, MONTH_LABELS } from "@/lib/money";

/** Conciliação independente dos KPIs gerenciais; não altera valores da tela. */
export function DreReconciliationCard() {
  const companyId = useCompanyStore((state) => state.activeCompanyId);
  const range = useFilterStore((state) => state.range);
  const filters = selectFinancialFilters(useFilterStore());
  const filterKey = financialFiltersKey(filters);
  const fetcher = useServerFn(getDreReconciliation);
  const query = useQuery({
    queryKey: ["dre-reconciliation", companyId, range.year, range.month, filterKey],
    queryFn: () =>
      fetcher({
        data: {
          companyId: companyId!,
          year: range.year,
          month: range.month,
          ...filters,
        },
      }),
    enabled: !!companyId,
  });
  const period = range.month ? `${MONTH_LABELS[range.month - 1]}/${range.year}` : String(range.year);
  const snapshot = query.data;
  const hasWarnings = snapshot ? !snapshot.totalsMatch || snapshot.hasUnclassified : false;
  return (
    <Card className="glass-card">
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#16243a]">
            <GitCompareArrows className="h-4 w-4 text-blue-600" aria-hidden="true" />
            Conciliação DRE × Gestão
          </CardTitle>
          {snapshot && (
            <span className={hasWarnings
              ? "rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
              : "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"}
            >
              {hasWarnings ? "Revisão necessária" : "Totais coincidentes"}
            </span>
          )}
        </div>
        <p className="text-xs leading-5 text-slate-500">
          {period} · competência · mesmos filtros. Compara o motor contábil (dre_line) com os
          indicadores gerenciais (dre_group), sem modificar lançamentos.
        </p>
      </CardHeader>
      <CardContent>
        {query.isLoading && <p role="status" className="text-sm text-slate-500">Comparando dados financeiros…</p>}
        {query.isError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            Não foi possível comparar os valores: {query.error.message}
          </p>
        )}
        {snapshot && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th scope="col" className="py-2 font-medium">Indicador</th>
                    <th scope="col" className="py-2 text-right font-medium">DRE contábil</th>
                    <th scope="col" className="py-2 text-right font-medium">Gerencial</th>
                    <th scope="col" className="py-2 text-right font-medium">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.comparisons.map((entry) => (
                    <tr key={entry.label} className="border-b border-slate-100 last:border-0">
                      <th scope="row" className="py-3 font-medium text-slate-700">{entry.label}</th>
                      <td className="py-3 text-right tabular-nums text-slate-700">{formatBRL(entry.dreCents)}</td>
                      <td className="py-3 text-right tabular-nums text-slate-700">{formatBRL(entry.managerialCents)}</td>
                      <td className={entry.matches
                        ? "py-3 text-right tabular-nums font-medium text-emerald-700"
                        : "py-3 text-right tabular-nums font-medium text-amber-800"}
                      >
                        {entry.matches ? "R$ 0,00" : formatBRL(entry.deltaCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={hasWarnings
              ? "flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
              : "flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"}
            >
              {hasWarnings
                ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <div>
                {snapshot.hasUnclassified && (
                  <p>{snapshot.unclassifiedCount} lançamento(s) sem linha DRE, total de {formatBRL(snapshot.unclassifiedCents)}. Podem afetar a comparação.</p>
                )}
                {!snapshot.totalsMatch && <p>Há diferenças entre a classificação gerencial e a contábil. Verifique as categorias antes de considerar os resultados reconciliados.</p>}
                {!hasWarnings && <p>Os quatro totais comparados coincidem. Isso não substitui conciliação bancária ou auditoria contábil integral.</p>}
              </div>
            </div>
            <Link to="/dre-auditoria" className="inline-flex text-sm font-medium text-blue-700 underline-offset-4 hover:underline">
              Abrir auditoria das classificações
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
