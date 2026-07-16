import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";
import type { DreLine } from "./dre-engine/dre-engine.types";

export const DRE_LINE_LABELS: Record<DreLine, string> = {
  receita_bruta: "Receita Bruta",
  deducoes: "Deduções sobre Vendas",
  receita_liquida: "Receita Líquida",
  cmv: "CMV",
  lucro_bruto: "Lucro Bruto",
  despesa_comercial: "Despesas Comerciais",
  despesa_administrativa: "Despesas Administrativas",
  despesa_operacional: "Outras Despesas Operacionais",
  ebitda: "EBITDA",
  depreciacao: "Depreciação & Amortização",
  ebit: "EBIT",
  resultado_financeiro: "Resultado Financeiro",
  lair: "LAIR",
  ir_csll: "IRPJ + CSLL",
  lucro_liquido: "Lucro Líquido",
};

export const STORED_DRE_LINES = [
  "receita_bruta",
  "deducoes",
  "cmv",
  "despesa_comercial",
  "despesa_administrativa",
  "despesa_operacional",
  "depreciacao",
  "resultado_financeiro",
  "ir_csll",
] as const satisfies readonly DreLine[];

export type StoredDreLine = (typeof STORED_DRE_LINES)[number];

const Input = z.object({
  companyId: z.string().uuid(),
  line: z.enum(STORED_DRE_LINES),
  year: z.number().int(),
});

export interface DreLineTx {
  id: string;
  competencia: string;
  date: string;
  description: string | null;
  amount_cents: number;
  kind: "revenue" | "expense";
  category_id: string | null;
  category_name: string | null;
  party_name: string | null;
}

export interface DreLineCategoryTotal {
  categoryId: string;
  categoryName: string;
  total: number;
  count: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PaginatedQuery<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export const getDreLineBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const start = `${data.year}-01-01`;
    const end = `${data.year + 1}-01-01`;

    type Row = {
      id: string;
      competencia: string;
      date: string;
      description: string | null;
      amount_cents: number;
      kind: "revenue" | "expense";
      category_id: string | null;
      category: { name: string; dre_line: string | null; is_balance_sheet: boolean } | null;
      party: { name: string | null } | null;
    };

    const rows = await fetchAllRows<Row>((from, to) =>
      supabase
        .from("transactions")
        .select(
          "id, competencia, date, description, amount_cents, kind, category_id, category:categories!inner(name, dre_line, is_balance_sheet), party:parties(name)",
        )
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .eq("categories.is_balance_sheet", false)
        .eq("categories.dre_line", data.line)
        .gte("competencia", start)
        .lt("competencia", end)
        .order("competencia", { ascending: false })
        .range(from, to) as PaginatedQuery<Row>,
    );

    const totalsMap = new Map<string, DreLineCategoryTotal>();
    const txs: DreLineTx[] = [];
    for (const r of rows) {
      txs.push({
        id: r.id,
        competencia: r.competencia,
        date: r.date,
        description: r.description,
        amount_cents: r.amount_cents,
        kind: r.kind,
        category_id: r.category_id,
        category_name: r.category?.name ?? null,
        party_name: r.party?.name ?? null,
      });
      if (r.category_id && r.category) {
        const cur = totalsMap.get(r.category_id) ?? {
          categoryId: r.category_id,
          categoryName: r.category.name,
          total: 0,
          count: 0,
        };
        cur.total += r.amount_cents;
        cur.count += 1;
        totalsMap.set(r.category_id, cur);
      }
    }

    const totals = Array.from(totalsMap.values()).sort((a, b) => b.total - a.total);
    const grandTotal = totals.reduce((s, t) => s + t.total, 0);

    return { line: data.line, year: data.year, totals, transactions: txs, grandTotal };
  });
