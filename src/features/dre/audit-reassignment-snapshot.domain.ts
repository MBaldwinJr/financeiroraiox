import { createHash } from "node:crypto";

export interface ReassignmentSnapshotRow {
  id: string;
  kind: "revenue" | "expense";
  competencia: string | null;
  amount_cents: number;
  category_id: string | null;
  category: { dre_line: string | null; is_balance_sheet: boolean | null } | null;
}

export interface ReassignmentSnapshotCategory {
  id: string;
  kind: "revenue" | "expense";
  dre_line: string | null;
  is_balance_sheet: boolean | null;
}

/**
 * Prova de consistência da prévia, não credencial de autorização.
 * Permissões são sempre revalidadas no Supabase/RLS; alterações nos dados
 * desde a prévia invalidam a confirmação.
 */
export function reassignmentSnapshotToken(
  companyId: string,
  rows: readonly ReassignmentSnapshotRow[],
  destination: ReassignmentSnapshotCategory,
): string {
  const sorted = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    competencia: row.competencia,
    amount_cents: row.amount_cents,
    category_id: row.category_id,
    dre_line: row.category?.dre_line ?? null,
    is_balance_sheet: row.category?.is_balance_sheet ?? null,
  })).sort((a, b) => a.id.localeCompare(b.id));

  const payload = {
    companyId,
    destination: {
      id: destination.id,
      kind: destination.kind,
      dre_line: destination.dre_line,
      is_balance_sheet: destination.is_balance_sheet,
    },
    rows: sorted,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
