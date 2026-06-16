import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";

const ListSchema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
});

const RowSchema = z.object({
  sellerCode: z.string().nullable(),
  sellerName: z.string().min(1),
  netAmountCents: z.number().int(),
  returnsCents: z.number().int(),
  costCents: z.number().int(),
  itemsQty: z.number().int(),
  salesQty: z.number().int(),
});

const ImportSchema = z.object({
  companyId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceFile: z.string().nullable().optional(),
  rows: z.array(RowSchema).min(1),
});

const DeleteSchema = z.object({
  companyId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface SaleRow {
  readonly id: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly seller_code: string | null;
  readonly seller_name: string;
  readonly net_amount_cents: number;
  readonly returns_cents: number;
  readonly cost_cents: number;
  readonly items_qty: number;
  readonly sales_qty: number;
  readonly source_file: string | null;
}

export const listSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ context, data }) => {
    const yearStart = `${data.year}-01-01`;
    const yearEnd = `${data.year + 1}-01-01`;
    const rows = await fetchAllRows<SaleRow>((from, to) =>
      context.supabase
        .from("sales")
        .select(
          "id, period_start, period_end, seller_code, seller_name, net_amount_cents, returns_cents, cost_cents, items_qty, sales_qty, source_file",
        )
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .gte("period_start", yearStart)
        .lt("period_start", yearEnd)
        .order("period_start", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: SaleRow[] | null;
        error: { message: string } | null;
      }>,
    );

    const monthly = new Array<number>(12).fill(0);
    for (const r of rows) {
      const m = Number(r.period_start.slice(5, 7)) - 1;
      monthly[m] += r.net_amount_cents - r.returns_cents;
    }

    const filtered =
      data.month != null
        ? rows.filter((r) => Number(r.period_start.slice(5, 7)) === data.month)
        : rows;

    return { rows: filtered, monthly };
  });

export const importSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportSchema.parse(input))
  .handler(async ({ context, data }) => {
    const payload = data.rows.map((r) => ({
      company_id: data.companyId,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      seller_code: r.sellerCode,
      seller_name: r.sellerName,
      net_amount_cents: r.netAmountCents,
      returns_cents: r.returnsCents,
      cost_cents: r.costCents,
      items_qty: r.itemsQty,
      sales_qty: r.salesQty,
      source_file: data.sourceFile ?? null,
      imported_at: new Date().toISOString(),
      deleted_at: null,
    }));

    const { data: inserted, error } = await context.supabase
      .from("sales")
      .upsert(payload, { onConflict: "company_id,period_start,seller_name" })
      .select("id");

    if (error) throw new Error(error.message);
    return { saved: inserted?.length ?? 0 };
  });

export const deleteSalesPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("sales")
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", data.companyId)
      .eq("period_start", data.periodStart)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
