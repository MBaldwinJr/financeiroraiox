import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRowsConcurrent } from "@/lib/supabase-paginate";
import { inventoryAsOfWindow } from "./inventory-period.domain";

const CompanyYear = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
});

export interface InventorySnapshot {
  id: string;
  snapshot_date: string;
  cost_cents: number;
  retail_cents: number | null;
  notes: string | null;
}

export interface InventoryMetrics {
  current: InventorySnapshot | null;
  previous: InventorySnapshot | null;
  history: InventorySnapshot[];
  cmvYtdCents: number;
  cmvDaysElapsed: number;
  avgInventoryCents: number | null;
  turnover: number | null;
  coverageDays: number | null;
  potentialMarginCents: number | null;
  potentialMarginPct: number | null;
}

export const getInventoryMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyYear.parse(input))
  .handler(async ({ context, data }): Promise<InventoryMetrics> => {
    const { start, upperExclusive, daysElapsed } = inventoryAsOfWindow(
      data.year,
      new Date().toISOString().slice(0, 10),
    );

    const { data: snaps, error: snapErr } = await context.supabase
      .from("inventory_snapshots")
      .select("id, snapshot_date, cost_cents, retail_cents, notes")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .gte("snapshot_date", start)
      .lt("snapshot_date", upperExclusive)
      .order("snapshot_date", { ascending: false })
      .limit(24);
    if (snapErr) throw new Error(snapErr.message);

    const history = (snaps ?? []) as InventorySnapshot[];
    const current = history[0] ?? null;
    const previous = history[1] ?? null;

    // The DRE recognizes CMV by COMPETÊNCIA and dre_line, not posting date.
    // Limit inventory metrics to the selected year and as-of date.
    const cmvRows = await fetchAllRowsConcurrent<{ amount_cents: number }>(
      (from, to, withCount) =>
        context.supabase
          .from("transactions")
          .select(
            "amount_cents, category:categories!inner(dre_line, is_balance_sheet)",
            withCount ? { count: "exact" } : undefined,
          )
          .eq("company_id", data.companyId)
          .eq("kind", "expense")
          .is("deleted_at", null)
          .gte("competencia", start)
          .lt("competencia", upperExclusive)
          .eq("category.dre_line", "cmv")
          .eq("category.is_balance_sheet", false)
          .order("competencia", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
            data: { amount_cents: number }[] | null;
            error: { message: string } | null;
            count?: number | null;
          }>,
    );
    const cmvYtdCents = cmvRows.reduce((sum, row) => sum + row.amount_cents, 0);

    const avgInventoryCents =
      current && previous
        ? Math.round((current.cost_cents + previous.cost_cents) / 2)
        : (current?.cost_cents ?? null);

    const annualizedCmv = daysElapsed > 0 ? (cmvYtdCents / daysElapsed) * 365 : 0;
    const turnover =
      avgInventoryCents && avgInventoryCents > 0 ? annualizedCmv / avgInventoryCents : null;

    const cmvDaily = daysElapsed > 0 ? cmvYtdCents / daysElapsed : 0;
    const coverageDays =
      current && cmvDaily > 0 ? current.cost_cents / cmvDaily : null;

    const potentialMarginCents =
      current && current.retail_cents != null
        ? current.retail_cents - current.cost_cents
        : null;
    const potentialMarginPct =
      potentialMarginCents != null && current && current.retail_cents! > 0
        ? potentialMarginCents / current.retail_cents!
        : null;

    return {
      current,
      previous,
      history,
      cmvYtdCents,
      cmvDaysElapsed: daysElapsed,
      avgInventoryCents,
      turnover,
      coverageDays,
      potentialMarginCents,
      potentialMarginPct,
    };
  });

const CreateSchema = z.object({
  companyId: z.string().uuid(),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  costCents: z.number().int().nonnegative(),
  retailCents: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const upsertInventorySnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("inventory_snapshots").upsert(
      {
        company_id: data.companyId,
        snapshot_date: data.snapshotDate,
        cost_cents: data.costCents,
        retail_cents: data.retailCents ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
        deleted_at: null,
      },
      { onConflict: "company_id,snapshot_date" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteSchema = z.object({
  companyId: z.string().uuid(),
  id: z.string().uuid(),
});

export const deleteInventorySnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("inventory_snapshots")
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", data.companyId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
