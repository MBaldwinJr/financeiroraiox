import { isStoredDreLine } from "@/features/dre/dre-engine/dre-engine.domain";

export interface ClassificationGapRow {
  amount_cents: number;
  kind: "revenue" | "expense";
  category: {
    id: string;
    name: string;
    dre_line: string | null;
    is_balance_sheet: boolean | null;
  } | null;
}

export interface ClassificationGap {
  categoryId: string | null;
  categoryName: string;
  dreLine: string | null;
  count: number;
  expenseCents: number;
  revenueCents: number;
}

/**
 * Soma TODOS os registros problemáticos, não somente a amostra dos primeiros
 * 500 exibidos pela auditoria. Não inclui movimentos patrimoniais.
 */
export function summarizeClassificationGaps(
  transactions: readonly ClassificationGapRow[],
): ClassificationGap[] {
  const groups = new Map<string, ClassificationGap>();
  for (const row of transactions) {
    if (row.category?.is_balance_sheet === true) continue;
    if (isStoredDreLine(row.category?.dre_line)) continue;
    const key = row.category?.id ?? "__sem_categoria__";
    let group = groups.get(key);
    if (!group) {
      group = {
        categoryId: row.category?.id ?? null,
        categoryName: row.category?.name ?? "Sem categoria",
        dreLine: row.category?.dre_line ?? null,
        count: 0,
        expenseCents: 0,
        revenueCents: 0,
      };
      groups.set(key, group);
    }
    group.count += 1;
    if (row.kind === "expense") group.expenseCents += row.amount_cents;
    else group.revenueCents += row.amount_cents;
  }
  return [...groups.values()].sort(
    (a, b) =>
      (Math.abs(b.expenseCents) + Math.abs(b.revenueCents)) -
      (Math.abs(a.expenseCents) + Math.abs(a.revenueCents)),
  );
}
