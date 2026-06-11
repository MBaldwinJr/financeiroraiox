import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Schema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
});

type DreGroup =
  | "revenue"
  | "cmv"
  | "supplier"
  | "freight"
  | "fixed"
  | "variable"
  | "operational"
  | "other";

interface TxRow {
  date: string;
  amount_cents: number;
  kind: "revenue" | "expense";
  payment_method: string | null;
  category: { dre_group: DreGroup } | null;
}

export const getFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ context, data }) => {
    const yearStart = `${data.year}-01-01`;
    const yearEnd = `${data.year + 1}-01-01`;
    // Pull the whole year for time series; compute current month aggregations client-side here.
    const { data: rows, error } = await context.supabase
      .from("transactions")
      .select("date, amount_cents, kind, payment_method, category:categories(dre_group)")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .gte("date", yearStart)
      .lt("date", yearEnd);
    if (error) throw new Error(error.message);

    // Also pull prior year for YoY comparison
    const { data: prevRows, error: prevErr } = await context.supabase
      .from("transactions")
      .select("date, amount_cents, kind")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .gte("date", `${data.year - 1}-01-01`)
      .lt("date", yearStart);
    if (prevErr) throw new Error(prevErr.message);

    const txs = (rows ?? []) as unknown as TxRow[];

    // Monthly buckets (12 months)
    const monthly = Array.from({ length: 12 }, () => ({
      revenue: 0,
      expense: 0,
      cmv: 0,
      supplier: 0,
      freight: 0,
      fixed: 0,
      variable: 0,
      operational: 0,
      other: 0,
    }));
    const byPayment: Record<string, number> = {
      cash: 0,
      pix: 0,
      boleto: 0,
      cheque: 0,
      card: 0,
    };

    for (const tx of txs) {
      const m = Number(tx.date.slice(5, 7)) - 1;
      const b = monthly[m];
      if (tx.kind === "revenue") {
        b.revenue += tx.amount_cents;
        if (tx.payment_method && tx.payment_method in byPayment) {
          byPayment[tx.payment_method] += tx.amount_cents;
        }
      } else {
        b.expense += tx.amount_cents;
        const g = tx.category?.dre_group ?? "other";
        if (g in b) (b as Record<string, number>)[g] += tx.amount_cents;
      }
    }

    const prevYearTotal = (prevRows ?? []).reduce(
      (acc, r) => {
        if (r.kind === "revenue") acc.revenue += r.amount_cents;
        else acc.expense += r.amount_cents;
        return acc;
      },
      { revenue: 0, expense: 0 },
    );

    // Previous-year monthly for YoY chart
    const prevMonthly = Array.from({ length: 12 }, () => ({ revenue: 0, expense: 0 }));
    for (const r of prevRows ?? []) {
      const m = Number(r.date.slice(5, 7)) - 1;
      if (r.kind === "revenue") prevMonthly[m].revenue += r.amount_cents;
      else prevMonthly[m].expense += r.amount_cents;
    }

    // Selected month or full year aggregation
    const selMonths = data.month ? [data.month - 1] : monthly.map((_, i) => i);
    const sum = (key: keyof (typeof monthly)[number]) =>
      selMonths.reduce((a, i) => a + monthly[i][key], 0);

    const grossRevenue = sum("revenue");
    const cmv = sum("cmv");
    const grossProfit = grossRevenue - cmv;
    const totalExpenses = sum("expense");
    const operatingResult =
      grossRevenue - cmv - sum("supplier") - sum("freight") - sum("fixed") - sum("variable") - sum("operational");
    const netProfit = grossRevenue - totalExpenses;
    const margin = grossRevenue > 0 ? netProfit / grossRevenue : 0;

    // Previous-month variations (only if a specific month is selected)
    let prev: { revenue: number; expense: number; netProfit: number } | null = null;
    if (data.month) {
      const idx = data.month - 1;
      if (idx > 0) {
        const p = monthly[idx - 1];
        prev = {
          revenue: p.revenue,
          expense: p.expense,
          netProfit: p.revenue - p.expense,
        };
      } else if (data.year > 2000) {
        const p = prevMonthly[11];
        prev = { revenue: p.revenue, expense: p.expense, netProfit: p.revenue - p.expense };
      }
    } else {
      prev = {
        revenue: prevYearTotal.revenue,
        expense: prevYearTotal.expense,
        netProfit: prevYearTotal.revenue - prevYearTotal.expense,
      };
    }

    return {
      kpis: {
        grossRevenue,
        cmv,
        grossProfit,
        totalRevenue: grossRevenue,
        totalExpenses,
        operatingResult,
        netProfit,
        margin,
        prev,
      },
      monthly,
      prevMonthly,
      byPayment,
      expenseComposition: {
        cmv: sum("cmv"),
        supplier: sum("supplier"),
        freight: sum("freight"),
        fixed: sum("fixed"),
        variable: sum("variable"),
        operational: sum("operational"),
        other: sum("other"),
      },
    };
  });
