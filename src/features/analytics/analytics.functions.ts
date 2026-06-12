import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";

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

interface TxAggRow {
  date: string;
  amount_cents: number;
  kind: "revenue" | "expense";
  category: { id: string; name: string; dre_group: DreGroup } | null;
  cost_center: { id: string; name: string } | null;
  party: { id: string; name: string } | null;
}

export interface AnalyticsResult {
  topExpenses: { name: string; amount: number }[];
  topSuppliers: { name: string; amount: number }[];
  byCostCenter: { name: string; amount: number }[];
  categoryTreemap: { name: string; group: DreGroup; amount: number }[];
  heatmap: { category: string; months: number[] }[]; // 12 months in cents
  indicators: {
    bestMonth: { month: number; value: number };
    worstMonth: { month: number; value: number };
    biggestExpenseCategory: { name: string; amount: number };
    biggestSupplier: { name: string; amount: number };
    monthlyAvgRevenue: number;
    avgTicket: number;
    avgMargin: number;
    accumulatedProfit: number;
    ebitda: number;
    ebitdaPct: number;
    breakEven: number;
  };
  score: {
    total: number; // 0-100
    grade: "Excelente" | "Atenção" | "Crítico";
    components: { label: string; score: number; weight: number }[];
  };
}

export const getAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ context, data }): Promise<AnalyticsResult> => {
    const yearStart = `${data.year}-01-01`;
    const yearEnd = `${data.year + 1}-01-01`;

    const { data: rows, error } = await context.supabase
    const txs = await fetchAllRows<TxAggRow>((from, to) =>
      context.supabase
        .from("transactions")
        .select(
          "date, amount_cents, kind, category:categories(id, name, dre_group), cost_center:cost_centers(id, name), party:parties(id, name)",
        )
        .eq("company_id", data.companyId)
        .is("deleted_at", null)
        .gte("date", yearStart)
        .lt("date", yearEnd)
        .range(from, to) as unknown as PromiseLike<{ data: TxAggRow[] | null; error: { message: string } | null }>,
    );

    const inSelected = (tx: TxAggRow) =>
      !data.month || Number(tx.date.slice(5, 7)) === data.month;

    // Top expenses by category (selected period)
    const expenseByCategory = new Map<string, number>();
    const expenseBySupplier = new Map<string, number>();
    const byCostCenter = new Map<string, number>();
    const categoryAll = new Map<string, { group: DreGroup; amount: number }>();
    const heatmap = new Map<string, number[]>();

    let revenueCount = 0;
    let revenueTotal = 0;
    const monthly = Array.from({ length: 12 }, () => ({
      revenue: 0,
      expense: 0,
      fixed: 0,
      variable: 0,
      cmv: 0,
    }));

    for (const tx of txs) {
      const m = Number(tx.date.slice(5, 7)) - 1;
      const b = monthly[m];
      if (tx.kind === "revenue") {
        b.revenue += tx.amount_cents;
        revenueTotal += tx.amount_cents;
        revenueCount += 1;
      } else {
        b.expense += tx.amount_cents;
        const g = tx.category?.dre_group ?? "other";
        if (g === "fixed") b.fixed += tx.amount_cents;
        else if (g === "variable") b.variable += tx.amount_cents;
        else if (g === "cmv") b.cmv += tx.amount_cents;

        if (inSelected(tx)) {
          if (tx.category) {
            expenseByCategory.set(
              tx.category.name,
              (expenseByCategory.get(tx.category.name) ?? 0) + tx.amount_cents,
            );
          }
          if (tx.party) {
            expenseBySupplier.set(
              tx.party.name,
              (expenseBySupplier.get(tx.party.name) ?? 0) + tx.amount_cents,
            );
          }
          if (tx.cost_center) {
            byCostCenter.set(
              tx.cost_center.name,
              (byCostCenter.get(tx.cost_center.name) ?? 0) + tx.amount_cents,
            );
          }
        }

        if (tx.category) {
          const name = tx.category.name;
          const cur = categoryAll.get(name) ?? { group: g, amount: 0 };
          cur.amount += tx.amount_cents;
          categoryAll.set(name, cur);
          if (!heatmap.has(name)) heatmap.set(name, Array(12).fill(0));
          heatmap.get(name)![m] += tx.amount_cents;
        }
      }
    }

    const sortedDesc = (m: Map<string, number>, limit: number) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, amount]) => ({ name, amount }));

    const topExpenses = sortedDesc(expenseByCategory, 10);
    const topSuppliers = sortedDesc(expenseBySupplier, 10);
    const byCostCenterArr = [...byCostCenter.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));

    const categoryTreemap = [...categoryAll.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 24)
      .map(([name, { group, amount }]) => ({ name, group, amount }));

    const heatmapArr = [...heatmap.entries()]
      .sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))
      .slice(0, 14)
      .map(([category, months]) => ({ category, months }));

    // Indicators (year-based)
    const monthsProfit = monthly.map((m) => m.revenue - m.expense);
    let bestIdx = 0;
    let worstIdx = 0;
    monthsProfit.forEach((v, i) => {
      if (v > monthsProfit[bestIdx]) bestIdx = i;
      if (v < monthsProfit[worstIdx]) worstIdx = i;
    });

    const activeMonths = monthly.filter((m) => m.revenue > 0 || m.expense > 0).length || 1;
    const monthlyAvgRevenue = revenueTotal / activeMonths;
    const avgTicket = revenueCount > 0 ? revenueTotal / revenueCount : 0;
    const accumulatedProfit = monthsProfit.reduce((a, b) => a + b, 0);
    const totalExpense = monthly.reduce((a, m) => a + m.expense, 0);
    const totalFixed = monthly.reduce((a, m) => a + m.fixed, 0);
    const totalVariable = monthly.reduce((a, m) => a + m.variable, 0);
    const totalCmv = monthly.reduce((a, m) => a + m.cmv, 0);
    const ebitda = revenueTotal - totalCmv - totalVariable - totalFixed;
    const ebitdaPct = revenueTotal > 0 ? ebitda / revenueTotal : 0;
    const contributionMargin =
      revenueTotal > 0 ? (revenueTotal - totalVariable - totalCmv) / revenueTotal : 0;
    const breakEven = contributionMargin > 0 ? totalFixed / contributionMargin : 0;

    const marginByMonth = monthly.map((m) => (m.revenue > 0 ? (m.revenue - m.expense) / m.revenue : 0));
    const activeMargins = marginByMonth.filter((_, i) => monthly[i].revenue > 0);
    const avgMargin =
      activeMargins.length > 0 ? activeMargins.reduce((a, b) => a + b, 0) / activeMargins.length : 0;

    const biggestExpenseCategory = topExpenses[0] ?? { name: "—", amount: 0 };
    const biggestSupplier = topSuppliers[0] ?? { name: "—", amount: 0 };

    // Score 0-100 — weighted health metrics
    const firstHalf = monthly.slice(0, 6).reduce((a, m) => a + m.revenue, 0);
    const secondHalf = monthly.slice(6).reduce((a, m) => a + m.revenue, 0);
    const growth = firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : 0;
    const fixedShare = totalExpense > 0 ? totalFixed / totalExpense : 0;
    const cmvShare = revenueTotal > 0 ? totalCmv / revenueTotal : 0;
    const cashflowStability =
      monthsProfit.filter((v) => v >= 0).length / 12; // % of months positive

    const components = [
      {
        label: "Crescimento da receita",
        score: Math.max(0, Math.min(100, 50 + growth * 250)),
        weight: 0.2,
      },
      {
        label: "Margem líquida",
        score: Math.max(0, Math.min(100, avgMargin * 333)), // 30% margin = 100
        weight: 0.25,
      },
      {
        label: "Peso de despesas fixas",
        score: Math.max(0, Math.min(100, (1 - fixedShare) * 120)),
        weight: 0.15,
      },
      {
        label: "CMV / Receita",
        score: Math.max(0, Math.min(100, (1 - cmvShare) * 110)),
        weight: 0.15,
      },
      {
        label: "Estabilidade do caixa",
        score: cashflowStability * 100,
        weight: 0.15,
      },
      {
        label: "Lucro acumulado",
        score:
          accumulatedProfit > 0 && revenueTotal > 0
            ? Math.min(100, (accumulatedProfit / revenueTotal) * 400)
            : accumulatedProfit > 0
              ? 60
              : 20,
        weight: 0.1,
      },
    ];

    const total = Math.round(
      components.reduce((a, c) => a + c.score * c.weight, 0),
    );
    const grade: "Excelente" | "Atenção" | "Crítico" =
      total >= 80 ? "Excelente" : total >= 60 ? "Atenção" : "Crítico";

    return {
      topExpenses,
      topSuppliers,
      byCostCenter: byCostCenterArr,
      categoryTreemap,
      heatmap: heatmapArr,
      indicators: {
        bestMonth: { month: bestIdx + 1, value: monthsProfit[bestIdx] },
        worstMonth: { month: worstIdx + 1, value: monthsProfit[worstIdx] },
        biggestExpenseCategory,
        biggestSupplier,
        monthlyAvgRevenue,
        avgTicket,
        avgMargin,
        accumulatedProfit,
        ebitda,
        ebitdaPct,
        breakEven,
      },
      score: { total, grade, components },
    };
  });
