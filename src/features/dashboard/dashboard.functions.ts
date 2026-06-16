import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";

const Schema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
  basis: z.enum(["accrual", "cash", "erp_sales"]).optional(),
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
    const rows = await fetchAllRows<TxRow>((from, to) =>
      context.supabase
        .from("transactions")
        .select("date, amount_cents, kind, payment_method, category:categories(dre_group)")
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .gte("date", yearStart)
        .lt("date", yearEnd)
        .range(from, to) as unknown as PromiseLike<{ data: TxRow[] | null; error: { message: string } | null }>,
    );

    // Also pull prior year for YoY comparison
    const prevRows = await fetchAllRows<{ date: string; amount_cents: number; kind: "revenue" | "expense" }>(
      (from, to) =>
        context.supabase
          .from("transactions")
          .select("date, amount_cents, kind")
          .eq("company_id", data.companyId)
          .is("deleted_at", null)
          .gte("date", `${data.year - 1}-01-01`)
          .lt("date", yearStart)
          .range(from, to) as unknown as PromiseLike<{ data: { date: string; amount_cents: number; kind: "revenue" | "expense" }[] | null; error: { message: string } | null }>,
    );

    const txs = rows;

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

    // Override revenue series by basis (DRE/Dashboard toggle)
    const basis = data.basis ?? "accrual";
    if (basis === "cash") {
      const paidRows = await fetchAllRows<{ paid_at: string; amount_cents: number }>(
        (from, to) =>
          context.supabase
            .from("transactions")
            .select("paid_at, amount_cents")
            .eq("company_id", data.companyId)
            .eq("kind", "revenue")
            .eq("status", "paid")
            .is("deleted_at", null)
            .gte("paid_at", yearStart)
            .lt("paid_at", yearEnd)
            .range(from, to) as unknown as PromiseLike<{
            data: { paid_at: string; amount_cents: number }[] | null;
            error: { message: string } | null;
          }>,
      );
      for (const b of monthly) b.revenue = 0;
      for (const r of paidRows) {
        if (!r.paid_at) continue;
        const m = Number(r.paid_at.slice(5, 7)) - 1;
        monthly[m].revenue += r.amount_cents;
      }
    } else if (basis === "erp_sales") {
      const salesRows = await fetchAllRows<{
        period_start: string;
        net_amount_cents: number;
        returns_cents: number;
      }>((from, to) =>
        context.supabase
          .from("sales")
          .select("period_start, net_amount_cents, returns_cents")
          .eq("company_id", data.companyId)
          .is("deleted_at", null)
          .gte("period_start", yearStart)
          .lt("period_start", yearEnd)
          .range(from, to) as unknown as PromiseLike<{
          data: { period_start: string; net_amount_cents: number; returns_cents: number }[] | null;
          error: { message: string } | null;
        }>,
      );
      for (const b of monthly) b.revenue = 0;
      for (const r of salesRows) {
        const m = Number(r.period_start.slice(5, 7)) - 1;
        monthly[m].revenue += r.net_amount_cents - r.returns_cents;
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
