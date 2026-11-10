import type { DreMatrix } from "@/features/dre/dre-engine/dre-engine.types";
import type { Kpis, TransactionRow } from "@/features/dashboard/dashboard.domain";

/**
 * Snapshot de conciliação informativo, sem escrita.
 * Valores da DRE vêm do motor dre_line, enquanto os gerenciais vêm do dre_group.
 * Uma diferença NÃO autoriza ajuste automático ou reclassificação.
 */
export interface ComparisonRow {
  label: string;
  dreCents: number;
  managerialCents: number;
  deltaCents: number;
  matches: boolean;
}
export interface ReconciliationSnapshot {
  month: number | null;
  year: number;
  source: "competencia";
  comparisons: ComparisonRow[];
  totalsMatch: boolean;
  hasUnclassified: boolean;
  unclassifiedCount: number;
  unclassifiedCents: number;
  periodTransactionCount: number;
}

type ClassificationRow = Pick<TransactionRow, "competencia" | "amount_cents" | "category">;

export function buildReconciliationSnapshot(
  year: number,
  month: number | null | undefined,
  matrix: DreMatrix,
  kpis: Kpis,
  transactions: readonly ClassificationRow[],
): ReconciliationSnapshot {
  const selected = (values: readonly number[]): number =>
    month == null ? values.reduce((sum, value) => sum + value, 0) : values[month - 1] ?? 0;
  const compare = (label: string, dreCents: number, managerialCents: number): ComparisonRow => ({
    label,
    dreCents,
    managerialCents,
    deltaCents: managerialCents - dreCents,
    matches: dreCents === managerialCents,
  });

  const rows = transactions.filter(
    (tx) => month == null || Number(tx.competencia?.slice(5, 7)) === month,
  );
  const unclassified = rows.filter(
    (tx) => tx.category?.is_balance_sheet !== true && !tx.category?.dre_line,
  );
  const comparisons = [
    compare("Receita Bruta", selected(matrix.receita_bruta.monthly), kpis.grossRevenue),
    compare("CMV", selected(matrix.cmv.monthly), kpis.cmv),
    compare("Lucro Bruto", selected(matrix.lucro_bruto.monthly), kpis.grossProfit),
    compare("Lucro Líquido", selected(matrix.lucro_liquido.monthly), kpis.netProfit),
  ];
  return {
    year,
    month: month ?? null,
    source: "competencia",
    comparisons,
    totalsMatch: comparisons.every((row) => row.matches),
    hasUnclassified: unclassified.length > 0,
    unclassifiedCount: unclassified.length,
    unclassifiedCents: unclassified.reduce((sum, tx) => sum + tx.amount_cents, 0),
    periodTransactionCount: rows.length,
  };
}
