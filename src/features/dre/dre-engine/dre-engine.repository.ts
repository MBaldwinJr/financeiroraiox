import { fetchAllRows } from "@/lib/supabase-paginate";
import type { DreCompetenciaRow } from "./dre-engine.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;
type PaginatedQuery<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Busca lançamentos por COMPETÊNCIA (nunca por paid_at).
 * Filtra contas patrimoniais na origem para reduzir payload.
 */
export function fetchDreRows(
  supabase: SupabaseClient,
  params: { companyId: string; start: string; end: string },
): Promise<DreCompetenciaRow[]> {
  return fetchAllRows<DreCompetenciaRow>((from, to) =>
    supabase
      .from("transactions")
      .select(
        "competencia, amount_cents, kind, category:categories!inner(account_class, dre_line, is_balance_sheet)",
      )
      .eq("company_id", params.companyId)
      .is("deleted_at", null)
      .eq("categories.is_balance_sheet", false)
      .gte("competencia", params.start)
      .lt("competencia", params.end)
      .range(from, to) as PaginatedQuery<DreCompetenciaRow>,
  );
}
