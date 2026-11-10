import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { financialFiltersSchema, hasFinancialFilters, selectFinancialFilters, type FinancialFilters } from "@/lib/financial-filters";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyCashExpenses,
  applyRevenueBasis,
  bucketTransactionsByMonth,
  computeExpenseComposition,
  computeKpis,
  computePrevious,
  selectedMonthIndices,
} from "./dashboard.domain";
import {
  fetchErpSales,
  fetchPaidExpenses,
  fetchPaidRevenue,
  fetchYearTransactions,
} from "./dashboard.repository";
import { PAYMENT_METHODS, type ErpSaleRow, type PaidExpenseRow, type PaidRevenueRow, type RevenueBasis, type PaymentMethod } from "./dashboard.types";

const Schema = financialFiltersSchema.extend({
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
  filters: FinancialFilters,
): Promise<{
  paidRows: PaidRevenueRow[];
  salesRows: ErpSaleRow[];
  paidExpenseRows: PaidExpenseRow[];
}> {
  if (basis === "cash") {
    const [paidRows, paidExpenseRows] = await Promise.all([
      fetchPaidRevenue(supabase, { companyId, start, end, ...filters }),
      fetchPaidExpenses(supabase, { companyId, start, end, ...filters }),
    ]);
    return { paidRows, salesRows: [], paidExpenseRows };
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
    if (basis === "erp_sales" && hasFinancialFilters(data)) {
      throw new Error("Os filtros por lançamento não são compatíveis com a receita consolidada de vendas ERP. Limpe os filtros ou selecione competência/caixa.");
    }

    const [txs, prevTxs, basisRows, prevBasisRows] = await Promise.all([
      fetchYearTransactions(context.supabase, { companyId: data.companyId, start, end, ...data }),
      fetchYearTransactions(context.supabase, { companyId: data.companyId, start: prev.start, end: prev.end, ...data }),
      loadBasisRows(context.supabase, basis, data.companyId, start, end, data),
      loadBasisRows(context.supabase, basis, data.companyId, prev.start, prev.end, data),
    ]);

    const { monthly, byPayment: accruedPayments } = bucketTransactionsByMonth(txs);
    const { monthly: previousMonths } = bucketTransactionsByMonth(prevTxs);
    const byPayment = PAYMENT_METHODS.reduce((acc, method) => {
      acc[method] = 0;
      return acc;
    }, {} as Record<PaymentMethod, number>);
    if (basis === "accrual") {
      Object.assign(byPayment, accruedPayments);
    }
    applyRevenueBasis(monthly, basis, basisRows.paidRows, basisRows.salesRows);
    applyRevenueBasis(previousMonths, basis, prevBasisRows.paidRows, prevBasisRows.salesRows);
    if (basis === "cash") {
      applyCashExpenses(monthly, basisRows.paidExpenseRows);
      applyCashExpenses(previousMonths, prevBasisRows.paidExpenseRows);
      for (const row of basisRows.paidRows) {
        if (row.paid_at && row.category?.is_balance_sheet !== true && row.payment_method && PAYMENT_METHODS.includes(row.payment_method as PaymentMethod)) {
          byPayment[row.payment_method as PaymentMethod] += row.amount_cents;
        }
      }
    }

    const prevMonthly = previousMonths.map(({ revenue, expense }) => ({ revenue, expense }));

    const indices = selectedMonthIndices(data.month);
    const kpis = computeKpis(monthly, indices);
    const previous = computePrevious(data.month, data.year, monthly, previousMonths);
    const expenseComposition = computeExpenseComposition(monthly, indices);

    return {
      kpis: { ...kpis, prev: previous },
      monthly,
      prevMonthly,
      byPayment,
      expenseComposition,
    };
  });
