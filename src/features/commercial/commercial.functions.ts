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

interface TxRow {
  readonly id: string;
  readonly date: string;
  readonly paid_at: string | null;
  readonly amount_cents: number;
  readonly kind: "revenue" | "expense";
  readonly status: "pending" | "paid";
  readonly payment_method: string | null;
  readonly party_id: string | null;
}

interface PartyRow {
  readonly id: string;
  readonly name: string;
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string): number =>
  Math.floor((new Date(a).getTime() - new Date(b).getTime()) / DAY_MS);

export const getCommercialPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ context, data }) => {
    const yearStart = `${data.year}-01-01`;
    const yearEnd = `${data.year + 1}-01-01`;
    const today = new Date().toISOString().slice(0, 10);

    const rows = await fetchAllRows<TxRow>((from, to) =>
      context.supabase
        .from("transactions")
        .select("id, date, paid_at, amount_cents, kind, status, payment_method, party_id")
        .eq("company_id", data.companyId)
        .eq("kind", "revenue")
        .is("deleted_at", null)
        .gte("date", yearStart)
        .lt("date", yearEnd)
        .range(from, to) as unknown as PromiseLike<{
        data: TxRow[] | null;
        error: { message: string } | null;
      }>,
    );

    const parties = await fetchAllRows<PartyRow>((from, to) =>
      context.supabase
        .from("parties")
        .select("id, name")
        .eq("company_id", data.companyId)
        .range(from, to) as unknown as PromiseLike<{
        data: PartyRow[] | null;
        error: { message: string } | null;
      }>,
    );
    const partyName = new Map(parties.map((p) => [p.id, p.name] as const));

    // Monthly sales (by date) and receipts (by paid_at within the year)
    const sales = new Array<number>(12).fill(0);
    const receipts = new Array<number>(12).fill(0);
    const overdueByMonth = new Array<number>(12).fill(0);

    // Aging (pending revenue, by days late from today)
    const aging = { d30: 0, d60: 0, d90: 0, d180: 0, d180p: 0 };

    // Per-party aggregates
    interface PartyAgg {
      partyId: string;
      name: string;
      open: number;
      sales: number;
      received: number;
      maxDaysLate: number;
      lastPaid: string | null;
      monthsOverdue: number[];
    }
    const partyAgg = new Map<string, PartyAgg>();
    const getAgg = (id: string): PartyAgg => {
      let a = partyAgg.get(id);
      if (!a) {
        a = {
          partyId: id,
          name: partyName.get(id) ?? "Sem cliente",
          open: 0,
          sales: 0,
          received: 0,
          maxDaysLate: 0,
          lastPaid: null,
          monthsOverdue: new Array<number>(12).fill(0),
        };
        partyAgg.set(id, a);
      }
      return a;
    };

    // Payment method aggregates
    const byMethod = new Map<
      string,
      { sales: number; received: number; overdue: number }
    >();
    const bumpMethod = (
      m: string | null,
      key: "sales" | "received" | "overdue",
      v: number,
    ) => {
      const k = m ?? "—";
      const cur = byMethod.get(k) ?? { sales: 0, received: 0, overdue: 0 };
      cur[key] += v;
      byMethod.set(k, cur);
    };

    const salesCountByMonth = new Array<number>(12).fill(0);
    let paidDaysSum = 0;
    let paidCount = 0;

    for (const tx of rows) {
      const m = Number(tx.date.slice(5, 7)) - 1;
      sales[m] += tx.amount_cents;
      salesCountByMonth[m] += 1;
      bumpMethod(tx.payment_method, "sales", tx.amount_cents);

      const pid = tx.party_id;
      if (pid) {
        const a = getAgg(pid);
        a.sales += tx.amount_cents;
      }

      if (tx.status === "paid" && tx.paid_at) {
        if (tx.paid_at >= yearStart && tx.paid_at < yearEnd) {
          const pm = Number(tx.paid_at.slice(5, 7)) - 1;
          receipts[pm] += tx.amount_cents;
        }
        bumpMethod(tx.payment_method, "received", tx.amount_cents);
        const lag = daysBetween(tx.paid_at, tx.date);
        if (lag >= 0) {
          paidDaysSum += lag;
          paidCount += 1;
        }
        if (pid) {
          const a = getAgg(pid);
          a.received += tx.amount_cents;
          if (!a.lastPaid || tx.paid_at > a.lastPaid) a.lastPaid = tx.paid_at;
        }
      } else if (tx.status === "pending" && tx.date < today) {
        const late = daysBetween(today, tx.date);
        overdueByMonth[m] += tx.amount_cents;
        bumpMethod(tx.payment_method, "overdue", tx.amount_cents);
        if (late <= 30) aging.d30 += tx.amount_cents;
        else if (late <= 60) aging.d60 += tx.amount_cents;
        else if (late <= 90) aging.d90 += tx.amount_cents;
        else if (late <= 180) aging.d180 += tx.amount_cents;
        else aging.d180p += tx.amount_cents;
        if (pid) {
          const a = getAgg(pid);
          a.open += tx.amount_cents;
          if (late > a.maxDaysLate) a.maxDaysLate = late;
          a.monthsOverdue[m] += tx.amount_cents;
        }
      }
    }

    // Sales series: prefer ERP sales PDF when basis = "erp_sales", OR
    // automatically when basis = "accrual" and there is ERP sales data
    // imported for the year (otherwise the user sees zeros after importing
    // the PDF, since transactions are receipts, not sales).
    const basisPref = data.basis ?? "accrual";
    if (basisPref !== "cash") {
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
      const useErp = basisPref === "erp_sales" || salesRows.length > 0;
      if (useErp) {
        for (let i = 0; i < 12; i++) sales[i] = 0;
        for (const r of salesRows) {
          const m = Number(r.period_start.slice(5, 7)) - 1;
          sales[m] += r.net_amount_cents - r.returns_cents;
        }
        // Recompute sales count proxy from ERP rows for avg ticket.
        salesCount = salesRows.length;
      }
    }


    const totalSales = sales.reduce((a, b) => a + b, 0);
    const totalReceipts = receipts.reduce((a, b) => a + b, 0);
    const totalOverdue =
      aging.d30 + aging.d60 + aging.d90 + aging.d180 + aging.d180p;

    const monthIdx = (data.month ?? new Date().getMonth() + 1) - 1;
    const curSales = sales[monthIdx];
    const curReceipts = receipts[monthIdx];
    const prevIdx = monthIdx > 0 ? monthIdx - 1 : null;
    const prevSales = prevIdx !== null ? sales[prevIdx] : 0;
    const prevReceipts = prevIdx !== null ? receipts[prevIdx] : 0;

    const monthlyGap = sales.map((s, i) => s - receipts[i]);
    const curGap = curSales - curReceipts;
    const prevGap = prevIdx !== null ? sales[prevIdx] - receipts[prevIdx] : 0;

    const delinquencyRate = totalSales > 0 ? totalOverdue / totalSales : 0;
    const conversion = totalSales > 0 ? totalReceipts / totalSales : 0;
    const avgDaysToReceive = paidCount > 0 ? paidDaysSum / paidCount : 0;
    const avgTicket = salesCount > 0 ? totalSales / salesCount : 0;
    const overdueClients = Array.from(partyAgg.values()).filter((p) => p.open > 0).length;

    const topDelinquents = Array.from(partyAgg.values())
      .filter((p) => p.open > 0)
      .sort((a, b) => b.open - a.open)
      .slice(0, 20)
      .map((p) => ({
        partyId: p.partyId,
        name: p.name,
        open: p.open,
        daysLate: p.maxDaysLate,
        lastPaid: p.lastPaid,
        received: p.received,
        sales: p.sales,
      }));

    const heatmap = Array.from(partyAgg.values())
      .filter((p) => p.open > 0)
      .sort((a, b) => b.open - a.open)
      .slice(0, 12)
      .map((p) => ({ category: p.name, months: p.monthsOverdue }));

    const paymentMethods = Array.from(byMethod.entries()).map(([method, v]) => ({
      method,
      ...v,
      delinquencyRate: v.sales > 0 ? v.overdue / v.sales : 0,
    }));

    return {
      sales,
      receipts,
      monthlyGap,
      overdueByMonth,
      aging,
      topDelinquents,
      heatmap,
      paymentMethods,
      kpis: {
        curSales,
        prevSales,
        curReceipts,
        prevReceipts,
        curGap,
        prevGap,
        totalOverdue,
        delinquencyRate,
        avgDaysToReceive,
        avgTicket,
        overdueClients,
        conversion,
        totalSales,
        totalReceipts,
      },
    };
  });
