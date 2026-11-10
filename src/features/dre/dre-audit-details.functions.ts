import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  companyId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
  page: z.number().int().min(0).max(10000).default(0),
  search: z.string().trim().max(100).default(""),
});

const PAGE_SIZE = 25;

function periodWindow(year: number, month: number | null | undefined) {
  const start = month == null
    ? `${year}-01-01`
    : `${year}-${String(month).padStart(2, "0")}-01`;
  const end = month == null
    ? `${year + 1}-01-01`
    : month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { start, end };
}

export interface AuditDetailRow {
  id: string;
  date: string;
  competencia: string | null;
  description: string | null;
  amount_cents: number;
  kind: "revenue" | "expense";
  payment_method: string | null;
  status: string;
}

/**
 * Drill-down somente de leitura. Mantém exatamente a mesma janela da
 * Auditoria DRE: competência no período OU competência nula com data no período.
 * Todos os resultados são limitados à empresa autorizada pelo RLS.
 */
export const getAuditClassificationDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ context, data }) => {
    const { start, end } = periodWindow(data.year, data.month);
    let q = context.supabase
      .from("transactions")
      .select(
        "id, date, competencia, description, amount_cents, kind, payment_method, status",
        { count: "exact" },
      )
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .or(
        `and(competencia.gte.${start},competencia.lt.${end}),and(competencia.is.null,date.gte.${start},date.lt.${end})`,
      );

    q = data.categoryId
      ? q.eq("category_id", data.categoryId)
      : q.is("category_id", null);

    if (data.search) {
      q = q.ilike("description", `%${data.search.replace(/[%_]/g, "")}%`);
    }

    const offset = data.page * PAGE_SIZE;
    const { data: rows, count, error } = await q
      .order("amount_cents", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []) as AuditDetailRow[],
      total: count ?? 0,
      page: data.page,
      pageSize: PAGE_SIZE,
    };
  });
