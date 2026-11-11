import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { assessSalesImport, assessSalesReimport } from "./sales-import-integrity.domain";
import { requireAuditMutationRole } from "@/features/dre/dre-audit-permissions.domain";
import {
  assertSalesReplacementInStaging,
  canRunSalesReplacementInStaging,
  isSalesMonthDatabaseVersion,
} from "./sales-replacement-activation.domain";
import {
  createSalesReplacementPreview,
  type ExistingSaleForReplacement,
} from "./sales-replacement-preview.domain";

const ListSchema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
});

const RowSchema = z.object({
  sellerCode: z.string().nullable(),
  sellerName: z.string().min(1),
  netAmountCents: z.number().int(),
  returnsCents: z.number().int(),
  costCents: z.number().int(),
  itemsQty: z.number().int(),
  salesQty: z.number().int(),
});

const ImportSchema = z.object({
  companyId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceFile: z.string().nullable().optional(),
  rows: z.array(RowSchema).min(1),
});

const AtomicCommitSchema = ImportSchema.extend({
  expectedDatabaseVersion: z.string().regex(/^[a-f0-9]{32}$/),
  previewToken: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().uuid(),
});

type AtomicRpcResult = {
  revisionId: string;
  version: string;
  saved: number;
  replayed: boolean;
};
const RpcResultSchema = z.object({
  revisionId: z.string().uuid(),
  version: z.string().regex(/^[a-f0-9]{32}$/),
  saved: z.number().int().min(0),
  replayed: z.boolean(),
});

// Generated Database types are not updated until the staging RPC is migrated.
// Cast is intentionally isolated to this server-only RPC adapter.
function atomicRpc(client: unknown) {
  return client as {
    rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
}

const isAtomicStaging = () => canRunSalesReplacementInStaging(
  process.env.SALES_ATOMIC_REPLACEMENT_ENABLED,
  process.env.SALES_REPLACEMENT_ENV,
);

const DeleteSchema = z.object({
  companyId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface SaleRow {
  readonly id: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly seller_code: string | null;
  readonly seller_name: string;
  readonly net_amount_cents: number;
  readonly returns_cents: number;
  readonly cost_cents: number;
  readonly items_qty: number;
  readonly sales_qty: number;
  readonly source_file: string | null;
}

export const listSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ context, data }) => {
    const yearStart = `${data.year}-01-01`;
    const yearEnd = `${data.year + 1}-01-01`;
    const rows = await fetchAllRows<SaleRow>((from, to) =>
      context.supabase
        .from("sales")
        .select(
          "id, period_start, period_end, seller_code, seller_name, net_amount_cents, returns_cents, cost_cents, items_qty, sales_qty, source_file",
        )
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .gte("period_start", yearStart)
        .lt("period_start", yearEnd)
        .order("period_start", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: SaleRow[] | null;
        error: { message: string } | null;
      }>,
    );

    const monthly = new Array<number>(12).fill(0);
    for (const r of rows) {
      const m = Number(r.period_start.slice(5, 7)) - 1;
      monthly[m] += r.net_amount_cents - r.returns_cents;
    }

    const filtered =
      data.month != null
        ? rows.filter((r) => Number(r.period_start.slice(5, 7)) === data.month)
        : rows;

    return { rows: filtered, monthly };
  });

interface ExistingSaleIdentity {
  seller_name: string;
  period_end: string;
}

/**
 * Checks existing active seller rows for an EXACT period_start in this company,
 * preserving RLS. No external names are returned by preflight.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchExistingSaleIdentities(supabase: any, companyId: string, periodStart: string) {
  const rows = await fetchAllRows<ExistingSaleIdentity>((from, to) =>
    supabase
      .from("sales")
      .select("seller_name, period_end")
      .eq("company_id", companyId)
      .eq("period_start", periodStart)
      .is("deleted_at", null)
      .order("seller_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to) as PromiseLike<{
        data: ExistingSaleIdentity[] | null;
        error: { message: string } | null;
      }>,
  );
  return rows.map((row) => ({ sellerName: row.seller_name, periodEnd: row.period_end }));
}

export const inspectSalesImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportSchema.parse(input))
  .handler(async ({ context, data }) => {
    const integrity = assessSalesImport(data.periodStart, data.periodEnd, data.rows);
    const existing = await fetchExistingSaleIdentities(
      context.supabase, data.companyId, data.periodStart,
    );
    const match = assessSalesReimport(existing, data.rows, data.periodEnd);
    return {
      ...match,
      validationErrors: integrity.errors,
      validationWarnings: integrity.warnings,
      // The normal import path is insert-only. An existing month must use a
      // separate atomic replacement workflow, never silent upsert.
      blocked: existing.length > 0 || match.blocked || integrity.errors.length > 0,
    };
  });

/**
 * Read-only proposal. Only company owners/admins may receive the original
 * report as a local backup. No deletion, upsert or RPC is performed.
 */
async function getOriginalSalesForReplacement(
  supabase: { from: (table: "sales") => any },
  companyId: string,
  periodStart: string,
): Promise<ExistingSaleForReplacement[]> {
  return fetchAllRows<ExistingSaleForReplacement>((from, to) =>
    supabase
      .from("sales")
      .select(
        "id, seller_name, seller_code, period_end, net_amount_cents, returns_cents, cost_cents, items_qty, sales_qty, source_file, imported_at, updated_at",
      )
      .eq("company_id", companyId)
      .eq("period_start", periodStart)
      .is("deleted_at", null)
      .order("seller_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to) as PromiseLike<{
        data: ExistingSaleForReplacement[] | null;
        error: { message: string } | null;
      }>,
  );
}

