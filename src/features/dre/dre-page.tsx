import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { getDreMatrix } from "@/features/dre/dre-engine/dre-engine.functions";
import { STORED_DRE_LINES, type StoredDreLine } from "@/features/dre/dre-line.functions";
import { FilterBar } from "@/components/layout/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { formatBRL, formatPct, MONTH_LABELS } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DreLine, DreMatrix } from "./dre-engine/dre-engine.types";

const STORED_SET = new Set<DreLine>(STORED_DRE_LINES);

interface LineDef {
  key: DreLine;
  label: string;
  kind: "positive" | "negative" | "subtotal" | "financial";
  indent?: boolean;
  hint: string;
}

const LINES: LineDef[] = [
  { key: "receita_bruta", label: "(+) Receita Bruta", kind: "positive", hint: "Faturamento total de vendas de mercadorias e serviços no período, antes de deduções, devoluções e impostos incidentes sobre a venda." },
  { key: "deducoes", label: "(-) Deduções (Devoluções / Descontos / Impostos s/ Venda)", kind: "negative", indent: true, hint: "Devoluções de vendas, descontos comerciais incondicionais e tributos incidentes sobre a receita (ICMS, PIS, COFINS, ISS, Simples). Não inclui IRPJ/CSLL." },
  { key: "receita_liquida", label: "(=) Receita Líquida", kind: "subtotal", hint: "Receita Bruta menos Deduções. Base contábil para cálculo de margens." },
  { key: "cmv", label: "(-) CMV", kind: "negative", indent: true, hint: "Custo das Mercadorias Vendidas — custo dos produtos efetivamente vendidos (Estoque Inicial + Compras − Estoque Final). Não confundir com pagamentos a fornecedores no fluxo de caixa." },
  { key: "lucro_bruto", label: "(=) Lucro Bruto", kind: "subtotal", hint: "Receita Líquida menos CMV. Mostra a rentabilidade da atividade principal antes das despesas operacionais." },
  { key: "despesa_comercial", label: "(-) Despesas Comerciais", kind: "negative", indent: true, hint: "Gastos ligados à venda: comissões, fretes de saída, marketing, publicidade, propaganda, viagens comerciais, ferramentas de CRM e brindes." },
  { key: "despesa_administrativa", label: "(-) Despesas Administrativas", kind: "negative", indent: true, hint: "Estrutura administrativa: salários e encargos do back-office, aluguel, água, luz, internet, honorários contábeis/jurídicos, software de gestão, material de escritório." },
  { key: "despesa_operacional", label: "(-) Outras Despesas Operacionais", kind: "negative", indent: true, hint: "Despesas operacionais não classificadas como comerciais ou administrativas: manutenção, seguros, taxas, contingências operacionais." },
  { key: "ebitda", label: "(=) EBITDA", kind: "subtotal", hint: "Lucro antes de Juros, Impostos, Depreciação e Amortização. Mede a geração de caixa operacional pura, independente de estrutura financeira e política de investimentos." },
  { key: "depreciacao", label: "(-) Depreciação & Amortização", kind: "negative", indent: true, hint: "Reconhecimento contábil do desgaste de ativos imobilizados (depreciação) e amortização de intangíveis. Despesa não-caixa." },
  { key: "ebit", label: "(=) EBIT", kind: "subtotal", hint: "Lucro Operacional (EBITDA − Depreciação/Amortização). Também chamado de Resultado Operacional." },
  { key: "resultado_financeiro", label: "(±) Resultado Financeiro", kind: "financial", indent: true, hint: "Receitas financeiras (juros ativos, rendimentos de aplicações) menos Despesas financeiras (juros de empréstimos, tarifas bancárias, IOF, descontos concedidos por antecipação)." },
  { key: "lair", label: "(=) LAIR — Lucro Antes IR/CSLL", kind: "subtotal", hint: "Lucro Antes do Imposto de Renda e Contribuição Social. Base de cálculo dos tributos sobre o lucro." },
  { key: "ir_csll", label: "(-) IRPJ + CSLL", kind: "negative", indent: true, hint: "Imposto de Renda Pessoa Jurídica e Contribuição Social sobre o Lucro Líquido, apurados conforme o regime tributário (Lucro Real, Presumido ou Simples)." },
  { key: "lucro_liquido", label: "(=) Lucro Líquido", kind: "subtotal", hint: "Resultado final do exercício após todas as receitas, custos, despesas e tributos. Base para distribuição de dividendos e reinvestimento." },
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
          <TooltipProvider delayDuration={150}>
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
          </TooltipProvider>
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
      <td className={cn("sticky left-0 z-10 bg-card px-3 py-2 text-left", def.indent && "pl-8")}>
        <Tooltip>
          <TooltipTrigger asChild>
            {STORED_SET.has(def.key) ? (
              <Link
                to="/dre_/linha/$line"
                params={{ line: def.key as StoredDreLine }}
                className="inline-flex items-center gap-1.5 border-b border-dotted border-muted-foreground/40 hover:text-primary hover:border-primary"
              >
                {def.label}
                <Info className="h-3 w-3 text-muted-foreground/70" aria-hidden />
              </Link>
            ) : (
              <span className="inline-flex cursor-help items-center gap-1.5 border-b border-dotted border-muted-foreground/40">
                {def.label}
                <Info className="h-3 w-3 text-muted-foreground/70" aria-hidden />
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
            {def.hint}
          </TooltipContent>
        </Tooltip>
      </td>

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
