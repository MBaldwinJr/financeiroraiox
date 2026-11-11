import { aggregateByDreLine, buildDreMatrix, isStoredDreLine } from "@/features/dre/dre-engine/dre-engine.domain";
import type { DreCompetenciaRow } from "@/features/dre/dre-engine/dre-engine.types";

export interface PreviewEntry {
  id: string;
  kind: "revenue" | "expense";
  competencia: string | null;
  amount_cents: number;
  category: { dre_line: string | null; is_balance_sheet: boolean | null } | null;
}

export interface PreviewDestination {
  dre_line: string | null;
  is_balance_sheet: boolean | null;
}

export interface PreviewDifference {
  line: "receita_bruta" | "deducoes" | "cmv" | "lucro_bruto" | "lucro_liquido";
  label: string;
  beforeCents: number;
  afterCents: number;
  deltaCents: number;
}

const COMPARE_LINES = [
  ["receita_bruta", "Receita Bruta"],
  ["deducoes", "Deduções"],
  ["cmv", "CMV"],
  ["lucro_bruto", "Lucro Bruto"],
  ["lucro_liquido", "Lucro Líquido"],
] as const;

function isValidCompetencia(value: string | null): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value);
}

function toDreRows(
  transactions: readonly PreviewEntry[],
  after: boolean,
  destination: PreviewDestination,
): DreCompetenciaRow[] {
  return transactions
    .filter((entry) => isValidCompetencia(entry.competencia))
    .map((entry) => {
      const category = after ? destination : entry.category;
      const line = category && isStoredDreLine(category.dre_line)
        ? category.dre_line
        : null;
      return {
        competencia: entry.competencia!,
        amount_cents: entry.amount_cents,
        kind: entry.kind,
        category: category
          ? {
              account_class: null,
              dre_line: line,
              is_balance_sheet: category.is_balance_sheet === true,
            }
          : null,
      };
    });
}

/**
 * Simula EXCLUSIVAMENTE a contribuição dos lançamentos selecionados,
 * pelo mesmo motor contábil usado na DRE real.
 * before/after NÃO são os totais da empresa. Nenhuma linha é gravada.
 */
export function previewReassignmentImpact(
  transactions: readonly PreviewEntry[],
  destination: PreviewDestination,
): {
  selectedCount: number;
  selectedAmountCents: number;
  withoutCompetenciaCount: number;
  differences: PreviewDifference[];
} {
  const before = buildDreMatrix(aggregateByDreLine(toDreRows(transactions, false, destination)));
  const after = buildDreMatrix(aggregateByDreLine(toDreRows(transactions, true, destination)));

  return {
    selectedCount: transactions.length,
    selectedAmountCents: transactions.reduce((sum, entry) => sum + entry.amount_cents, 0),
    withoutCompetenciaCount: transactions.filter((entry) => !isValidCompetencia(entry.competencia)).length,
    differences: COMPARE_LINES.map(([line, label]) => ({
      line,
      label,
      beforeCents: before[line].total,
      afterCents: after[line].total,
      deltaCents: after[line].total - before[line].total,
    })),
  };
}
