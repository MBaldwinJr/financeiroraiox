import { createServerFn } from "@tanstack/react-start";
import { createHash } from "crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";

function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fingerprintFor(
  companyId: string,
  r: {
    date: string;
    kind: "revenue" | "expense";
    amountCents: number;
    description: string;
    docNumber?: string | null;
    erpCode?: string | null;
  },
): string {
  const key = [
    companyId,
    r.date,
    r.kind,
    r.amountCents,
    normalizeText(r.description),
    r.docNumber ?? "",
    r.erpCode ?? "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}


const KINDS = ["revenue", "expense"] as const;

const RowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(280),
  amountCents: z.number().int().min(0),
  kind: z.enum(KINDS),
  categoryName: z.string().nullable().optional(),
  partyName: z.string().nullable().optional(),
  erpCode: z.string().max(60).nullable().optional(),
  docNumber: z.string().max(60).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const EnqueueSchema = z.object({
  companyId: z.string().uuid(),
  source: z.string().min(1).max(40).default("erp_pdf"),
  rows: z.array(RowSchema).min(1).max(20000),
});

export const enqueueImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EnqueueSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("import_jobs")
      .insert({
        company_id: data.companyId,
        created_by: context.userId,
        source: data.source,
        total: data.rows.length,
        payload: { rows: data.rows },
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Fire-and-forget worker kick — do not block UI; cron also retries
    const baseUrl =
      process.env.PUBLIC_APP_URL ||
      process.env.VITE_PUBLIC_APP_URL ||
      `https://project--${process.env.SUPABASE_PROJECT_ID ?? ""}.lovable.app`;
    try {
      await fetch(`${baseUrl}/api/public/hooks/process-import-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: row.id }),
      }).catch(() => undefined);
    } catch {
      /* ignored — cron picks it up */
    }

    return { jobId: row.id as string };
  });

export const getImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ jobId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("import_jobs")
      .select(
        "id, status, total, processed, inserted, duplicates, attempts, max_attempts, error, created_at, updated_at",
      )
      .eq("id", data.jobId)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listRecentImportJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companyId: z.string().uuid(), limit: z.number().int().min(1).max(20).default(5) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("import_jobs")
      .select("id, status, total, processed, inserted, duplicates, error, created_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

interface PayloadRow {
  date: string;
  description: string;
  amountCents: number;
  kind: "revenue" | "expense";
  categoryName?: string | null;
  erpCode?: string | null;
  docNumber?: string | null;
}

interface ExistingTx {
  id: string;
  date: string;
  amount_cents: number;
  fingerprint: string | null;
  category_id: string | null;
  category: { id: string; name: string } | null;
}

interface DuplicateImportGroup {
  date: string;
  description: string;
  amountCents: number;
  erpCode: string | null;
  docNumber: string | null;
  occurrences: number;
  duplicateRows: number;
  duplicateAmountCents: number;
}

export const diagnoseImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ jobId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: job, error } = await context.supabase
      .from("import_jobs")
      .select("id, company_id, payload")
      .eq("id", data.jobId)
      .single();
    if (error) throw new Error(error.message);

    const payload = (job.payload ?? {}) as { rows?: PayloadRow[] };
    const rows = payload.rows ?? [];
    if (!rows.length) {
      return {
        byCategory: [],
        divergent: [],
        totalImportCents: 0,
        netImportCents: 0,
        duplicateImportRows: 0,
        duplicateImportCents: 0,
        duplicateImportGroups: [],
        matchedCount: 0,
      };
    }

    const fps = rows.map((r) => ({ r, fp: fingerprintFor(job.company_id, r) }));
    const fpToIntended = new Map<string, PayloadRow>();
    fps.forEach(({ r, fp }) => fpToIntended.set(fp, r));

    const duplicateMap = new Map<string, DuplicateImportGroup>();
    for (const { r, fp } of fps) {
      const duplicate = duplicateMap.get(fp);
      if (!duplicate) {
        duplicateMap.set(fp, {
          date: r.date,
          description: r.description,
          amountCents: r.amountCents,
          erpCode: r.erpCode ?? null,
          docNumber: r.docNumber ?? null,
          occurrences: 1,
          duplicateRows: 0,
          duplicateAmountCents: 0,
        });
        continue;
      }
      duplicate.occurrences += 1;
      duplicate.duplicateRows += 1;
      duplicate.duplicateAmountCents += r.amountCents;
    }

    const duplicateImportGroups = [...duplicateMap.values()]
      .filter((g) => g.duplicateRows > 0)
      .sort((a, b) => b.duplicateAmountCents - a.duplicateAmountCents);
    const duplicateImportRows = duplicateImportGroups.reduce((acc, g) => acc + g.duplicateRows, 0);
    const duplicateImportCents = duplicateImportGroups.reduce(
      (acc, g) => acc + g.duplicateAmountCents,
      0,
    );

    const allFps = [...new Set(fps.map((x) => x.fp))];

    // Pagination with IN() — chunk fingerprints to avoid URL limits
    const CHUNK = 200;
    const existing: ExistingTx[] = [];
    for (let i = 0; i < allFps.length; i += CHUNK) {
      const slice = allFps.slice(i, i + CHUNK);
      const rows = await fetchAllRows<ExistingTx>((from, to) =>
        context.supabase
          .from("transactions")
          .select(
            "id, date, amount_cents, fingerprint, category_id, category:categories(id, name)",
          )
          .eq("company_id", job.company_id)
          .is("deleted_at", null)
          .in("fingerprint", slice)
          .range(from, to) as unknown as PromiseLike<{
            data: ExistingTx[] | null;
            error: { message: string } | null;
          }>,
      );
      existing.push(...rows);
    }

    const byCategoryMap = new Map<
      string,
      { categoryId: string | null; categoryName: string; count: number; totalCents: number }
    >();
    const divergent: {
      transactionId: string;
      date: string;
      amountCents: number;
      currentCategoryId: string | null;
      currentCategoryName: string;
      intendedCategoryName: string | null;
    }[] = [];

    for (const tx of existing) {
      const intended = fpToIntended.get(tx.fingerprint ?? "");
      const curName = tx.category?.name ?? "— Sem categoria —";
      const curKey = tx.category_id ?? "__none";
      const bucket = byCategoryMap.get(curKey) ?? {
        categoryId: tx.category_id,
        categoryName: curName,
        count: 0,
        totalCents: 0,
      };
      bucket.count += 1;
      bucket.totalCents += tx.amount_cents;
      byCategoryMap.set(curKey, bucket);

      if (intended?.categoryName && normalizeText(intended.categoryName) !== normalizeText(curName)) {
        divergent.push({
          transactionId: tx.id,
          date: tx.date,
          amountCents: tx.amount_cents,
          currentCategoryId: tx.category_id,
          currentCategoryName: curName,
          intendedCategoryName: intended.categoryName,
        });
      }
    }

    const totalImportCents = rows.reduce((a, r) => a + r.amountCents, 0);
    const netImportCents = totalImportCents - duplicateImportCents;

    return {
      byCategory: [...byCategoryMap.values()].sort((a, b) => b.totalCents - a.totalCents),
      divergent,
      totalImportCents,
      netImportCents,
      duplicateImportRows,
      duplicateImportCents,
      duplicateImportGroups: duplicateImportGroups.slice(0, 20),
      matchedCount: existing.length,
      importedCount: rows.length,
    };
  });

export const recategorizeTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        transactionIds: z.array(z.string().uuid()).min(1).max(2000),
        categoryId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: updated, error } = await context.supabase
      .from("transactions")
      .update({ category_id: data.categoryId })
      .eq("company_id", data.companyId)
      .in("id", data.transactionIds)
      .select("id");
    if (error) throw new Error(error.message);
    return { updated: updated?.length ?? 0 };
  });
