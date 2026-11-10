import type { Kpis } from "@/features/dashboard/dashboard.domain";
import type { MonthBucket } from "@/features/dashboard/dashboard.types";
import type { ReconciliationSnapshot } from "@/features/dre/reconciliation.domain";

export interface CategorySpend {
  name: string;
  amountCents: number;
}

export interface FinanceAIContext {
  year: number;
  month: number | null;
  filtersApplied: boolean;
  transactionCount: number;
  monthly: readonly MonthBucket[];
  kpis: Kpis;
  reconciliation: ReconciliationSnapshot;
  categories: readonly CategorySpend[];
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

function money(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Todos os números são gerados por serviços financeiros canônicos, nunca pela IA. */
export function buildFinanceAIContext(input: FinanceAIContext): string {
  const { year, month, monthly, kpis, reconciliation, categories, filtersApplied, transactionCount } = input;
  const selected = month === null ? monthly : [monthly[month - 1]];
  const startMonth = month === null ? 0 : month - 1;
  const period = month === null ? `ano ${year}` : `${MONTHS[month - 1]}/${year}`;
  const isEmpty = transactionCount === 0;
  const details = selected.map((item, i) => {
    const current = MONTHS[startMonth + i];
    return `${current}/${year}: Receita gerencial ${money(item.revenue)}; CMV ${money(item.cmv)}; outras despesas ${money(item.expense - item.cmv)}; resultado gerencial ${money(item.revenue - item.expense)}.`;
  }).join("\n");
  const comparisons = reconciliation.comparisons.map((row) =>
    `${row.label}: DRE=${money(row.dreCents)}; Gerencial=${money(row.managerialCents)}; diferença (gerencial menos DRE)=${money(row.deltaCents)}.`,
  ).join("\n");
  const expenses = categories.length
    ? categories.map((c) => `${c.name}: ${money(c.amountCents)}`).join("\n")
    : "(nenhuma despesa por categoria neste período)";

  return [
    "FONTE: transações da empresa autorizada via RLS, período por COMPETÊNCIA, centavos inteiros; DRE calculada por dre_line e gestão por dre_group.",
    `ESCOPO: ${period}; ${filtersApplied ? "filtros financeiros aplicados" : "todos os filtros financeiros vazios"}; ${transactionCount} lançamentos não patrimoniais no escopo.`,
    "As fontes são gerenciais/contábeis preliminares, não balanço auditado. Caixa, competência e vendas ERP são bases diferentes. Não confundir.",
    isEmpty ? "AVISO: sem movimentações registradas no período selecionado. Não afirmar que houve faturamento zero na realidade." : "",
    `KPI gerencial do período: Receita Bruta ${money(kpis.grossRevenue)}; CMV ${money(kpis.cmv)}; Lucro Bruto ${money(kpis.grossProfit)}; despesas sem CMV ${money(kpis.totalExpenses)}; resultado operacional gerencial ${money(kpis.operatingResult)}; lucro líquido gerencial ${money(kpis.netProfit)}; margem ${(kpis.margin * 100).toFixed(2)}%.`,
    "SÉRIE GERENCIAL NA JANELA CONSULTADA:",
    details,
    "COMPARAÇÃO COM A DRE CONTÁBIL:",
    comparisons,
    `CONCILIAÇÃO: ${reconciliation.totalsMatch ? "quatro totais coincidentes" : "há divergência entre DRE e gestão"}; ${reconciliation.unclassifiedCount} lançamentos sem linha DRE válida; despesas não mapeadas ${money(reconciliation.unclassifiedExpenseCents)}; receitas não mapeadas ${money(reconciliation.unclassifiedRevenueCents)}.`,
    "TOP DESPESAS POR CATEGORIA, EXCETO CMV E CONTAS PATRIMONIAIS:",
    expenses,
    "Não calcular caixa bancário nem sugerir movimentações financeiras automaticamente. Se o pedido exigir dados não incluídos, informar que faltam informações.",
  ].filter(Boolean).join("\n\n");
}
