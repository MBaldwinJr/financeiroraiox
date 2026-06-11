import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CompanyIdSchema = z.object({ companyId: z.string().uuid() });

export const listErpMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyIdSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("erp_account_mappings")
      .select("erp_code, erp_name, category_id, default_kind")
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const UpsertInput = z.object({
  companyId: z.string().uuid(),
  mappings: z
    .array(
      z.object({
        erpCode: z.string().min(1).max(40),
        erpName: z.string().max(200).nullable().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        defaultKind: z.enum(["revenue", "expense"]).nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const saveErpMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertInput.parse(input))
  .handler(async ({ context, data }) => {
    const payload = data.mappings.map((m) => ({
      company_id: data.companyId,
      erp_code: m.erpCode,
      erp_name: m.erpName ?? null,
      category_id: m.categoryId ?? null,
      default_kind: m.defaultKind ?? null,
    }));
    const { error } = await context.supabase
      .from("erp_account_mappings")
      .upsert(payload, { onConflict: "company_id,erp_code" });
    if (error) throw new Error(error.message);
    return { saved: payload.length };
  });
