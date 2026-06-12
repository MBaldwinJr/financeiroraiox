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
