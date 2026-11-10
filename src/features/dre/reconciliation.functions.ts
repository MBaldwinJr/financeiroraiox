import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { financialFiltersSchema, selectFinancialFilters } from "@/lib/financial-filters";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchYearTransactions } from "@/features/dashboard/dashboard.repository";
import { bucketTransactionsByMonth, computeKpis, selectedMonthIndices } from "@/features/dashboard/dashboard.domain";
import { fetchDreRows } from "@/features/dre/dre-engine/dre-engine.repository";
import { aggregateByDreLine, buildDreMatrix } from "@/features/dre/dre-engine/dre-engine.domain";
import { buildReconciliationSnapshot } from "./reconciliation.domain";

const Schema = financialFiltersSchema.extend({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
});

/**
 * Conciliação read-only: mesmas empresa, competência, período e filtros.
 * As diferenças são exibidas para revisão; nunca faz lançamentos ou ajustes.
 */
export const getDreReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ context, data }) => {
    const start = `${data.year}-01-01`;
    const end = `${data.year + 1}-01-01`;
    const params = {
      companyId: data.companyId,
      start,
      end,
      ...selectFinancialFilters(data),
    };
    const [transactions, dreRows] = await Promise.all([
      fetchYearTransactions(context.supabase, params),
      fetchDreRows(context.supabase, params),
    ]);
    const { monthly } = bucketTransactionsByMonth(transactions);
    const kpis = computeKpis(monthly, selectedMonthIndices(data.month));
    const matrix = buildDreMatrix(aggregateByDreLine(dreRows));
    return buildReconciliationSnapshot(data.year, data.month, matrix, kpis, transactions);
  });
