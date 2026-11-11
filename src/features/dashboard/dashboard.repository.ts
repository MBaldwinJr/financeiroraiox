import { fetchAllRows, fetchAllRowsConcurrent } from "@/lib/supabase-paginate";
import { applyFinancialFilters, type FinancialFilters } from "@/lib/financial-filters";
import type {
  ErpSaleRow,
  PaidExpenseRow,
  PaidRevenueRow,
  PrevTransactionRow,
  TransactionRow,
} from "./dashboard.types";

// Loose typing: Supabase's deep generics would cause TS2589 across our helpers.
// Repository is the single boundary that talks to the client; the rest is pure.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

type PaginatedQuery<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>;

interface DateWindow extends FinancialFilters {
  companyId: string;
  start: string;
  end: string;
}

export function fetchYearTransactions(
  supabase: SupabaseClient,
  { companyId, start, end, ...filters }: DateWindow,
): Promise<TransactionRow[]> {
  // Exclui contas patrimoniais (Fornecedores, Empréstimos, Imobilizado) da DRE.
  return fetchAllRowsConcurrent<TransactionRow>((from, to, withCount) =>
    applyFinancialFilters(
      supabase
      .from("transactions")
      .select("date, competencia, amount_cents, kind, payment_method, category:categories(dre_group, dre_line, is_balance_sheet)", withCount ? { count: "exact" } : undefined)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("competencia", start)
      .lt("competencia", end)
      .order("competencia", { ascending: true })
      .order("id", { ascending: true }),
      filters,
    ).range(from, to) as PaginatedQuery<TransactionRow>,
  );
}

export function fetchPrevYearTransactions(
  supabase: SupabaseClient,
  { companyId, start, end, ...filters }: DateWindow,
): Promise<PrevTransactionRow[]> {
  return fetchAllRows<PrevTransactionRow>((from, to) =>
    applyFinancialFilters(
      supabase
      .from("transactions")
      .select("date, amount_cents, kind, category:categories(is_balance_sheet)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("date", start)
      .lt("date", end),
      filters,
    ).range(from, to) as PaginatedQuery<PrevTransactionRow>,
  );
}

export function fetchPaidRevenue(
  supabase: SupabaseClient,
  { companyId, start, end, ...filters }: DateWindow,
): Promise<PaidRevenueRow[]> {
  return fetchAllRowsConcurrent<PaidRevenueRow>((from, to, withCount) =>
    applyFinancialFilters(
      supabase
      .from("transactions")
      .select("paid_at, amount_cents, payment_method, category:categories(is_balance_sheet)", withCount ? { count: "exact" } : undefined)
      .eq("company_id", companyId)
      .eq("kind", "revenue")
      .eq("status", "paid")
      .is("deleted_at", null)
      .gte("paid_at", start)
      .lt("paid_at", end)
      .order("paid_at", { ascending: true })
      .order("id", { ascending: true }),
      filters,
    ).range(from, to) as PaginatedQuery<PaidRevenueRow>,
  );
}

export function fetchPaidExpenses(
  supabase: SupabaseClient,
  { companyId, start, end, ...filters }: DateWindow,
): Promise<PaidExpenseRow[]> {
  return fetchAllRowsConcurrent<PaidExpenseRow>((from, to, withCount) =>
    applyFinancialFilters(
      supabase
      .from("transactions")
      .select("paid_at, amount_cents, category:categories(dre_group, is_balance_sheet)", withCount ? { count: "exact" } : undefined)
      .eq("company_id", companyId)
      .eq("kind", "expense")
      .eq("status", "paid")
      .is("deleted_at", null)
      .gte("paid_at", start)
      .lt("paid_at", end)
      .order("paid_at", { ascending: true })
      .order("id", { ascending: true }),
      filters,
    ).range(from, to) as PaginatedQuery<PaidExpenseRow>,
  );
}

export function fetchErpSales(
  supabase: SupabaseClient,
  { companyId, start, end, ...filters }: DateWindow,
): Promise<ErpSaleRow[]> {
  return fetchAllRowsConcurrent<ErpSaleRow>((from, to, withCount) =>
    supabase
      .from("sales")
      .select("period_start, net_amount_cents, returns_cents", withCount ? { count: "exact" } : undefined)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("period_start", start)
      .lt("period_start", end)
      .order("period_start", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to) as PaginatedQuery<ErpSaleRow>,
  );
}
