import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronDown, GitCompareArrows, Info } from "lucide-react";
import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { financialFiltersKey, selectFinancialFilters } from "@/lib/financial-filters";
import { getDreReconciliation } from "./reconciliation.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, MONTH_LABELS } from "@/lib/money";

/** Leitura sob demanda: evita duplicar consultas anuais ao abrir a Dashboard. */
export function DreReconciliationCard() {
  const [expanded, setExpanded] = useState(false);
  const companyId = useCompanyStore((state) => state.activeCompanyId);
  const range = useFilterStore((state) => state.range);
  const filters = selectFinancialFilters(useFilterStore());
  const filterKey = financialFiltersKey(filters);
  const fetcher = useServerFn(getDreReconciliation);
  const query = useQuery({
    queryKey: ["dre-reconciliation", companyId, range.year, range.month, filterKey],
    queryFn: () =>
      fetcher({
        data: { companyId: companyId!, year: range.year, month: range.month, ...filters },
      }),
    enabled: !!companyId && expanded,
    staleTime: 90_000,
    refetchOnWindowFocus: false,
  });
  const period = range.month ? `${MONTH_LABELS[range.month - 1]}/${range.year}` : String(range.year);
  const snapshot = query.data;
  const hasWarnings = !!snapshot && (!snapshot.totalsMatch || snapshot.hasUnclassified);
  const noData = snapshot?.periodTransactionCount === 0;

  return (
    <Card className="glass-card overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
              <GitCompareArrows className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#16243a]">Conciliação contábil e gerencial</p>
              <p className="max-w-[640px] text-xs leading-5 text-slate-500">
                Compare Receita, CMV e Lucro em {period}; revise classificações sem alterar dados.
              </p>
              {snapshot && (
                <span className={hasWarnings
                  ? "inline-flex items-center gap-1.5 text-xs font-medium text-amber-700"
                  : noData
                    ? "inline-flex items-center gap-1.5 text-xs font-medium text-slate-600"
                    : "inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"}
                >
                  {hasWarnings
                    ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    : noData
                      ? <Info className="h-3.5 w-3.5" aria-hidden="true" />
                      : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  {hasWarnings ? "Diferenças para revisar" : noData ? "Sem registros no período" : "Quatro totais coincidentes"}
                </span>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-800"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Ocultar detalhes" : "Ver conciliação"}
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </Button>
        </div>

        {expanded && (
          <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
            {query.isLoading && <p role="status" className="text-sm text-slate-500">Comparando períodos e classificações…</p>}
            {query.isError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                <p>Falha ao consultar a DRE: {query.error.message}</p>
                <Button size="sm" variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>
              </div>
            )}
            {snapshot && (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full min-w-[540px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th scope="col" className="px-3 py-3 font-medium">Indicador</th>
                        <th scope="col" className="px-3 py-3 text-right font-medium">DRE</th>
                        <th scope="col" className="px-3 py-3 text-right font-medium">Gerencial</th>
                        <th scope="col" className="px-3 py-3 text-right font-medium">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.comparisons.map((entry) => (
                        <tr key={entry.label} className="border-t border-slate-100">
                          <th scope="row" className="px-3 py-3 font-medium text-slate-700">{entry.label}</th>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatBRL(entry.dreCents)}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatBRL(entry.managerialCents)}</td>
                          <td className={entry.matches
                            ? "px-3 py-3 text-right tabular-nums text-emerald-700"
                            : "px-3 py-3 text-right tabular-nums font-semibold text-amber-700"}
                          >
                            {formatBRL(entry.deltaCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {snapshot.hasUnclassified && (
                  <div role="status" className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="mb-2 flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      {snapshot.unclassifiedCount} lançamento(s) sem linha contábil válida
                    </div>
                    <p className="text-xs leading-5">
                      Despesas: {formatBRL(snapshot.unclassifiedExpenseCents)} · Receitas: {formatBRL(snapshot.unclassifiedRevenueCents)}.
                      {" "}{snapshot.unmappedDreLineCount} em categorias sem mapeamento válido e {snapshot.missingCategoryCount} sem categoria.
                    </p>
                    <p className="mt-2 text-xs leading-5">
                      Categorias marcadas “não aplicável” mas não patrimoniais também entram nesta análise.
                      Não reclassifique automaticamente: valide a natureza de cada movimento.
                    </p>
                  </div>
                )}
                {!snapshot.totalsMatch && !snapshot.hasUnclassified && (
                  <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    Os números diferem mesmo sem linhas não mapeadas; verifique deduções, regras contábeis e classificação gerencial.
                  </p>
                )}
                {snapshot.totalsMatch && !snapshot.hasUnclassified && (
                  <p className="rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
                    Os quatro totais coincidem, mas isto não substitui auditoria contábil ou conciliação bancária.
                  </p>
                )}
                <Link to="/dre-auditoria" className="inline-flex text-sm font-semibold text-blue-700 underline-offset-4 hover:underline">
                  Abrir Auditoria DRE
                </Link>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
