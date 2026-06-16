export type DreGroup =
  | "revenue"
  | "cmv"
  | "supplier"
  | "freight"
  | "fixed"
  | "variable"
  | "operational"
  | "other";

export type RevenueBasis = "accrual" | "cash" | "erp_sales";

export interface MonthBucket {
  revenue: number;
  expense: number;
  cmv: number;
  supplier: number;
  freight: number;
  fixed: number;
  variable: number;
  operational: number;
  other: number;
}

export interface PrevMonthBucket {
  revenue: number;
  expense: number;
}

export interface TransactionRow {
  date: string;
  amount_cents: number;
  kind: "revenue" | "expense";
  payment_method: string | null;
  category: { dre_group: DreGroup } | null;
}

export interface PrevTransactionRow {
  date: string;
  amount_cents: number;
  kind: "revenue" | "expense";
}

export interface PaidRevenueRow {
  paid_at: string;
  amount_cents: number;
}

export interface PaidExpenseRow {
  paid_at: string;
  amount_cents: number;
  category: { dre_group: DreGroup } | null;
}

export interface ErpSaleRow {
  period_start: string;
  net_amount_cents: number;
  returns_cents: number;
}

export const PAYMENT_METHODS = ["cash", "pix", "boleto", "cheque", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const emptyMonthBucket = (): MonthBucket => ({
  revenue: 0,
  expense: 0,
  cmv: 0,
  supplier: 0,
  freight: 0,
  fixed: 0,
  variable: 0,
  operational: 0,
  other: 0,
});
