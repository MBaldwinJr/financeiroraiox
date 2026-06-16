import { fetchAllRows } from "@/lib/supabase-paginate";
import type {
  ErpSaleRow,
  PaidRevenueRow,
  PrevTransactionRow,
  TransactionRow,
} from "./dashboard.types";

type SupabaseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => any;
    };
  };
};

type PaginatedQuery<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

interface DateWindow {
  companyId: string;
  start: string;
  end: string;
}

export function fetchYearTransactions(
  supabase: SupabaseClient,
  { companyId, start, end }: DateWindow,
): Promise<TransactionRow[]> {
  return fetchAllRows<TransactionRow>((from, to) =>
    (supabase as any)
      .from("transactions")
      .select("date, amount_cents, kind, payment_method, category:categories(dre_group)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("date", start)
      .lt("date", end)
      .range(from, to) as PaginatedQuery<TransactionRow>,
  );
}

export function fetchPrevYearTransactions(
  supabase: SupabaseClient,
  { companyId, start, end }: DateWindow,
): Promise<PrevTransactionRow[]> {
  return fetchAllRows<PrevTransactionRow>((from, to) =>
    (supabase as any)
      .from("transactions")
      .select("date, amount_cents, kind")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("date", start)
      .lt("date", end)
      .range(from, to) as PaginatedQuery<PrevTransactionRow>,
  );
}

export function fetchPaidRevenue(
  supabase: SupabaseClient,
  { companyId, start, end }: DateWindow,
): Promise<PaidRevenueRow[]> {
  return fetchAllRows<PaidRevenueRow>((from, to) =>
    (supabase as any)
      .from("transactions")
      .select("paid_at, amount_cents")
      .eq("company_id", companyId)
      .eq("kind", "revenue")
      .eq("status", "paid")
      .is("deleted_at", null)
      .gte("paid_at", start)
      .lt("paid_at", end)
      .range(from, to) as PaginatedQuery<PaidRevenueRow>,
  );
}

export function fetchErpSales(
  supabase: SupabaseClient,
  { companyId, start, end }: DateWindow,
): Promise<ErpSaleRow[]> {
  return fetchAllRows<ErpSaleRow>((from, to) =>
    (supabase as any)
      .from("sales")
      .select("period_start, net_amount_cents, returns_cents")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("period_start", start)
      .lt("period_start", end)
      .range(from, to) as PaginatedQuery<ErpSaleRow>,
  );
}
