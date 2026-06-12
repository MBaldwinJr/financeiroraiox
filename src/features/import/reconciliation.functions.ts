import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";

const Schema = z.object({
  companyId: z.string().uuid(),
  jobId: z.string().uuid(),
  dateToleranceDays: z.number().int().min(0).max(15).default(3),
  amountTolerancePct: z.number().min(0).max(0.5).default(0.02),
});

interface ImportRow {
  date: string;
  description: string;
  amountCents: number;
  kind: "revenue" | "expense";
  erpCode?: string | null;
  docNumber?: string | null;
}

interface ExistingTx {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  kind: "revenue" | "expense";
  fingerprint: string | null;
}

type IssueType =
  | "exact_duplicate"
  | "value_divergence"
  | "date_divergence"
  | "unmatched";

export interface ReconciliationFinding {
  type: IssueType;
  imported: ImportRow;
  matchedTransactionId: string | null;
  matchedDescription: string | null;
  matchedDate: string | null;
  matchedAmountCents: number | null;
  deltaCents: number;
  deltaDays: number;
}

export interface ReconciliationSummary {
  total: number;
  exactDuplicates: number;
  valueDivergences: number;
  dateDivergences: number;
  unmatched: number;
  findings: ReconciliationFinding[];
}

function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t.length >= 3));
}

function similarity(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / Math.max(A.size, B.size);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.abs(Math.round((da - db) / 86_400_000));
}

export const reconcileImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ context, data }): Promise<ReconciliationSummary> => {
    const { data: job, error: jobErr } = await context.supabase
      .from("import_jobs")
      .select("payload, company_id, created_at")
      .eq("id", data.jobId)
      .eq("company_id", data.companyId)
      .single();
    if (jobErr) throw new Error(jobErr.message);

    const rows = ((job?.payload as { rows?: ImportRow[] } | null)?.rows ?? []) as ImportRow[];
    if (!rows.length) {
      return {
        total: 0,
        exactDuplicates: 0,
        valueDivergences: 0,
        dateDivergences: 0,
        unmatched: 0,
        findings: [],
      };
    }

    // Date window covering the import + tolerance
    const dates = rows.map((r) => r.date).sort();
    const min = new Date(dates[0] + "T00:00:00Z");
    const max = new Date(dates[dates.length - 1] + "T00:00:00Z");
    min.setUTCDate(min.getUTCDate() - data.dateToleranceDays);
    max.setUTCDate(max.getUTCDate() + data.dateToleranceDays + 1);

    const existing = await fetchAllRows<ExistingTx>((from, to) =>
      context.supabase
        .from("transactions")
        .select("id, date, description, amount_cents, kind, fingerprint")
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .gte("date", min.toISOString().slice(0, 10))
        .lt("date", max.toISOString().slice(0, 10))
        .range(from, to) as unknown as PromiseLike<{
          data: ExistingTx[] | null;
          error: { message: string } | null;
        }>,
    );

    // Index existing rows by date for fast lookup
    const byDate = new Map<string, ExistingTx[]>();
    for (const tx of existing) {
      const list = byDate.get(tx.date) ?? [];
      list.push(tx);
      byDate.set(tx.date, list);
    }

    const findings: ReconciliationFinding[] = [];

    for (const r of rows) {
      // Candidate pool: same kind, within date tolerance
      const candidates: ExistingTx[] = [];
      const base = new Date(r.date + "T00:00:00Z");
      for (let d = -data.dateToleranceDays; d <= data.dateToleranceDays; d += 1) {
        const dt = new Date(base);
        dt.setUTCDate(dt.getUTCDate() + d);
        const key = dt.toISOString().slice(0, 10);
        const list = byDate.get(key);
        if (!list) continue;
        for (const tx of list) if (tx.kind === r.kind) candidates.push(tx);
      }

      if (!candidates.length) {
        findings.push({
          type: "unmatched",
          imported: r,
          matchedTransactionId: null,
          matchedDescription: null,
          matchedDate: null,
          matchedAmountCents: null,
          deltaCents: 0,
          deltaDays: 0,
        });
        continue;
      }

      // Score each candidate
      const tol = Math.max(1, Math.round(r.amountCents * data.amountTolerancePct));
      let best: { tx: ExistingTx; score: number; type: IssueType } | null = null;

      for (const tx of candidates) {
        const sameAmount = Math.abs(tx.amount_cents - r.amountCents) <= tol;
        const sameDate = tx.date === r.date;
        const sim = similarity(tx.description, r.description);

        let type: IssueType | null = null;
        let score = sim;

        if (sameDate && sameAmount && sim >= 0.4) {
          type = "exact_duplicate";
          score += 2;
        } else if (sameDate && sim >= 0.5) {
          type = "value_divergence";
          score += 1;
        } else if (sameAmount && sim >= 0.4) {
          type = "date_divergence";
          score += 0.5;
        }

        if (type && (!best || score > best.score)) best = { tx, score, type };
      }

      if (!best) {
        findings.push({
          type: "unmatched",
          imported: r,
          matchedTransactionId: null,
          matchedDescription: null,
          matchedDate: null,
          matchedAmountCents: null,
          deltaCents: 0,
          deltaDays: 0,
        });
      } else {
        findings.push({
          type: best.type,
          imported: r,
          matchedTransactionId: best.tx.id,
          matchedDescription: best.tx.description,
          matchedDate: best.tx.date,
          matchedAmountCents: best.tx.amount_cents,
          deltaCents: r.amountCents - best.tx.amount_cents,
          deltaDays: daysBetween(r.date, best.tx.date),
        });
      }
    }

    const summary: ReconciliationSummary = {
      total: rows.length,
      exactDuplicates: findings.filter((f) => f.type === "exact_duplicate").length,
      valueDivergences: findings.filter((f) => f.type === "value_divergence").length,
      dateDivergences: findings.filter((f) => f.type === "date_divergence").length,
      unmatched: findings.filter((f) => f.type === "unmatched").length,
      findings: findings
        .sort((a, b) => {
          const order: Record<IssueType, number> = {
            value_divergence: 0,
            date_divergence: 1,
            unmatched: 2,
            exact_duplicate: 3,
          };
          return order[a.type] - order[b.type];
        })
        .slice(0, 500),
    };
    return summary;
  });
