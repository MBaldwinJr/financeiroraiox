import {
  emptyMonthBucket,
  PAYMENT_METHODS,
  type ErpSaleRow,
  type MonthBucket,
  type PaidRevenueRow,
  type PaymentMethod,
  type PrevMonthBucket,
  type PrevTransactionRow,
  type RevenueBasis,
  type TransactionRow,
} from "./dashboard.types";

const monthIndex = (iso: string): number => Number(iso.slice(5, 7)) - 1;

const isPaymentMethod = (m: string | null): m is PaymentMethod =>
  m !== null && (PAYMENT_METHODS as readonly string[]).includes(m);

export interface BucketedYear {
  monthly: MonthBucket[];
  byPayment: Record<PaymentMethod, number>;
}

export function bucketTransactionsByMonth(txs: readonly TransactionRow[]): BucketedYear {
  const monthly = Array.from({ length: 12 }, emptyMonthBucket);
  const byPayment = PAYMENT_METHODS.reduce(
    (acc, m) => {
      acc[m] = 0;
      return acc;
    },
    {} as Record<PaymentMethod, number>,
  );

  for (const tx of txs) {
    const bucket = monthly[monthIndex(tx.date)];
    if (tx.kind === "revenue") {
      bucket.revenue += tx.amount_cents;
      if (isPaymentMethod(tx.payment_method)) {
        byPayment[tx.payment_method] += tx.amount_cents;
      }
      continue;
    }
    bucket.expense += tx.amount_cents;
    const group = tx.category?.dre_group ?? "other";
    (bucket as unknown as Record<string, number>)[group] += tx.amount_cents;
  }

  return { monthly, byPayment };
}

export function applyRevenueBasis(
  monthly: MonthBucket[],
  basis: RevenueBasis,
  paidRows: readonly PaidRevenueRow[],
  salesRows: readonly ErpSaleRow[],
): MonthBucket[] {
  if (basis === "accrual") return monthly;

  for (const b of monthly) b.revenue = 0;

  if (basis === "cash") {
    for (const r of paidRows) {
      if (!r.paid_at) continue;
      monthly[monthIndex(r.paid_at)].revenue += r.amount_cents;
    }
    return monthly;
  }

  // erp_sales
  for (const r of salesRows) {
    monthly[monthIndex(r.period_start)].revenue += r.net_amount_cents - r.returns_cents;
  }
  return monthly;
}

export function bucketPrevYear(rows: readonly PrevTransactionRow[]): PrevMonthBucket[] {
  const prevMonthly: PrevMonthBucket[] = Array.from({ length: 12 }, () => ({
    revenue: 0,
    expense: 0,
  }));
  for (const r of rows) {
    const b = prevMonthly[monthIndex(r.date)];
    if (r.kind === "revenue") b.revenue += r.amount_cents;
    else b.expense += r.amount_cents;
  }
  return prevMonthly;
}

export function sumPrevYearTotals(rows: readonly PrevTransactionRow[]): {
  revenue: number;
  expense: number;
} {
  return rows.reduce(
    (acc, r) => {
      if (r.kind === "revenue") acc.revenue += r.amount_cents;
      else acc.expense += r.amount_cents;
      return acc;
    },
    { revenue: 0, expense: 0 },
  );
}

export interface Kpis {
  grossRevenue: number;
  cmv: number;
  grossProfit: number;
  totalRevenue: number;
  totalExpenses: number;
  operatingResult: number;
  netProfit: number;
  margin: number;
}

export interface ExpenseComposition {
  cmv: number;
  supplier: number;
  freight: number;
  fixed: number;
  variable: number;
  operational: number;
  other: number;
}

export function selectedMonthIndices(month: number | null | undefined): number[] {
  if (month) return [month - 1];
  return Array.from({ length: 12 }, (_, i) => i);
}

const sumOver =
  (monthly: MonthBucket[], indices: number[]) =>
  (key: keyof MonthBucket): number =>
    indices.reduce((acc, i) => acc + monthly[i][key], 0);

export function computeKpis(monthly: MonthBucket[], indices: number[]): Kpis {
  const sum = sumOver(monthly, indices);
  const grossRevenue = sum("revenue");
  const cmv = sum("cmv");
  const grossProfit = grossRevenue - cmv;
  // Total Despesas exclui CMV (CMV já reduz a Receita p/ Lucro Bruto)
  const totalExpenses = sum("expense") - cmv;
  const operatingResult =
    grossRevenue -
    cmv -
    sum("supplier") -
    sum("freight") -
    sum("fixed") -
    sum("variable") -
    sum("operational");
  const netProfit = grossRevenue - cmv - totalExpenses;
  const margin = grossRevenue > 0 ? netProfit / grossRevenue : 0;

  return {
    grossRevenue,
    cmv,
    grossProfit,
    totalRevenue: grossRevenue,
    totalExpenses,
    operatingResult,
    netProfit,
    margin,
  };
}

export function computeExpenseComposition(
  monthly: MonthBucket[],
  indices: number[],
): ExpenseComposition {
  const sum = sumOver(monthly, indices);
  return {
    cmv: sum("cmv"),
    supplier: sum("supplier"),
    freight: sum("freight"),
    fixed: sum("fixed"),
    variable: sum("variable"),
    operational: sum("operational"),
    other: sum("other"),
  };
}

export interface PreviousSnapshot {
  revenue: number;
  expense: number;
  netProfit: number;
}

export function computePrevious(
  month: number | null | undefined,
  year: number,
  monthly: MonthBucket[],
  prevMonthly: PrevMonthBucket[],
  prevYearTotal: { revenue: number; expense: number },
): PreviousSnapshot | null {
  if (!month) {
    return {
      revenue: prevYearTotal.revenue,
      expense: prevYearTotal.expense,
      netProfit: prevYearTotal.revenue - prevYearTotal.expense,
    };
  }
  const idx = month - 1;
  if (idx > 0) {
    const p = monthly[idx - 1];
    return { revenue: p.revenue, expense: p.expense, netProfit: p.revenue - p.expense };
  }
  if (year > 2000) {
    const p = prevMonthly[11];
    return { revenue: p.revenue, expense: p.expense, netProfit: p.revenue - p.expense };
  }
  return null;
}
