import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CompanyIdSchema = z.object({ companyId: z.string().uuid() });

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyIdSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("categories")
      .select("id, name, kind, dre_group, parent_id")
      .eq("company_id", data.companyId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listCostCenters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyIdSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertMember(context.supabase, data.companyId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("cost_centers")
      .select("id, name, color")
      .eq("company_id", data.companyId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyIdSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertMember(context.supabase, data.companyId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("bank_accounts")
      .select("id, name, type, initial_balance_cents, color")
      .eq("company_id", data.companyId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listParties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyIdSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertMember(context.supabase, data.companyId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("parties")
      .select("id, name, kind, document")
      .eq("company_id", data.companyId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// --- mutations ---
const NameSchema = z.object({ companyId: z.string().uuid(), name: z.string().min(1).max(120) });

export const createCostCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => NameSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("cost_centers")
      .insert({ company_id: data.companyId, name: data.name });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BankAccountInput = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(120),
  type: z.string().min(1).max(40).default("bank"),
  initialBalance: z.number().int(),
});
export const createBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BankAccountInput.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("bank_accounts").insert({
      company_id: data.companyId,
      name: data.name,
      type: data.type,
      initial_balance_cents: data.initialBalance,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PartyInput = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(160),
  kind: z.enum(["client", "supplier", "both"]),
  document: z.string().max(40).optional().nullable(),
});
export const createParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PartyInput.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("parties").insert({
      company_id: data.companyId,
      name: data.name,
      kind: data.kind,
      document: data.document ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CategoryInput = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(120),
  kind: z.enum(["revenue", "expense"]),
  dreGroup: z.enum([
    "revenue",
    "cmv",
    "supplier",
    "freight",
    "fixed",
    "variable",
    "operational",
    "other",
  ]),
});
export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CategoryInput.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("categories").insert({
      company_id: data.companyId,
      name: data.name,
      kind: data.kind,
      dre_group: data.dreGroup,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
