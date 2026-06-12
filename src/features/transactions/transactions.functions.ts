import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";


const PAYMENT_METHODS = ["cash", "pix", "boleto", "cheque", "card"] as const;
const KINDS = ["revenue", "expense"] as const;
const STATUSES = ["pending", "paid"] as const;

const TransactionInput = z.object({
  id: z.string().uuid().optional(),
  companyId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(280),
  amountCents: z.number().int().min(0),
  kind: z.enum(KINDS),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  partyId: z.string().uuid().nullable().optional(),
  status: z.enum(STATUSES).default("paid"),
  notes: z.string().max(1000).nullable().optional(),
});

const FilterSchema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
  search: z.string().max(200).optional(),
  kind: z.enum(KINDS).nullable().optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  costCenterIds: z.array(z.string().uuid()).optional(),
  bankAccountIds: z.array(z.string().uuid()).optional(),
  partyIds: z.array(z.string().uuid()).optional(),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

function rangeForFilters(year: number, month: number | null | undefined) {
  if (month) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }
  return {
    start: `${year}-01-01`,
    end: `${year + 1}-01-01`,
  };
}

export const listTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FilterSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { start, end } = rangeForFilters(data.year, data.month);
    let q = context.supabase
      .from("transactions")
      .select(
        "id, date, description, amount_cents, kind, payment_method, status, notes, category_id, cost_center_id, bank_account_id, party_id, categories(name), cost_centers(name), bank_accounts(name), parties(name)",
        { count: "exact" },
      )
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.search) q = q.ilike("description", `%${data.search}%`);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.categoryIds?.length) q = q.in("category_id", data.categoryIds);
    if (data.costCenterIds?.length) q = q.in("cost_center_id", data.costCenterIds);
    if (data.bankAccountIds?.length) q = q.in("bank_account_id", data.bankAccountIds);
    if (data.partyIds?.length) q = q.in("party_id", data.partyIds);
    if (data.paymentMethods?.length) q = q.in("payment_method", data.paymentMethods);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

// Returns ALL matching rows (paginated server-side). Use for totals/exports.
const AllFilterSchema = FilterSchema.omit({ limit: true, offset: true });
type AllTxRow = {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  kind: "revenue" | "expense";
  payment_method: string | null;
  status: string;
  notes: string | null;
  category_id: string | null;
  cost_center_id: string | null;
  bank_account_id: string | null;
  party_id: string | null;
  categories: { name: string } | null;
  cost_centers: { name: string } | null;
  bank_accounts: { name: string } | null;
  parties: { name: string } | null;
};

export const listAllTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AllFilterSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { start, end } = rangeForFilters(data.year, data.month);
    const rows = await fetchAllRows<AllTxRow>((from, to) => {
      let q = context.supabase
        .from("transactions")
        .select(
          "id, date, description, amount_cents, kind, payment_method, status, notes, category_id, cost_center_id, bank_account_id, party_id, categories(name), cost_centers(name), bank_accounts(name), parties(name)",
        )
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .gte("date", start)
        .lt("date", end)
        .order("date", { ascending: false })
        .range(from, to);
      if (data.search) q = q.ilike("description", `%${data.search}%`);
      if (data.kind) q = q.eq("kind", data.kind);
      if (data.categoryIds?.length) q = q.in("category_id", data.categoryIds);
      if (data.costCenterIds?.length) q = q.in("cost_center_id", data.costCenterIds);
      if (data.bankAccountIds?.length) q = q.in("bank_account_id", data.bankAccountIds);
      if (data.partyIds?.length) q = q.in("party_id", data.partyIds);
      if (data.paymentMethods?.length) q = q.in("payment_method", data.paymentMethods);
      return q as unknown as PromiseLike<{ data: AllTxRow[] | null; error: { message: string } | null }>;
    });
    return { rows, total: rows.length };
  });


export const upsertTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TransactionInput.parse(input))
  .handler(async ({ context, data }) => {
    const payload = {
      company_id: data.companyId,
      date: data.date,
      description: data.description,
      amount_cents: data.amountCents,
      kind: data.kind,
      payment_method: data.paymentMethod ?? null,
      category_id: data.categoryId ?? null,
      cost_center_id: data.costCenterId ?? null,
      bank_account_id: data.bankAccountId ?? null,
      party_id: data.partyId ?? null,
      status: data.status,
      notes: data.notes ?? null,
      paid_at: data.status === "paid" ? data.date : null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("transactions")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    } else {
      const { data: row, error } = await context.supabase
        .from("transactions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id };
    }
  });

const IdSchema = z.object({ id: z.string().uuid() });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleTransactionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(STATUSES) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("transactions")
      .update({
        status: data.status,
        paid_at: data.status === "paid" ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- BULK IMPORT ---
const ImportInput = z.object({
  companyId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().min(1).max(280),
        amountCents: z.number().int().min(0),
        kind: z.enum(KINDS),
        paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
        categoryName: z.string().optional().nullable(),
        costCenterName: z.string().optional().nullable(),
        bankAccountName: z.string().optional().nullable(),
        partyName: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }),
    )
    .min(1)
    .max(20000),
});

export const importTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportInput.parse(input))
  .handler(async ({ context, data }) => {
    // Build name maps
    const [{ data: cats }, { data: ccs }, { data: bas }, { data: parties }] = await Promise.all([
      context.supabase
        .from("categories")
        .select("id, name, kind")
        .eq("company_id", data.companyId),
      context.supabase.from("cost_centers").select("id, name").eq("company_id", data.companyId),
      context.supabase.from("bank_accounts").select("id, name").eq("company_id", data.companyId),
      context.supabase.from("parties").select("id, name").eq("company_id", data.companyId),
    ]);
    const map = <T extends { id: string; name: string }>(arr: T[] | null) =>
      new Map((arr ?? []).map((r) => [r.name.toLowerCase(), r.id]));
    const catMap = map(cats);
    const ccMap = map(ccs);
    const baMap = map(bas);
    const partyMap = map(parties);

    const payload = data.rows.map((r) => ({
      company_id: data.companyId,
      date: r.date,
      description: r.description,
      amount_cents: r.amountCents,
      kind: r.kind,
      payment_method: r.paymentMethod ?? null,
      category_id: r.categoryName ? (catMap.get(r.categoryName.toLowerCase()) ?? null) : null,
      cost_center_id: r.costCenterName
        ? (ccMap.get(r.costCenterName.toLowerCase()) ?? null)
        : null,
      bank_account_id: r.bankAccountName
        ? (baMap.get(r.bankAccountName.toLowerCase()) ?? null)
        : null,
      party_id: r.partyName ? (partyMap.get(r.partyName.toLowerCase()) ?? null) : null,
      status: "paid" as const,
      paid_at: r.date,
      notes: r.notes ?? null,
      created_by: context.userId,
    }));

    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const { error } = await context.supabase
        .from("transactions")
        .insert(payload.slice(i, i + CHUNK));
      if (error) throw new Error(error.message);
    }
    return { inserted: payload.length };
  });
