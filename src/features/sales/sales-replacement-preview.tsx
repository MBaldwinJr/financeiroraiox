import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft, Download, Search, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import type { ParsedSalesReport } from "./sales-pdf-parser";
import { previewSalesReplacement } from "./sales.functions";

interface Props {
  companyId: string;
  report: ParsedSalesReport;
  fileName: string | null;
}

const labels = {
  added: "Novo",
  removed: "Sai do novo arquivo",
  modified: "Alterado",
  unchanged: "Sem mudança",
} as const;

export function SalesReplacementPreview({ companyId, report, fileName }: Props) {
  const [open, setOpen] = useState(false);
  const fetcher = useServerFn(previewSalesReplacement);

  const query = useQuery({
    queryKey: ["sales-replacement-preview", companyId, report.periodStart, report.periodEnd, fileName, report.rows],
    enabled: open && Boolean(companyId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: () => fetcher({
      data: {
        companyId,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        sourceFile: fileName,
        rows: report.rows.map((row) => ({ ...row })),
      },
    }),
  });

  const result = query.data;
  function downloadBackup() {
    if (!result || !result.hasExistingPeriod) return;
    // Local file only: no upload, public URL or storage in the repository.
    const backup = {
      format: "financeiroraiox-sales-original-v1",
      exportedAt: new Date().toISOString(),
      companyId,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      originalRows: result.originalRows,
      snapshotToken: result.snapshotToken,
      note: "Cópia para conferência e recuperação supervisionada. Não é importada automaticamente.",
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup-vendas-${report.periodStart}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-sm">Comparar substituição de relatório</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Visualize alterações de custos, vendas e vendedores antes de decidir qualquer
            substituição. A consulta é somente leitura e exige perfil proprietário ou administrador.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
          <Search className="mr-2 h-4 w-4" aria-hidden="true" />
          {open ? "Ocultar comparação" : "Comparar versões"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {query.isPending && <p role="status" className="text-sm text-muted-foreground">Conferindo o mês registrado e a nova versão…</p>}
          {query.isError && (
            <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              Não foi possível comparar este período. {query.error.message}
            </p>
          )}
          {result && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">CMV do relatório — anterior</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatBRL(result.previous.costCents)}</p>
                  <p className="text-xs text-muted-foreground">{result.previous.sellers} vendedores</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">CMV do relatório — proposto</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatBRL(result.proposed.costCents)}</p>
                  <p className="text-xs text-muted-foreground">{result.proposed.sellers} vendedores</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Diferença de custo entre PDFs</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatBRL(result.difference.costCents)}</p>
                  <p className="text-xs text-muted-foreground">
                    Vendas líquidas após devoluções: {formatBRL(result.difference.netAfterReturnsCents)}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3 text-xs leading-5 text-muted-foreground">
                <p>
                  Variação da contribuição comercial (vendas menos devoluções e custo):
                  <strong className="ml-1 text-foreground">{formatBRL(result.difference.contributionCents)}</strong>.
                  Essa diferença não é um lançamento novo na DRE nem uma validação do CMV contábil.
                </p>
                {result.spellingChanges > 0 && (
                  <p className="mt-2 text-amber-700">
                    {result.spellingChanges} possível(is) alteração(ões) de grafia entre versões.
                    Compare as identidades antes de qualquer substituição.
                  </p>
                )}
                {result.warnings.map((warning) => (
                  <p className="mt-1 text-amber-700" key={warning}>{warning}</p>
                ))}
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[580px] text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Vendedor</th>
                      <th className="px-3 py-2 font-medium">Situação</th>
                      <th className="px-3 py-2 text-right font-medium">Custo anterior</th>
                      <th className="px-3 py-2 text-right font-medium">Custo proposto</th>
                      <th className="px-3 py-2 text-right font-medium">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.differences.map((row) => (
                      <tr className="border-t border-border" key={row.sellerName}>
                        <th scope="row" className="px-3 py-2 font-medium">{row.sellerName}</th>
                        <td className="px-3 py-2 text-muted-foreground">{labels[row.change]}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.previousCostCents === null ? "—" : formatBRL(row.previousCostCents)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.nextCostCents === null ? "—" : formatBRL(row.nextCostCents)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatBRL(row.costDeltaCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex max-w-[560px] items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  A substituição atômica ainda não está habilitada. É necessário implantar e validar
                  uma operação transacional com autorização, verificação de versão e recuperação.
                  Nenhum lançamento será alterado nesta tela.
                </p>
                {result.hasExistingPeriod && (
                  <Button type="button" size="sm" variant="outline" onClick={downloadBackup}>
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                    Exportar cópia original
                  </Button>
                )}
              </div>
              {query.isFetching && <p role="status" className="text-xs text-muted-foreground">Atualizando comparação…</p>}
              <Button type="button" size="sm" variant="ghost" disabled={query.isFetching} onClick={() => void query.refetch()}>
                <ArrowRightLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Recalcular comparação
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
