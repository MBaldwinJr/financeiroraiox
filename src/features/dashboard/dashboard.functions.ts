import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyRevenueBasis,
  bucketPrevYear,
  bucketTransactionsByMonth,
  computeExpenseComposition,
  computeKpis,
  computePrevious,
  selectedMonthIndices,
  sumPrevYearTotals,
} from "./dashboard.domain";
import {
  fetchErpSales,
  fetchPaidRevenue,
  fetchPrevYearTransactions,
  fetchYearTransactions,
} from "./dashboard.repository";
import type { ErpSaleRow, PaidRevenueRow, RevenueBasis } from "./dashboard.types";

const Schema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
  basis: z.enum(["accrual", "cash", "erp_sales"]).optional(),
});

const yearWindow = (year: number) => ({
  start: `${year}-01-01`,
  end: `${year + 1}-01-01`,
});

async function loadBasisRows(
  supabase: Parameters<typeof fetchPaidRevenue>[0],
  basis: RevenueBasis,
  companyId: string,
  start: string,
  end: string,
): Promise<{ paidRows: PaidRevenueRow[]; salesRows: ErpSaleRow[] }> {
  if (basis === "cash") {
    const paidRows = await fetchPaidRevenue(supabase, { companyId, start, end });
    return { paidRows, salesRows: [] };
  }
  if (basis === "erp_sales") {
    const salesRows = await fetchErpSales(supabase, { companyId, start, end });
    return { paidRows: [], salesRows };
  }
  return { paidRows: [], salesRows: [] };
}

export const getFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ context, data }) => {
    const { start, end } = yearWindow(data.year);
    const prev = yearWindow(data.year - 1);
    const basis: RevenueBasis = data.basis ?? "accrual";

    const [txs, prevRows, basisRows] = await Promise.all([
      fetchYearTransactions(context.supabase, { companyId: data.companyId, start, end }),
      fetchPrevYearTransactions(context.supabase, {
        companyId: data.companyId,
        start: prev.start,
        end: prev.end,
      }),
      loadBasisRows(context.supabase, basis, data.companyId, start, end),
    ]);

    const { monthly, byPayment } = bucketTransactionsByMonth(txs);
    applyRevenueBasis(monthly, basis, basisRows.paidRows, basisRows.salesRows);

    const prevMonthly = bucketPrevYear(prevRows);
    const prevYearTotal = sumPrevYearTotals(prevRows);

    const indices = selectedMonthIndices(data.month);
    const kpis = computeKpis(monthly, indices);
    const previous = computePrevious(data.month, data.year, monthly, prevMonthly, prevYearTotal);
    const expenseComposition = computeExpenseComposition(monthly, indices);

    return {
      kpis: { ...kpis, prev: previous },
      monthly,
      prevMonthly,
      byPayment,
      expenseComposition,
    };
  });
