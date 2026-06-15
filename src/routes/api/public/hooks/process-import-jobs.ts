import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

interface ImportRow {
  date: string;
  description: string;
  amountCents: number;
  kind: "revenue" | "expense";
  categoryName?: string | null;
  partyName?: string | null;
  erpCode?: string | null;
  docNumber?: string | null;
  notes?: string | null;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fingerprintKey(companyId: string, r: ImportRow): string {
  return [
    companyId,
    r.date,
    r.kind,
    r.amountCents,
    normalize(r.description),
    r.docNumber ?? "",
    r.erpCode ?? "",
  ].join("|");
}

function fingerprintFromKey(key: string, occurrence?: number): string {
  const occurrenceAwareKey = occurrence ? `${key}|occurrence:${occurrence}` : key;
  return createHash("sha256").update(occurrenceAwareKey).digest("hex");
}

function fingerprintRows(companyId: string, rows: readonly ImportRow[]) {
  const occurrences = new Map<string, number>();
  return rows.map((r) => {
    const key = fingerprintKey(companyId, r);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return {
      r,
      occurrence,
      fp: fingerprintFromKey(key, occurrence),
      legacyFp: fingerprintFromKey(key),
    };
  });
}

const CHUNK_SIZE = 200;
const BUDGET_MS = 20_000;
const LOCK_STALE_MINUTES = 2;

async function claimJob(supabaseAdmin: ReturnType<typeof getAdmin>, jobId?: string) {
  const admin = await supabaseAdmin;
  if (jobId) {
    const { data } = await admin
      .from("import_jobs")
      .update({ status: "processing", locked_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", ["pending", "processing"])
      .select("*")
      .maybeSingle();
    return data;
  }
  // generic claim: pick oldest pending or stale processing
  const staleCutoff = new Date(Date.now() - LOCK_STALE_MINUTES * 60_000).toISOString();
  const { data: candidates } = await admin
    .from("import_jobs")
    .select("id")
    .or(`status.eq.pending,and(status.eq.processing,locked_at.lt.${staleCutoff})`)
    .order("created_at", { ascending: true })
    .limit(1);
  if (!candidates?.length) return null;
  const { data } = await admin
    .from("import_jobs")
    .update({ status: "processing", locked_at: new Date().toISOString() })
    .eq("id", candidates[0].id)
    .select("*")
    .maybeSingle();
  return data;
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function processJob(job: {
  id: string;
  company_id: string;
  created_by: string;
  total: number;
  processed: number;
  inserted: number;
  duplicates: number;
  attempts: number;
  max_attempts: number;
  payload: { rows: ImportRow[] };
}) {
  const admin = await getAdmin();
  const startedAt = Date.now();
  const rawRows = job.payload?.rows ?? [];
  const rows = fingerprintRows(job.company_id, rawRows);

  let processed = job.processed;
  let inserted = job.inserted;
  let duplicates = job.duplicates;

  // Load name maps once per run
  const [{ data: cats }, { data: parties }] = await Promise.all([
    admin.from("categories").select("id, name").eq("company_id", job.company_id),
    admin.from("parties").select("id, name").eq("company_id", job.company_id),
  ]);
  const catMap = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c.id]));
  const partyMap = new Map((parties ?? []).map((p) => [p.name.toLowerCase(), p.id]));

  try {
    while (processed < rows.length) {
      if (Date.now() - startedAt > BUDGET_MS) {
        // Yield: leave as pending so cron resumes
        await admin
          .from("import_jobs")
          .update({ status: "pending", processed, inserted, duplicates, locked_at: null })
          .eq("id", job.id);
        return { yielded: true };
      }
      const slice = rows.slice(processed, processed + CHUNK_SIZE);

      // 2. dedupe against existing DB rows
      const fps = [
        ...new Set(slice.flatMap((u) => (u.occurrence === 1 ? [u.fp, u.legacyFp] : [u.fp]))),
      ];
      const { data: existing, error: exErr } = await admin
        .from("transactions")
        .select("fingerprint")
        .eq("company_id", job.company_id)
        .is("deleted_at", null)
        .in("fingerprint", fps);
      if (exErr) throw new Error(exErr.message);
      const existingSet = new Set((existing ?? []).map((e) => e.fingerprint as string));
      const toInsert = slice.filter((u) => {
        const alreadyImported =
          existingSet.has(u.fp) || (u.occurrence === 1 && existingSet.has(u.legacyFp));
        if (alreadyImported) {
          duplicates += 1;
          return false;
        }
        return true;
      });

      if (toInsert.length) {
        const payload = toInsert.map(({ r, fp }) => ({
          company_id: job.company_id,
          date: r.date,
          description: r.description,
          amount_cents: r.amountCents,
          kind: r.kind,
          category_id: r.categoryName ? (catMap.get(r.categoryName.toLowerCase()) ?? null) : null,
          party_id: r.partyName ? (partyMap.get(r.partyName.toLowerCase()) ?? null) : null,
          status: "paid" as const,
          paid_at: r.date,
          notes: r.notes ?? null,
          fingerprint: fp,
          created_by: job.created_by,
        }));
        const { error } = await admin.from("transactions").insert(payload);
        if (error) {
          // race: unique violation on concurrent runs → count as duplicate, do not fail
          if (error.code === "23505") {
            duplicates += payload.length;
          } else {
            throw new Error(error.message);
          }
        } else {
          inserted += payload.length;
        }
      }

      processed += slice.length;
      await admin
        .from("import_jobs")
        .update({ processed, inserted, duplicates, locked_at: new Date().toISOString() })
        .eq("id", job.id);
    }

    await admin
      .from("import_jobs")
      .update({
        status: "completed",
        // Report progress against the original PDF row count so the UI shows 100%.
        processed: rawRows.length,
        inserted,
        duplicates,
        error: null,
        locked_at: null,
      })
      .eq("id", job.id);

    return { completed: true, inserted, duplicates };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;
    const failed = attempts >= job.max_attempts;
    await admin
      .from("import_jobs")
      .update({
        status: failed ? "failed" : "pending",
        attempts,
        error: message,
        processed,
        inserted,
        duplicates,
        locked_at: null,
      })
      .eq("id", job.id);
    return { failed, attempts, error: message };
  }
}

async function runOnce(jobId?: string) {
  const claimed = await claimJob(getAdmin(), jobId);
  if (!claimed) return { idle: true };
  return processJob(claimed as unknown as Parameters<typeof processJob>[0]);
}

export const Route = createFileRoute("/api/public/hooks/process-import-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let jobId: string | undefined;
        try {
          const body = (await request.json()) as { jobId?: string };
          jobId = body?.jobId;
        } catch {
          /* empty body from cron */
        }
        const result = await runOnce(jobId);
        return new Response(JSON.stringify({ ok: true, result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => {
        const result = await runOnce();
        return new Response(JSON.stringify({ ok: true, result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
