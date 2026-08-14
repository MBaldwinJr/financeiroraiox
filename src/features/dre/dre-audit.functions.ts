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
  fingerprint: string | null;
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
    | "conta_patrimonial_em_dre"
    | "duplicidade_detectada";
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
          "id, date, competencia, description, amount_cents, kind, fingerprint, category:categories(id, name, is_balance_sheet, dre_line, account_class)",
        )
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .gte("date", start)
        .lt("date", end)
        .range(from, to),
    );

    const issues: DreAuditIssue[] = [];
    const fpCount = new Map<string, number>();
    for (const r of rows) {
      if (r.fingerprint) {
        fpCount.set(r.fingerprint, (fpCount.get(r.fingerprint) ?? 0) + 1);
      }
    }

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

      if (r.fingerprint && (fpCount.get(r.fingerprint) ?? 0) > 1) {
        push("duplicidade_detectada");
      }

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
        duplicidade_detectada: 0,
      } as Record<DreAuditIssue["reason"], number>,
    );

    return {
      totalTransactions: rows.length,
      totalIssues: issues.length,
      byReason,
      issues: issues.slice(0, 500),
    };
  });

const FillCompetenciaInput = z.object({
  companyId: z.string().uuid(),
  transactionIds: z.array(z.string().uuid()).min(1).max(1000),
});

export const fillMissingCompetencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FillCompetenciaInput.parse(i))
  .handler(async ({ context, data }) => {
    const { data: rows, error: fetchErr } = await context.supabase
      .from("transactions")
      .select("id, date")
      .eq("company_id", data.companyId)
      .in("id", data.transactionIds)
      .is("competencia", null);
    if (fetchErr) throw new Error(fetchErr.message);

    let updated = 0;
    for (const row of rows ?? []) {
      const { error } = await context.supabase
        .from("transactions")
        .update({ competencia: row.date })
        .eq("id", row.id)
        .eq("company_id", data.companyId);
      if (error) throw new Error(error.message);
      updated += 1;
    }
    return { updated };
  });

const ReassignCategoryInput = z.object({
  companyId: z.string().uuid(),
  transactionIds: z.array(z.string().uuid()).min(1).max(1000),
  categoryId: z.string().uuid(),
});

export const reassignCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ReassignCategoryInput.parse(i))
  .handler(async ({ context, data }) => {
    const { data: cat, error: catErr } = await context.supabase
      .from("categories")
      .select("id, kind")
      .eq("company_id", data.companyId)
      .eq("id", data.categoryId)
      .maybeSingle();
    if (catErr) throw new Error(catErr.message);
    if (!cat) throw new Error("Categoria não encontrada");

    const { error } = await context.supabase
      .from("transactions")
      .update({ category_id: data.categoryId, kind: cat.kind })
      .eq("company_id", data.companyId)
      .in("id", data.transactionIds);
    if (error) throw new Error(error.message);
    return { updated: data.transactionIds.length };
  });

export const deleteBulkTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        transactionIds: z.array(z.string().uuid()).min(1).max(1000),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", data.companyId)
      .in("id", data.transactionIds);
    if (error) throw new Error(error.message);
    return { updated: data.transactionIds.length };
  });
