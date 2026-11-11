import { fetchAllRowsConcurrent } from "@/lib/supabase-paginate";
import { applyFinancialFilters, type FinancialFilters } from "@/lib/financial-filters";
import type { DreCompetenciaRow } from "./dre-engine.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;
type PaginatedQuery<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>;

/**
 * Busca lançamentos por COMPETÊNCIA (nunca por paid_at).
 * Filtra contas patrimoniais na origem para reduzir payload.
 */
export function fetchDreRows(
  supabase: SupabaseClient,
  params: { companyId: string; start: string; end: string } & FinancialFilters,
): Promise<DreCompetenciaRow[]> {
  return fetchAllRowsConcurrent<DreCompetenciaRow>((from, to, withCount) =>
    applyFinancialFilters(
      supabase
      .from("transactions")
      .select(
        "competencia, amount_cents, kind, category:categories!inner(account_class, dre_line, is_balance_sheet)",
        withCount ? { count: "exact" } : undefined,
      )
      .eq("company_id", params.companyId)
      .is("deleted_at", null)
      .eq("categories.is_balance_sheet", false)
      .gte("competencia", params.start)
      .lt("competencia", params.end)
        .order("competencia", { ascending: true })
        .order("id", { ascending: true }),
      params,
    ).range(from, to) as PaginatedQuery<DreCompetenciaRow>,
  );
}