export const previewSalesReplacement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireAuditMutationRole(context.supabase, data.companyId, context.userId);

    const existing = await getOriginalSalesForReplacement(
      context.supabase, data.companyId, data.periodStart,
    );

    const preview = createSalesReplacementPreview(
      data.companyId,
      data.periodStart,
      data.periodEnd,
      existing,
      data.rows,
    );
    let databaseVersion: string | null = null;
    if (isAtomicStaging()) {
      const { data: version, error } = await atomicRpc(context.supabase).rpc(
        "sales_month_version",
        { p_company_id: data.companyId, p_period_start: data.periodStart },
      );
      if (error) throw new Error("RPC de homologação indisponível: " + error.message);
      if (!isSalesMonthDatabaseVersion(version)) {
        throw new Error("Versão de competência inválida retornada pelo banco.");
      }
      databaseVersion = version;
    }

    return {
      ...preview,
      databaseVersion,
      replacementEnabled: databaseVersion !== null && isAtomicStaging(),
      // Original rows are visible only to owner/admin via this authenticated endpoint.
      originalRows: existing,
    };
  });

/**
 * Invoked only if a SEPARATE homologation deployment explicitly enables
 * the flag and its database has the audited atomic RPC. Production remains off.
 */
export const commitSalesReplacement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AtomicCommitSchema.parse(input))
  .handler(async ({ context, data }): Promise<AtomicRpcResult> => {
    assertSalesReplacementInStaging(
      process.env.SALES_ATOMIC_REPLACEMENT_ENABLED,
      process.env.SALES_REPLACEMENT_ENV,
    );
    await requireAuditMutationRole(context.supabase, data.companyId, context.userId);

    // Second check of the full preview. The Postgres function checks a
    // distinct DB row version AGAIN, under its transaction lock.
    const existing = await getOriginalSalesForReplacement(
      context.supabase, data.companyId, data.periodStart,
    );
    const latest = createSalesReplacementPreview(
      data.companyId, data.periodStart, data.periodEnd, existing, data.rows,
    );
    if (latest.snapshotToken !== data.previewToken) {
      throw new Error("O relatório mudou depois da comparação. Recalcule a prévia.");
    }

    const { data: result, error } = await atomicRpc(context.supabase).rpc(
      "sales_month_commit",
      {
        p_company_id: data.companyId,
        p_period_start: data.periodStart,
        p_period_end: data.periodEnd,
        p_expected_version: data.expectedDatabaseVersion,
        p_request_id: data.requestId,
        p_rows: data.rows,
        p_source_file: data.sourceFile ?? null,
      },
    );
    if (error) throw new Error("Falha na substituição transacional: " + error.message);
    return RpcResultSchema.parse(result);
  });

export const importSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportSchema.parse(input))
  .handler(async ({ context, data }) => {
    const integrity = assessSalesImport(data.periodStart, data.periodEnd, data.rows);
    if (integrity.errors.length) {
      throw new Error(integrity.errors.join(" "));
    }

    const existing = await fetchExistingSaleIdentities(
      context.supabase, data.companyId, data.periodStart,
    );
    const match = assessSalesReimport(existing, data.rows, data.periodEnd);
    if (existing.length > 0 || match.blocked) {
      throw new Error(
        "Este mês já possui dados de vendas. A importação normal não pode substituir " +
        "registros existentes; use a prévia de substituição e aguarde a operação transacional.",
      );
    }

    if (isAtomicStaging()) {
      // After the staging migration revokes direct DML on sales, even an
      // initial month must be created by the same transactional RPC.
      await requireAuditMutationRole(context.supabase, data.companyId, context.userId);
      const { data: version, error: versionError } = await atomicRpc(context.supabase).rpc(
        "sales_month_version",
        { p_company_id: data.companyId, p_period_start: data.periodStart },
      );
      if (versionError || !isSalesMonthDatabaseVersion(version)) {
        throw new Error("Não foi possível validar a versão inicial do mês em homologação.");
      }
      const { data: committed, error: commitError } = await atomicRpc(context.supabase).rpc(
        "sales_month_commit",
        {
          p_company_id: data.companyId,
          p_period_start: data.periodStart,
          p_period_end: data.periodEnd,
          p_expected_version: version,
          p_request_id: crypto.randomUUID(),
          p_rows: data.rows,
          p_source_file: data.sourceFile ?? null,
        },
      );
      if (commitError) throw new Error(commitError.message);
      return { saved: RpcResultSchema.parse(committed).saved };
    }

    const payload = data.rows.map((r) => ({
      company_id: data.companyId,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      seller_code: r.sellerCode,
      seller_name: r.sellerName,
      net_amount_cents: r.netAmountCents,
      returns_cents: r.returnsCents,
      cost_cents: r.costCents,
      items_qty: r.itemsQty,
      sales_qty: r.salesQty,
      source_file: data.sourceFile ?? null,
      imported_at: new Date().toISOString(),
      deleted_at: null,
    }));

    const { data: inserted, error } = await context.supabase
      .from("sales")
      .upsert(payload, { onConflict: "company_id,period_start,seller_name" })
      .select("id");

    if (error) throw new Error(error.message);
    return { saved: inserted?.length ?? 0 };
  });

export const deleteSalesPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireAuditMutationRole(context.supabase, data.companyId, context.userId);
    if (isAtomicStaging()) {
      throw new Error("Exclusão direta de mês desativada em homologação. Utilize a recuperação auditada.");
    }
    const { error } = await context.supabase
      .from("sales")
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", data.companyId)
      .eq("period_start", data.periodStart)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
