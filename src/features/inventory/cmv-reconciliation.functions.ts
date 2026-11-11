import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRowsConcurrent } from "@/lib/supabase-paginate";
import { fetchDreRows } from "@/features/dre/dre-engine/dre-engine.repository";
import { aggregateByDreLine } from "@/features/dre/dre-engine/dre-engine.domain";
import {
  reconcileCmvSources,
  type ErpCostRow,
  type InventoryCostSnapshot,
} from "./cmv-reconciliation.domain";

const Schema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
});

/** Read-only, on-demand comparison. All three sources use the user's RLS. */
export const getCmvSourceReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ context, data }) => {
    const start = `${data.year}-01-01`;
    const end = `${data.year + 1}-01-01`;

    const [dreRows, sales, inventoryResult] = await Promise.all([
      fetchDreRows(context.supabase, { companyId: data.companyId, start, end }),
      fetchAllRowsConcurrent<ErpCostRow>((from, to, withCount) =>
        context.supabase
          .from("sales")
          .select(
            "period_start, period_end, cost_cents",
            withCount ? { count: "exact" } : undefined,
          )
          .eq("company_id", data.companyId)
          .is("deleted_at", null)
          .gte("period_start", start)
          .lt("period_start", end)
          .order("period_start", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
            data: ErpCostRow[] | null;
            error: { message: string } | null;
            count?: number | null;
          }>,
      ),
      context.supabase
        .from("inventory_snapshots")
        .select("snapshot_date, cost_cents")
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .gte("snapshot_date", start)
        .lt("snapshot_date", end)
        .order("snapshot_date", { ascending: true })
        .limit(500),
    ]);

    if (inventoryResult.error) throw new Error(inventoryResult.error.message);

    const matrix = aggregateByDreLine(dreRows);
    const countByMonth = Array(12).fill(0) as number[];
    for (const row of dreRows) {
      if (row.category?.is_balance_sheet === true || row.category?.dre_line !== "cmv") continue;
      const monthIndex = Number(row.competencia.slice(5, 7)) - 1;
      if (monthIndex >= 0 && monthIndex < 12) countByMonth[monthIndex] += 1;
    }

    return reconcileCmvSources(
      data.year,
      matrix.cmv.monthly,
      countByMonth,
      sales,
      (inventoryResult.data ?? []) as InventoryCostSnapshot[],
    );
  });
