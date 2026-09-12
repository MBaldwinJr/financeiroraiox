import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyCashExpenses,
  applyRevenueBasis,
  bucketPrevYear,
  bucketTransactionsByMonth,
  computeExpenseComposition,
  computeKpis,
  computePrevious,
  emptyMonthBucket,
  selectedMonthIndices,
  sumPrevYearTotals,
} from "./dashboard.domain";
import {
  fetchCentralCashflow,
  fetchErpSales,
  fetchPaidExpenses,
  fetchPaidRevenue,
  fetchPrevYearTransactions,
  fetchYearTransactions,
} from "./dashboard.repository";
import type { ErpSaleRow, PaidExpenseRow, PaidRevenueRow, RevenueBasis } from "./dashboard.types";

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
): Promise<{
  paidRows: PaidRevenueRow[];
  salesRows: ErpSaleRow[];
  paidExpenseRows: PaidExpenseRow[];
}> {
  if (basis === "cash") {
    // Cash is now sourced from the centralized financial engine. The legacy
    // paid-row queries are retained only for non-cash compatibility paths.
    return { paidRows: [], salesRows: [], paidExpenseRows: [] };
  }
  if (basis === "erp_sales") {
    const salesRows = await fetchErpSales(supabase, { companyId, start, end });
    return { paidRows: [], salesRows, paidExpenseRows: [] };
  }
  return { paidRows: [], salesRows: [], paidExpenseRows: [] };
}

export const getFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ context, data }) => {
    const { start, end } = yearWindow(data.year);
    const prev = yearWindow(data.year - 1);
    const basis: RevenueBasis = data.basis ?? "accrual";

    const txs = await fetchYearTransactions(context.supabase, {
      companyId: data.companyId,
      start,
      end,
    });
    const prevRows = await fetchPrevYearTransactions(context.supabase, {
      companyId: data.companyId,
      start: prev.start,
      end: prev.end,
    });
    const basisRows = await loadBasisRows(context.supabase, basis, data.companyId, start, end);

    const { monthly, byPayment } = bucketTransactionsByMonth(txs);

    if (basis === "cash") {
      // P0.4: realized cash is now calculated by the database financial engine,
      // combining legacy paid transactions with new payments without duplication.
      const centralCashflow = await fetchCentralCashflow(context.supabase, {
        companyId: data.companyId,
        start,
        end,
      });

      for (let i = 0; i < monthly.length; i += 1) {
        monthly[i] = emptyMonthBucket();
      }

      for (const row of centralCashflow) {
        const index = Number(row.payment_date.slice(5, 7)) - 1;
        if (index < 0 || index > 11) continue;
        monthly[index].revenue += row.inflow_cents;
        monthly[index].expense += row.outflow_cents;
        // Cash-flow is not a DRE. Put total realized outflow in operational
        // only as a compatibility representation for the existing KPI engine.
        monthly[index].operational += row.outflow_cents;
      }
    } else {
      applyRevenueBasis(monthly, basis, basisRows.paidRows, basisRows.salesRows);
      if (basis === "cash") {
        applyCashExpenses(monthly, basisRows.paidExpenseRows);
      }
    }

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
