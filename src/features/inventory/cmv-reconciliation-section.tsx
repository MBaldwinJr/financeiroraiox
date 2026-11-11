import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatBRL, MONTH_LABELS } from "@/lib/money";
import { getCmvSourceReconciliation } from "./cmv-reconciliation.functions";
import type { CmvCheckStatus } from "./cmv-reconciliation.domain";

const STATUS_LABELS: Record<CmvCheckStatus, string> = {
  missing_pdf: "PDF não encontrado",
  missing_dre: "Sem CMV na DRE",
  partial_period: "Período do PDF incompleto",
  investigate: "Investigar diferença",
  cent_difference: "Diferença em centavos",
  totals_equal: "Totais iguais",
};

export function CmvReconciliationSection({ companyId, year }: { companyId: string; year: number }) {
  const [expanded, setExpanded] = useState(false);
  const fetcher = useServerFn(getCmvSourceReconciliation);
  const query = useQuery({
    queryKey: ["cmv-reconciliation", companyId, year],
    enabled: expanded && Boolean(companyId),
    queryFn: () => fetcher({ data: { companyId, year } }),
    staleTime: 90_000,
    refetchOnWindowFocus: false,
  });

  const result = query.data;
  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Conciliação CMV × custo das vendas importadas</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Compara a DRE por competência com o custo dos PDFs de vendas do ano {year} e indica
            se existe fechamento mensal de estoque. Consulta toda a empresa, independentemente
            dos filtros da DRE. Não altera lançamentos nem certifica o CMV.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
          <Search className="mr-2 h-4 w-4" aria-hidden="true" />
          {expanded ? "Ocultar análise" : "Conferir CMV"}
        </Button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {query.isLoading && (
            <p role="status" className="text-sm text-muted-foreground">
              Comparando os registros financeiros, relatórios comerciais e snapshots de estoque…
            </p>
          )}
          {query.isError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/20 p-3 text-sm text-destructive">
              <span>Não foi possível consultar a conciliação: {query.error.message}</span>
              <Button size="sm" variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>
            </div>
          )}
          {result && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Meses com duas fontes comparáveis</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{result.comparableMonths}/12</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Diferenças acima de R$ 0,02</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{result.flaggedMonths}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Meses sem snapshot de fechamento</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{result.missingInventoryClosings}/12</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">CMV na DRE</TableHead>
                      <TableHead className="text-right">Custo no PDF</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead>Estoque no fechamento</TableHead>
                      <TableHead>Verificação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.monthly.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{MONTH_LABELS[row.month - 1]}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {row.dreEntryCount > 0 ? formatBRL(row.dreCostCents) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {row.importedCostCents !== null ? formatBRL(row.importedCostCents) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {row.differenceCents !== null ? formatBRL(row.differenceCents) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.inventoryClosingSnapshotDate
                            ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {row.inventoryClosingSnapshotDate}</span>
                            : row.latestInventorySnapshotDate
                              ? `Sem fechamento; último registro ${row.latestInventorySnapshotDate}`
                              : "Sem snapshot no mês"}
                        </TableCell>
                        <TableCell className={row.status === "investigate" ? "font-medium text-amber-700" : "text-xs text-muted-foreground"}>
                          {STATUS_LABELS[row.status]}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Igualdade dos valores não valida a integridade dos PDFs, devoluções ou custos.
                O cálculo contábil completo exige compras líquidas, ajustes de estoque, documentos
                e saldo inicial/final na mesma competência. Pagamentos a fornecedores não são o custo
                das mercadorias vendidas.
              </p>
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" disabled={query.isFetching} onClick={() => void query.refetch()}>
                  {query.isFetching ? "Atualizando…" : "Atualizar conferência"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
