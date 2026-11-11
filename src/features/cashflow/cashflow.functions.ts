import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { financialFiltersSchema, selectFinancialFilters } from "@/lib/financial-filters";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchPaidExpenses, fetchPaidRevenue } from "@/features/dashboard/dashboard.repository";
import { buildCashMovementMonths } from "./cashflow.domain";

const Schema = financialFiltersSchema.extend({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
});

/**
 * Fluxo registrado como liquidado: somente o ano escolhido e duas consultas
 * por tipo de pagamento. Não baixa DRE, anos anteriores ou lançamentos completos.
 * A resposta contém apenas doze resumos mensais, sob a RLS do usuário.
 */
export const getCashMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ context, data }) => {
    const period = {
      companyId: data.companyId,
      start: `${data.year}-01-01`,
      end: `${data.year + 1}-01-01`,
      ...selectFinancialFilters(data),
    };
    const [paidRevenues, paidExpenses] = await Promise.all([
      fetchPaidRevenue(context.supabase, period),
      fetchPaidExpenses(context.supabase, period),
    ]);

    return {
      year: data.year,
      source: "registered_paid_movements" as const,
      reconciledWithBank: false,
      monthly: buildCashMovementMonths(paidRevenues, paidExpenses),
    };
  });
