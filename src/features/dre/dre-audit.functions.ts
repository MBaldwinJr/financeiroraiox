import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { isStoredDreLine } from "@/features/dre/dre-engine/dre-engine.domain";
import { summarizeClassificationGaps, type ClassificationGap } from "./dre-audit.domain";
import { assertCompatibleAuditReassignment } from "./audit-reassignment.domain";

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
  unmappedGroups: ClassificationGap[];
  issues: DreAuditIssue[];
}

export const getDreAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ context, data }): Promise<DreAuditSummary> => {
    const start = `${data.year}-01-01`;
    const end = `${data.year + 1}-01-01`;
    const selectColumns =
      "id, date, competencia, description, amount_cents, kind, fingerprint, category:categories(id, name, is_balance_sheet, dre_line, account_class)";
    // A DRE usa competência. Incluir também os registros sem competência pelo
    // ano da data do lançamento, sem duplicar linhas entre as consultas.
    const [byCompetence, missingCompetence] = await Promise.all([
      fetchAllRows<TxRow>((from, to) =>
        context.supabase
          .from("transactions")
          .select(selectColumns)
          .eq("company_id", data.companyId)
          .is("deleted_at", null)
          .gte("competencia", start)
          .lt("competencia", end)
          .range(from, to),
      ),
      fetchAllRows<TxRow>((from, to) =>
        context.supabase
          .from("transactions")
          .select(selectColumns)
          .eq("company_id", data.companyId)
          .is("deleted_at", null)
          .is("competencia", null)
          .gte("date", start)
          .lt("date", end)
          .range(from, to),
      ),
    ]);
    const rows = [...byCompetence, ...missingCompetence];

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

      if (!r.competencia) push("sem_competencia");
      if (!r.category) {
        push("sem_categoria");
        continue;
      }
      if (r.category.is_balance_sheet) {
        // Movimentações patrimoniais são legitimamente excluídas da DRE.
        // Não marcar toda liquidação de fornecedor como inconsistência.
        continue;
      }
      if (!isStoredDreLine(r.category.dre_line)) push("categoria_sem_dre_line");
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

    const issuePriority: Record<DreAuditIssue["reason"], number> = {
      sem_categoria: 0,
      categoria_sem_dre_line: 1,
      sem_competencia: 2,
      duplicidade_detectada: 3,
      categoria_sem_account_class: 4,
      conta_patrimonial_em_dre: 5,
    };
    issues.sort((a, b) =>
      issuePriority[a.reason] - issuePriority[b.reason] ||
      Math.abs(b.amount_cents) - Math.abs(a.amount_cents),
    );

    return {
      totalTransactions: rows.length,
      totalIssues: issues.length,
      byReason,
      unmappedGroups: summarizeClassificationGaps(rows),
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
      .is("deleted_at", null)
      .is("competencia", null);
    if (fetchErr) throw new Error(fetchErr.message);

    let updated = 0;
    for (const row of rows ?? []) {
      const { data: changed, error } = await context.supabase
        .from("transactions")
        .update({ competencia: row.date })
        .eq("id", row.id)
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .is("competencia", null)
        .select("id");
      if (error) throw new Error(error.message);
      updated += changed?.length ?? 0;
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
    if (cat.kind !== "revenue" && cat.kind !== "expense") {
      throw new Error("Tipo da categoria inválido para atribuição.");
    }

    // Verificar tudo antes de alterar qualquer lançamento, evitando trocas
    // silenciosas entre receita/despesa e IDs de empresas diferentes.
    const { data: rows, error: readErr } = await context.supabase
      .from("transactions")
      .select("id, kind")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .in("id", data.transactionIds);
    if (readErr) throw new Error(readErr.message);
    assertCompatibleAuditReassignment(data.transactionIds, rows ?? [], cat.kind);

    const { data: updatedRows, error } = await context.supabase
      .from("transactions")
      .update({ category_id: data.categoryId })
      .eq("company_id", data.companyId)
      .eq("kind", cat.kind)
      .is("deleted_at", null)
      .in("id", data.transactionIds)
      .select("id");
    if (error) throw new Error(error.message);
    return { updated: updatedRows?.length ?? 0 };
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
    const { data: changed, error } = await context.supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .in("id", data.transactionIds)
      .select("id");
    if (error) throw new Error(error.message);
    return { updated: changed?.length ?? 0 };
  });

export const purgeImportedTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ companyId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    // Delete transactions that have a fingerprint (indicating they were imported)
    // and belong to the company, but NOT those without fingerprints (manual).
    const { error, count } = await context.supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .not("fingerprint", "is", null);

    if (error) throw new Error(error.message);

    // Also mark all import jobs for this company as 'failed' or similar if they were pending
    await context.supabase
      .from("import_jobs")
      .update({ status: "failed", error: "Limpeza manual solicitada pelo usuário" })
      .eq("company_id", data.companyId)
      .in("status", ["pending", "processing"]);

    return { deleted: count ?? 0 };
  });
