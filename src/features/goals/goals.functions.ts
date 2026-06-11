import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KINDS = ["revenue", "profit", "expense_cap"] as const;

const ListSchema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
});

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  kind: z.enum(KINDS),
  targetCents: z.number().int().min(0),
  notes: z.string().max(500).nullable().optional(),
});

const IdSchema = z.object({ id: z.string().uuid() });

export const listGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("goals")
      .select("id, year, month, kind, target_cents, notes")
      .eq("company_id", data.companyId)
      .eq("year", data.year)
      .order("month", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertSchema.parse(input))
  .handler(async ({ context, data }) => {
    const payload = {
      company_id: data.companyId,
      year: data.year,
      month: data.month,
      kind: data.kind,
      target_cents: data.targetCents,
      notes: data.notes ?? null,
      created_by: context.userId,
    };
    const { error } = await context.supabase
      .from("goals")
      .upsert(payload, { onConflict: "company_id,year,month,kind" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("goals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
