import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DRE_GROUPS = [
  "revenue",
  "cmv",
  "supplier",
  "freight",
  "fixed",
  "variable",
  "operational",
  "other",
] as const;

const Input = z.object({
  companyId: z.string().uuid(),
  group: z.enum(DRE_GROUPS),
  year: z.number().int(),
});

export const getDreGroupBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const start = `${data.year}-01-01`;
    const end = `${data.year}-12-31`;

    const { data: categories, error: catErr } = await supabase
      .from("categories")
      .select("id, name, kind, dre_group")
      .eq("company_id", data.companyId)
      .eq("dre_group", data.group)
      .order("name");
    if (catErr) throw new Error(catErr.message);

    const categoryIds = (categories ?? []).map((c) => c.id);
    if (categoryIds.length === 0) {
      return { categories: [], mappings: [], totals: [] as { categoryId: string; total: number; count: number }[] };
    }

    const [mappingsRes, txRes] = await Promise.all([
      supabase
        .from("erp_account_mappings")
        .select("erp_code, erp_name, category_id, default_kind")
        .eq("company_id", data.companyId)
        .in("category_id", categoryIds),
      supabase
        .from("transactions")
        .select("category_id, amount_cents")
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .in("category_id", categoryIds)
        .gte("date", start)
        .lte("date", end),
    ]);
    if (mappingsRes.error) throw new Error(mappingsRes.error.message);
    if (txRes.error) throw new Error(txRes.error.message);

    const totalsMap = new Map<string, { total: number; count: number }>();
    for (const t of txRes.data ?? []) {
      if (!t.category_id) continue;
      const cur = totalsMap.get(t.category_id) ?? { total: 0, count: 0 };
      cur.total += t.amount_cents;
      cur.count += 1;
      totalsMap.set(t.category_id, cur);
    }

    return {
      categories: categories ?? [],
      mappings: mappingsRes.data ?? [],
      totals: categoryIds.map((id) => ({
        categoryId: id,
        total: totalsMap.get(id)?.total ?? 0,
        count: totalsMap.get(id)?.count ?? 0,
      })),
    };
  });

export const DRE_GROUP_LABELS: Record<(typeof DRE_GROUPS)[number], string> = {
  revenue: "Receita Bruta",
  cmv: "CMV",
  supplier: "Fornecedores",
  freight: "Fretes",
  fixed: "Despesas Fixas",
  variable: "Despesas Variáveis",
  operational: "Operacional",
  other: "Outras Despesas",
};

export type DreGroupKey = (typeof DRE_GROUPS)[number];
