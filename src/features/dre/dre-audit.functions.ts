import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";

const Input = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
});

interface TxRow {
  id: string;
  date: string;
  competencia: string | null;
  description: string | null;
  amount_cents: number;
  kind: "revenue" | "expense";
  category: {
    id: string;
    name: string;
    is_balance_sheet: boolean | null;
    dre_line: string | null;
    account_class: string | null;
  } | null;
}

export interface DreAuditIssue {
  id: string;
  date: string;
  competencia: string | null;
  description: string | null;
  amount_cents: number;
  kind: "revenue" | "expense";
  categoryName: string | null;
  reason:
    | "sem_categoria"
    | "categoria_sem_dre_line"
    | "categoria_sem_account_class"
    | "sem_competencia"
    | "conta_patrimonial_em_dre";
}

export interface DreAuditSummary {
  totalTransactions: number;
  totalIssues: number;
  byReason: Record<DreAuditIssue["reason"], number>;
  issues: DreAuditIssue[];
}

export const getDreAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ context, data }): Promise<DreAuditSummary> => {
    const start = `${data.year}-01-01`;
    const end = `${data.year + 1}-01-01`;
    const rows = await fetchAllRows<TxRow>((from, to) =>
      context.supabase
        .from("transactions")
        .select(
          "id, date, competencia, description, amount_cents, kind, category:categories(id, name, is_balance_sheet, dre_line, account_class)",
        )
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .gte("date", start)
        .lt("date", end)
        .range(from, to),
    );

    const issues: DreAuditIssue[] = [];
    for (const r of rows) {
      const push = (reason: DreAuditIssue["reason"]) =>
        issues.push({
          id: r.id,
          date: r.date,
          competencia: r.competencia,
          description: r.description,
          amount_cents: r.amount_cents,
          kind: r.kind,
          categoryName: r.category?.name ?? null,
          reason,
        });

      if (!r.category) {
        push("sem_categoria");
        continue;
      }
      if (!r.competencia) push("sem_competencia");
      if (r.category.is_balance_sheet) {
        // Conta patrimonial NÃO deveria impactar DRE. Apenas informativo.
        push("conta_patrimonial_em_dre");
        continue;
      }
      if (!r.category.dre_line) push("categoria_sem_dre_line");
      if (!r.category.account_class) push("categoria_sem_account_class");
    }

    const byReason = issues.reduce(
      (acc, i) => {
        acc[i.reason] = (acc[i.reason] ?? 0) + 1;
        return acc;
      },
      {
        sem_categoria: 0,
        categoria_sem_dre_line: 0,
        categoria_sem_account_class: 0,
        sem_competencia: 0,
        conta_patrimonial_em_dre: 0,
      } as Record<DreAuditIssue["reason"], number>,
    );

    return {
      totalTransactions: rows.length,
      totalIssues: issues.length,
      byReason,
      issues: issues.slice(0, 500),
    };
  });
