import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft, Download, Search, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import type { ParsedSalesReport } from "./sales-pdf-parser";
import { previewSalesReplacement, commitSalesReplacement } from "./sales.functions";

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
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const qc = useQueryClient();
  const fetcher = useServerFn(previewSalesReplacement);
  const commit = useServerFn(commitSalesReplacement);

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
  const mutation = useMutation({
    mutationFn: async () => {
      if (!result?.replacementEnabled || !result.databaseVersion || query.isFetching) {
        throw new Error("A substituição não está disponível ou a prévia está desatualizada.");
      }
      if (result.hasExistingPeriod && !backupConfirmed) {
        throw new Error("Confirme o backup antes de substituir um mês já registrado.");
      }
      return commit({
        data: {
          companyId,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          sourceFile: fileName,
          rows: report.rows.map((row) => ({ ...row })),
          expectedDatabaseVersion: result.databaseVersion,
          previewToken: result.snapshotToken,
          requestId: crypto.randomUUID(),
        },
      });
    },
    onSuccess: ({ saved }) => {
      toast.success(`Substituição transacional concluída em homologação: ${saved} vendedores.`);
      setBackupConfirmed(false);
      void qc.invalidateQueries({ queryKey: ["sales"] });
      void qc.invalidateQueries({ queryKey: ["commercial"] });
      void qc.invalidateQueries({ queryKey: ["financials"] });
      void qc.invalidateQueries({ queryKey: ["cmv-reconciliation", companyId] });
      void qc.invalidateQueries({ queryKey: ["sales-import-preview", companyId] });
      void qc.invalidateQueries({ queryKey: ["sales-replacement-preview", companyId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha na operação transacional."),
  });

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
                  {result.replacementEnabled
                    ? "Homologação habilitada: uma substituição poderá ser executada somente após conferência e confirmação. O banco verificará a versão do mês dentro da transação."
                    : "Substituição desativada neste ambiente. A transação deve ser implantada e testada em homologação antes de qualquer ativação; esta tela só permite comparar."}
                </p>
                {result.hasExistingPeriod && (
                  <Button type="button" size="sm" variant="outline" onClick={downloadBackup}>
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                    Exportar cópia original
                  </Button>
                )}
              </div>
              {result.replacementEnabled && (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  {result.hasExistingPeriod && (
                    <label className="flex cursor-pointer items-start gap-2 text-xs leading-5">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={backupConfirmed}
                        onChange={(e) => setBackupConfirmed(e.target.checked)}
                      />
                      Confirmei a exportação e conferência da cópia original deste mês.
                    </label>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={mutation.isPending || query.isFetching || (result.hasExistingPeriod && !backupConfirmed)}
                    onClick={() => {
                      if (window.confirm(
                        "CONFIRMAR HOMOLOGAÇÃO: substituir TODOS os vendedores do período " +
                        report.periodStart + "?\n\nVariação no custo comercial: " +
                        formatBRL(result.difference.costCents) +
                        ".\nO banco exige autorização e rejeita versões desatualizadas."
                      )) mutation.mutate();
                    }}
                  >
                    {mutation.isPending ? "Substituindo em homologação…" : "Substituir relatório em homologação"}
                  </Button>
                </div>
              )}
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
