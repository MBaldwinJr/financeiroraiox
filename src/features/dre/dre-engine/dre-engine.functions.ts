import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aggregateByDreLine, buildDreMatrix } from "./dre-engine.domain";
import { fetchDreRows } from "./dre-engine.repository";

const Schema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
});

export const getDreMatrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Schema.parse(i))
  .handler(async ({ context, data }) => {
    const start = `${data.year}-01-01`;
    const end = `${data.year + 1}-01-01`;
    const rows = await fetchDreRows(context.supabase, {
      companyId: data.companyId,
      start,
      end,
    });
    const stored = aggregateByDreLine(rows);
    return buildDreMatrix(stored);
  });
