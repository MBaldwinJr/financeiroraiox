import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { getDreMatrix } from "@/features/dre/dre-engine/dre-engine.functions";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatPct, MONTH_LABELS } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DreLine, DreMatrix } from "./dre-engine/dre-engine.types";

interface LineDef {
  key: DreLine;
  label: string;
  kind: "positive" | "negative" | "subtotal" | "financial";
  indent?: boolean;
}

const LINES: LineDef[] = [
  { key: "receita_bruta", label: "(+) Receita Bruta", kind: "positive" },
  { key: "deducoes", label: "(-) Deduções (Devoluções / Descontos / Impostos s/ Venda)", kind: "negative", indent: true },
  { key: "receita_liquida", label: "(=) Receita Líquida", kind: "subtotal" },
  { key: "cmv", label: "(-) CMV", kind: "negative", indent: true },
  { key: "lucro_bruto", label: "(=) Lucro Bruto", kind: "subtotal" },
  { key: "despesa_comercial", label: "(-) Despesas Comerciais", kind: "negative", indent: true },
  { key: "despesa_administrativa", label: "(-) Despesas Administrativas", kind: "negative", indent: true },
  { key: "despesa_operacional", label: "(-) Outras Despesas Operacionais", kind: "negative", indent: true },
  { key: "ebitda", label: "(=) EBITDA", kind: "subtotal" },
  { key: "depreciacao", label: "(-) Depreciação & Amortização", kind: "negative", indent: true },
  { key: "ebit", label: "(=) EBIT", kind: "subtotal" },
  { key: "resultado_financeiro", label: "(±) Resultado Financeiro", kind: "financial", indent: true },
  { key: "lair", label: "(=) LAIR — Lucro Antes IR/CSLL", kind: "subtotal" },
  { key: "ir_csll", label: "(-) IRPJ + CSLL", kind: "negative", indent: true },
  { key: "lucro_liquido", label: "(=) Lucro Líquido", kind: "subtotal" },
];

export function DrePage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const range = useFilterStore((s) => s.range);
  const fetcher = useServerFn(getDreMatrix);
  const query = useQuery({
    queryKey: ["dre-matrix", companyId, range.year],
    queryFn: () => fetcher({ data: { companyId: companyId!, year: range.year } }),
    enabled: !!companyId,
  });

  if (!companyId) return <p className="text-sm text-muted-foreground">Selecione uma empresa.</p>;
  if (!query.data) return <p className="text-sm text-muted-foreground">Carregando DRE…</p>;
  const matrix = query.data as DreMatrix;

  const revenue = matrix.receita_bruta;
  const net = matrix.lucro_liquido;
  const margin = revenue.monthly.map((r, i) => (r > 0 ? net.monthly[i] / r : 0));
  const marginTotal = revenue.total > 0 ? net.total / revenue.total : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">DRE Contábil — {range.year}</h1>
        <p className="text-sm text-muted-foreground">
          Padrão CPC/IFRS · Regime de Competência · Contas patrimoniais (Fornecedores, Empréstimos, Imobilizado) não são abatidas.
        </p>
      </header>
      <FilterBar />

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Demonstrativo do Resultado do Exercício</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs numeric">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="sticky left-0 z-10 w-72 bg-secondary/40 px-3 py-2 text-left font-medium">Conta</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="px-2 py-2 text-right font-medium text-muted-foreground">{m}</th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {LINES.map((line) => (
                <DreRow key={line.key} def={line} row={matrix[line.key]} />
              ))}
              <tr className="border-t border-border">
                <td className="sticky left-0 z-10 bg-card px-3 py-2 font-semibold">Margem Líquida %</td>
                {margin.map((m, i) => (
                  <td key={i} className={cn("px-2 py-2 text-right", m >= 0 ? "text-success" : "text-destructive")}>
                    {formatPct(m)}
                  </td>
                ))}
                <td className={cn("px-3 py-2 text-right font-semibold", marginTotal >= 0 ? "text-success" : "text-destructive")}>
                  {formatPct(marginTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function DreRow({ def, row }: { def: LineDef; row: DreMatrix[DreLine] }) {
  const isSubtotal = def.kind === "subtotal";
  const cellClass = (v: number) => {
    if (v === 0) return "text-muted-foreground";
    if (def.kind === "positive" || (isSubtotal && v > 0)) return "text-success";
    if (def.kind === "negative" || (isSubtotal && v < 0)) return "text-destructive";
    if (def.kind === "financial") return v >= 0 ? "text-destructive" : "text-success";
    return "";
  };
  return (
    <tr className={cn("border-b border-border/60", isSubtotal && "bg-secondary/30 font-semibold")}>
      <td className={cn("sticky left-0 z-10 bg-card px-3 py-2 text-left", def.indent && "pl-8")}>{def.label}</td>
      {row.monthly.map((v, i) => (
        <td key={i} className={cn("px-2 py-2 text-right", cellClass(v))}>
          {v === 0 ? "—" : formatBRL(v)}
        </td>
      ))}
      <td className={cn("px-3 py-2 text-right", cellClass(row.total), isSubtotal && "font-semibold")}>
        {row.total === 0 ? "—" : formatBRL(row.total)}
      </td>
    </tr>
  );
}
