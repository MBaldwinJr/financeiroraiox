import { z } from "zod";

/** Campos filtráveis em todas as visões baseadas em transações.
 * Arrays vazios significam "todos". As colunas são fixas (nunca recebidas do cliente).
 */
export const financialFiltersSchema = z.object({
  categoryIds: z.array(z.string().uuid()).max(100).optional(),
  costCenterIds: z.array(z.string().uuid()).max(100).optional(),
  bankAccountIds: z.array(z.string().uuid()).max(100).optional(),
  partyIds: z.array(z.string().uuid()).max(100).optional(),
  paymentMethods: z.array(z.enum(["cash", "pix", "boleto", "cheque", "card"])).max(10).optional(),
});

export type FinancialFilters = z.infer<typeof financialFiltersSchema>;

const FILTER_COLUMNS = [
  ["categoryIds", "category_id"],
  ["costCenterIds", "cost_center_id"],
  ["bankAccountIds", "bank_account_id"],
  ["partyIds", "party_id"],
  ["paymentMethods", "payment_method"],
] as const;

/** Partilha seleção entre cliente e servidor, sem enviar funções do Zustand. */
export function selectFinancialFilters(state: FinancialFilters): FinancialFilters {
  return {
    categoryIds: state.categoryIds,
    costCenterIds: state.costCenterIds,
    bankAccountIds: state.bankAccountIds,
    partyIds: state.partyIds,
    paymentMethods: state.paymentMethods,
  };
}

/** Identificador estável de cache que inclui TODOS os filtros aplicáveis. */
export function financialFiltersKey(filters: FinancialFilters): string {
  return JSON.stringify(
    FILTER_COLUMNS.map(([field]) => [...(filters[field] ?? [])].sort()),
  );
}

export function hasFinancialFilters(filters: FinancialFilters): boolean {
  return FILTER_COLUMNS.some(([field]) => (filters[field]?.length ?? 0) > 0);
}

/** Preserva o tipo do query builder Supabase, incluindo .range, .select etc. */
export function applyFinancialFilters<Query>(
  query: Query,
  filters: FinancialFilters,
): Query {
  type FilterQuery = { in: (column: string, values: string[]) => FilterQuery };
  let filtered = query as unknown as FilterQuery;
  for (const [field, column] of FILTER_COLUMNS) {
    const ids = filters[field];
    if (ids?.length) filtered = filtered.in(column, ids);
  }
  return filtered as unknown as Query;
}
