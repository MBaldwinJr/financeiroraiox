/** Validação pura antes de qualquer atualização financeira na auditoria. */
export interface AuditReassignmentRow {
  id: string;
  kind: "revenue" | "expense";
}

/**
 * Bloqueia mistura de receitas/despesas e IDs inacessíveis, excluídos ou
 * duplicados. NUNCA troca `kind` automaticamente ao mudar a categoria.
 * A consulta do chamador deve ser limitada à empresa e excluir soft-delete.
 */
export function assertCompatibleAuditReassignment(
  requestedIds: readonly string[],
  accessibleRows: readonly AuditReassignmentRow[],
  targetKind: "revenue" | "expense",
): void {
  if (requestedIds.length === 0) {
    throw new Error("Selecione pelo menos um lançamento.");
  }
  const unique = new Set(requestedIds);
  if (unique.size !== requestedIds.length) {
    throw new Error("A seleção contém lançamentos repetidos. Atualize a auditoria.");
  }
  const foundIds = new Set(accessibleRows.map((row) => row.id));
  if (accessibleRows.length !== unique.size || requestedIds.some((id) => !foundIds.has(id))) {
    throw new Error("Alguns lançamentos não estão disponíveis nesta empresa ou já foram excluídos. Atualize a auditoria.");
  }
  if (accessibleRows.some((row) => row.kind !== targetKind)) {
    throw new Error("Não é possível atribuir uma categoria de receita a despesas, ou vice-versa. Separe os lançamentos por tipo.");
  }
}
