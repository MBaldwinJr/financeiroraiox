import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const getInventoryMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyYear.parse(input))
  .handler(async ({ context, data }): Promise<InventoryMetrics> => {
    const start = `${data.year}-01-01`;
    const end = `${data.year + 1}-01-01`;

    const { data: snaps, error: snapErr } = await context.supabase
      .from("inventory_snapshots")
      .select("id, snapshot_date, cost_cents, retail_cents, notes")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .order("snapshot_date", { ascending: false })
      .limit(24);
    if (snapErr) throw new Error(snapErr.message);

    const history = (snaps ?? []) as InventorySnapshot[];
    const current = history[0] ?? null;
    const previous = history[1] ?? null;

    const today = new Date();
    const yearStart = new Date(`${data.year}-01-01T00:00:00Z`);
    const upper = today < new Date(end) ? today : new Date(end);
    const cmvUpperIso = isoDate(upper);

    const { data: cmvRows, error: cmvErr } = await context.supabase
      .from("transactions")
      .select("amount_cents, category:categories!inner(dre_group)")
      .eq("company_id", data.companyId)
      .eq("kind", "expense")
      .is("deleted_at", null)
      .gte("date", start)
      .lt("date", cmvUpperIso)
      .eq("category.dre_group", "cmv");
    if (cmvErr) throw new Error(cmvErr.message);

    const cmvYtdCents = (cmvRows ?? []).reduce(
      (acc: number, r: { amount_cents: number }) => acc + r.amount_cents,
      0,
    );

    const daysElapsed = Math.max(
      1,
      Math.ceil((upper.getTime() - yearStart.getTime()) / 86_400_000),
    );

    const avgInventoryCents =
      current && previous
        ? Math.round((current.cost_cents + previous.cost_cents) / 2)
        : (current?.cost_cents ?? null);

    const annualizedCmv = (cmvYtdCents / daysElapsed) * 365;
    const turnover =
      avgInventoryCents && avgInventoryCents > 0 ? annualizedCmv / avgInventoryCents : null;

    const cmvDaily = cmvYtdCents / daysElapsed;
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
