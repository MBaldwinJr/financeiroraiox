import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload, Loader2 } from "lucide-react";

import { useCompanyStore } from "@/stores/company-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { parseSalesPdf, type ParsedSalesReport } from "./sales-pdf-parser";
import { importSales } from "./sales.functions";
import { formatBRL } from "@/lib/money";

export function SalesImportPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const qc = useQueryClient();
  const [parsing, setParsing] = useState(false);
  const [report, setReport] = useState<ParsedSalesReport | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const importFn = useServerFn(importSales);
  const importMut = useMutation({
    mutationFn: () => {
      if (!report || !companyId) throw new Error("Sem dados para importar.");
      return importFn({
        data: {
          companyId,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          sourceFile: fileName,
          rows: report.rows.map((r) => ({ ...r })),
        },
      });
    },
    onSuccess: ({ saved }) => {
      toast.success(`${saved} colaborador(es) importado(s).`);
      setReport(null);
      setFileName(null);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["financials"] });
      qc.invalidateQueries({ queryKey: ["commercial"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao importar."),
  });

  async function handleFile(file: File) {
    if (!companyId) return;
    setParsing(true);
    try {
      const parsed = await parseSalesPdf(file);
      setReport(parsed);
      setFileName(file.name);
      toast.success(`${parsed.rows.length} linhas lidas — Total ${formatBRL(parsed.totals.netAmountCents)}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o PDF.");
    } finally {
      setParsing(false);
    }
  }

  if (!companyId) return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Importar Vendas (PDF)</h1>
        <p className="text-sm text-muted-foreground">
          Relatório de Vendas por Colaborador. Os dados são salvos em uma tabela
          separada e não interferem nos lançamentos financeiros.
        </p>
      </header>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" /> Arquivo PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="file"
            accept="application/pdf,.pdf"
            disabled={parsing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {parsing && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo PDF…
            </p>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium">
                Período {report.periodStart} → {report.periodEnd}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Total líquido: <strong>{formatBRL(report.totals.netAmountCents)}</strong> ·{" "}
                {report.totals.salesQty} vendas · {report.totals.itemsQty} itens
              </p>
            </div>
            <Button
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending || !report.rows.length}
            >
              <Upload className="mr-2 h-4 w-4" />
              {importMut.isPending ? "Importando…" : `Importar ${report.rows.length}`}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary/80 text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-2 py-2 text-left">Código</th>
                    <th className="px-2 py-2 text-left">Colaborador</th>
                    <th className="px-2 py-2 text-right">Vlr Líquido</th>
                    <th className="px-2 py-2 text-right">Trocas</th>
                    <th className="px-2 py-2 text-right">Custo</th>
                    <th className="px-2 py-2 text-right">Margem</th>
                    <th className="px-2 py-2 text-right">Itens</th>
                    <th className="px-2 py-2 text-right">Vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => {
                    const margin = r.netAmountCents - r.costCents;
                    return (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                          {r.sellerCode ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">{r.sellerName}</td>
                        <td className="px-2 py-1.5 text-right numeric">{formatBRL(r.netAmountCents)}</td>
                        <td className="px-2 py-1.5 text-right numeric text-muted-foreground">
                          {formatBRL(r.returnsCents)}
                        </td>
                        <td className="px-2 py-1.5 text-right numeric">{formatBRL(r.costCents)}</td>
                        <td className={`px-2 py-1.5 text-right numeric ${margin >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatBRL(margin)}
                        </td>
                        <td className="px-2 py-1.5 text-right numeric">{r.itemsQty}</td>
                        <td className="px-2 py-1.5 text-right numeric">{r.salesQty}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-secondary/40 font-semibold">
                    <td className="px-2 py-2" colSpan={2}>Totais</td>
                    <td className="px-2 py-2 text-right numeric">{formatBRL(report.totals.netAmountCents)}</td>
                    <td className="px-2 py-2 text-right numeric">{formatBRL(report.totals.returnsCents)}</td>
                    <td className="px-2 py-2 text-right numeric">{formatBRL(report.totals.costCents)}</td>
                    <td className="px-2 py-2 text-right numeric">
                      {formatBRL(report.totals.netAmountCents - report.totals.costCents)}
                    </td>
                    <td className="px-2 py-2 text-right numeric">{report.totals.itemsQty}</td>
                    <td className="px-2 py-2 text-right numeric">{report.totals.salesQty}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="border-t border-border p-3 text-right">
              <Badge variant="secondary">Arquivo: {fileName}</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
