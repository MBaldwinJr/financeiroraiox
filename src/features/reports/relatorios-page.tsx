import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Download } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { FilterBar } from "@/components/layout/filter-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, fromCents, MONTH_LABELS } from "@/lib/money";
import { getFinancials } from "@/features/dashboard/dashboard.functions";
import { listAllTransactions } from "@/features/transactions/transactions.functions";

type Monthly = NonNullable<ReturnType<typeof useDre>["data"]>["monthly"];

function useDre() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const year = useFilterStore((s) => s.range.year);
  const fetcher = useServerFn(getFinancials);
  return useQuery({
    queryKey: ["financials", companyId, year, null],
    queryFn: () => fetcher({ data: { companyId: companyId!, year, month: null } }),
    enabled: !!companyId,
  });
}

interface DreRow {
  label: string;
  values: number[];
  total: number;
  isTotal?: boolean;
}

function buildDre(monthly: Monthly): DreRow[] {
  const sum = (k: keyof Monthly[number]) => monthly.map((m) => m[k]);
  const revenue = sum("revenue");
  const cmv = sum("cmv");
  const supplier = sum("supplier");
  const freight = sum("freight");
  const fixed = sum("fixed");
  const variable = sum("variable");
  const operational = sum("operational");
  const other = sum("other");
  // Total de Despesas exclui o CMV, que já reduz a Receita no Lucro Bruto.
  const totalExpense = monthly.map((m) => m.expense - m.cmv);
  const grossProfit = revenue.map((r, i) => r - cmv[i]);
  const operatingResult = revenue.map(
    (r, i) =>
      r - cmv[i] - supplier[i] - freight[i] - fixed[i] - variable[i] - operational[i],
  );
  const netProfit = grossProfit.map((g, i) => g - totalExpense[i]);

  const row = (label: string, values: number[], isTotal = false): DreRow => ({
    label,
    values,
    total: values.reduce((a, b) => a + b, 0),
    isTotal,
  });

  return [
    row("(=) Receita Bruta", revenue, true),
    row("(-) CMV", cmv),
    row("(=) Lucro Bruto", grossProfit, true),
    row("(-) Fornecedores", supplier),
    row("(-) Fretes", freight),
    row("(-) Despesas Fixas", fixed),
    row("(-) Despesas Variáveis", variable),
    row("(-) Despesas Operacionais", operational),
    row("(-) Outras Despesas", other),
    row("(=) Resultado Operacional", operatingResult, true),
    row("(-) Total de Despesas", totalExpense),
    row("(=) Lucro Líquido", netProfit, true),
  ];
}

export function RelatoriosPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const year = useFilterStore((s) => s.range.year);
  const dreQ = useDre();

  const fetchTx = useServerFn(listAllTransactions);
  const txQ = useQuery({
    queryKey: ["report-transactions-all", companyId, year],
    queryFn: () =>
      fetchTx({
        data: { companyId: companyId!, year, month: null },
      }),
    enabled: !!companyId,
  });


  const handleExcel = () => {
    if (!dreQ.data) return;
    const dre = buildDre(dreQ.data.monthly);
    const header = ["Linha", ...MONTH_LABELS, "Total"];
    const body = dre.map((r) => [r.label, ...r.values.map(fromCents), fromCents(r.total)]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws["!cols"] = [{ wch: 28 }, ...Array(13).fill({ wch: 14 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DRE");

    if (txQ.data?.rows.length) {
      const txHeader = ["Data", "Descrição", "Tipo", "Categoria", "Valor (R$)"];
      const txBody = txQ.data.rows.map((t) => [
        t.date,
        t.description,
        t.kind === "revenue" ? "Receita" : "Despesa",
        t.categories?.name ?? "—",
        (t.kind === "revenue" ? 1 : -1) * fromCents(t.amount_cents),
      ]);
      const txWs = XLSX.utils.aoa_to_sheet([txHeader, ...txBody]);
      txWs["!cols"] = [
        { wch: 12 },
        { wch: 40 },
        { wch: 10 },
        { wch: 20 },
        { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, txWs, "Lançamentos");
    }

    XLSX.writeFile(wb, `relatorio-financeiro-${year}.xlsx`);
    toast.success("Excel gerado");
  };

  const handlePdf = () => {
    if (!dreQ.data) return;
    const dre = buildDre(dreQ.data.monthly);
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(16);
    doc.text(`Relatório Financeiro — ${year}`, 40, 40);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 40, 58);

    autoTable(doc, {
      startY: 80,
      head: [["Linha", ...MONTH_LABELS, "Total"]],
      body: dre.map((r) => [
        r.label,
        ...r.values.map((v) => formatBRL(v)),
        formatBRL(r.total),
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [31, 41, 55], textColor: 255 },
      didParseCell: (data) => {
        const row = dre[data.row.index];
        if (row?.isTotal) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 243, 248];
        }
      },
    });

    doc.save(`relatorio-financeiro-${year}.pdf`);
    toast.success("PDF gerado");
  };

  if (!companyId)
    return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;

  const dre = dreQ.data ? buildDre(dreQ.data.monthly) : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Exporte a DRE e os lançamentos do ano em Excel ou PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExcel} disabled={!dreQ.data}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
          <Button onClick={handlePdf} disabled={!dreQ.data}>
            <FileText className="mr-2 h-4 w-4" /> Exportar PDF
          </Button>
        </div>
      </header>

      <FilterBar />

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Prévia — DRE {year}</CardTitle>
          <Download className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Linha</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="px-2 py-2 text-right">
                      {m}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {dre.map((r) => (
                  <tr
                    key={r.label}
                    className={
                      r.isTotal
                        ? "border-t border-border bg-secondary/30 font-semibold"
                        : "border-t border-border/40"
                    }
                  >
                    <td className="px-3 py-1.5">{r.label}</td>
                    {r.values.map((v, i) => (
                      <td key={i} className="px-2 py-1.5 text-right numeric">
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right numeric">{formatBRL(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
