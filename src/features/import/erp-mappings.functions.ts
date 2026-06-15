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

    // Reaplica os mapeamentos nos lançamentos já importados.
    // Os lançamentos guardam o código ERP no campo `notes` no formato "[ERP <code>] ...".
    let updated = 0;
    for (const m of data.mappings) {
      const patch: Record<string, string | null> = {};
      if (m.categoryId !== undefined) patch.category_id = m.categoryId ?? null;
      if (m.defaultKind) patch.kind = m.defaultKind;
      if (Object.keys(patch).length === 0) continue;

      const { data: rows, error: updErr } = await context.supabase
        .from("transactions")
        .update(patch)
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .like("notes", `[ERP ${m.erpCode}]%`)
        .select("id");
      if (updErr) throw new Error(updErr.message);
      updated += rows?.length ?? 0;
    }

    return { saved: payload.length, updatedTransactions: updated };
  });
