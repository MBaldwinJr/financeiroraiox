import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Download } from "lucide-react";


import { useCompanyStore } from "@/stores/company-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { importTransactions } from "@/features/transactions/transactions.functions";
import { toCents } from "@/lib/money";

interface ParsedRow {
  date: string;
  description: string;
  amountCents: number;
  kind: "revenue" | "expense";
  paymentMethod: "cash" | "pix" | "boleto" | "cheque" | "card" | null;
  categoryName?: string | null;
  costCenterName?: string | null;
  bankAccountName?: string | null;
  partyName?: string | null;
  notes?: string | null;
}

const PAYMENT_MAP: Record<string, ParsedRow["paymentMethod"]> = {
  dinheiro: "cash",
  cash: "cash",
  pix: "pix",
  boleto: "boleto",
  cheque: "cheque",
  cartao: "card",
  cartão: "card",
  card: "card",
};

function normalizeDate(value: unknown): string | null {
  if (typeof value === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.y}-${pad(date.m)}-${pad(date.d)}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const m = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

export function ImportPage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const importFn = useServerFn(importTransactions);
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => importFn({ data: { companyId: companyId!, rows } }),
    onSuccess: ({ inserted }) => {
      toast.success(`${inserted} lançamentos importados!`);
      setRows([]);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (!buf) return;
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const parsed: ParsedRow[] = [];
      const errs: string[] = [];
      json.forEach((r, idx) => {
        const dateRaw = r["Data"] ?? r["data"] ?? r["date"];
        const descRaw = r["Descrição"] ?? r["Descricao"] ?? r["descricao"] ?? r["description"];
        const amtRaw = r["Valor"] ?? r["valor"] ?? r["amount"];
        const kindRaw = String(r["Tipo"] ?? r["tipo"] ?? r["kind"] ?? "").toLowerCase();
        const payRaw = String(r["Pagamento"] ?? r["pagamento"] ?? r["payment"] ?? "")
          .toLowerCase()
          .trim();

        const date = normalizeDate(dateRaw);
        const desc = String(descRaw ?? "").trim();
        const amount = Number(String(amtRaw ?? "").replace(",", "."));
        const kind: "revenue" | "expense" =
          kindRaw.startsWith("rec") || kindRaw === "receita" || kindRaw === "revenue"
            ? "revenue"
            : "expense";

        if (!date || !desc || !Number.isFinite(amount) || amount < 0) {
          errs.push(`Linha ${idx + 2}: dados inválidos`);
          return;
        }
        parsed.push({
          date,
          description: desc.slice(0, 280),
          amountCents: toCents(amount),
          kind,
          paymentMethod: PAYMENT_MAP[payRaw] ?? null,
          categoryName: String(r["Categoria"] ?? r["categoria"] ?? "") || null,
          costCenterName: String(r["Centro"] ?? r["centro"] ?? "") || null,
          bankAccountName: String(r["Conta"] ?? r["conta"] ?? "") || null,
          partyName: String(r["Cliente"] ?? r["Fornecedor"] ?? r["cliente"] ?? "") || null,
          notes: String(r["Observação"] ?? r["Observacao"] ?? "") || null,
        });
      });
      setRows(parsed);
      setErrors(errs);
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadTemplate() {
    const data = [
      {
        Data: "01/01/2026",
        Descrição: "Venda de produto",
        Valor: 1500,
        Tipo: "receita",
        Pagamento: "pix",
        Categoria: "Vendas",
        Centro: "Comercial",
        Conta: "Caixa",
        Cliente: "",
        Observação: "",
      },
      {
        Data: "02/01/2026",
        Descrição: "Aluguel",
        Valor: 2500,
        Tipo: "despesa",
        Pagamento: "boleto",
        Categoria: "Aluguel",
        Centro: "Administrativo",
        Conta: "Caixa",
        Cliente: "Imobiliária X",
        Observação: "Janeiro",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.writeFile(wb, "modelo-lancamentos-fvp.xlsx");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importar Lançamentos</h1>
          <p className="text-sm text-muted-foreground">
            Suba sua planilha Excel ou CSV. Categorias e contas são associadas automaticamente por
            nome.
          </p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" /> Baixar modelo
        </Button>
      </header>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileSpreadsheet className="h-4 w-4" /> Selecione um arquivo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {errors.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {errors.slice(0, 5).map((e) => (
                <p key={e}>{e}</p>
              ))}
              {errors.length > 5 && <p>+ {errors.length - 5} outros…</p>}
            </div>
          )}
          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{rows.length} linhas válidas</Badge>
                <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
                  <Upload className="mr-2 h-4 w-4" />
                  {mut.isPending ? "Importando…" : `Importar ${rows.length} lançamentos`}
                </Button>
              </div>
              <div className="max-h-80 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/40 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left">Data</th>
                      <th className="px-2 py-1 text-left">Descrição</th>
                      <th className="px-2 py-1 text-left">Tipo</th>
                      <th className="px-2 py-1 text-right">Valor</th>
                      <th className="px-2 py-1 text-left">Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1 numeric">{r.date}</td>
                        <td className="px-2 py-1">{r.description}</td>
                        <td className="px-2 py-1">{r.kind === "revenue" ? "Receita" : "Despesa"}</td>
                        <td className="px-2 py-1 text-right numeric">
                          {(r.amountCents / 100).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-2 py-1">{r.categoryName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
