import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("company_members")
      .select("role, companies(id, name, created_at)")
      .order("created_at", { foreignTable: "companies", ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((r) => r.companies)
      .map((r) => ({
        id: r.companies!.id,
        name: r.companies!.name,
        role: r.role,
        created_at: r.companies!.created_at,
      }));
  });

const CreateCompanySchema = z.object({ name: z.string().min(1).max(120) });

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateCompanySchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: company, error } = await context.supabase
      .from("companies")
      .insert({ name: data.name, owner_id: context.userId })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    return company;
  });
