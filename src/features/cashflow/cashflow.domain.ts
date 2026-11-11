import type { PaidExpenseRow, PaidRevenueRow } from "@/features/dashboard/dashboard.types";

/**
 * Movimentações marcadas como liquidadas; NÃO é conciliação de saldos bancários.
 * CMV é custo contábil reconhecido na DRE e não deve ser somado a pagamentos
 * de compras/fornecedores como uma segunda saída de caixa.
 */
export interface CashMovementMonth {
  receiptsCents: number;
  supplierPaymentsCents: number;
  operatingPaymentsCents: number;
  otherPatrimonialPaymentsCents: number;
  outflowsCents: number;
  cmvExcludedCents: number;
  cmvExcludedCount: number;
}

export const emptyCashMovementMonth = (): CashMovementMonth => ({
  receiptsCents: 0,
  supplierPaymentsCents: 0,
  operatingPaymentsCents: 0,
  otherPatrimonialPaymentsCents: 0,
  outflowsCents: 0,
  cmvExcludedCents: 0,
  cmvExcludedCount: 0,
});

function monthOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const value = Number(date.slice(5, 7));
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value - 1 : null;
}

/**
 * Categoriza pagamentos registrados sem usar dre_line para inferir caixa.
 *
 * - CMV: custo da mercadoria vendida, demonstrado na DRE. Só ele não prova pagamento.
 * - Fornecedores: liquidação de compras/dívidas com fornecedores, não despesa adicional na DRE.
 * - Patrimoniais: empréstimos (principal), ativos etc.; caixa, mas não lucro.
 * - Operacionais: pagamentos de despesas não patrimoniais.
 *
 * Todos dependem de reconciliação com extratos para confirmar fluxo bancário real.
 */
export function buildCashMovementMonths(
  paidRevenues: readonly PaidRevenueRow[],
  paidExpenses: readonly PaidExpenseRow[],
): CashMovementMonth[] {
  const months = Array.from({ length: 12 }, emptyCashMovementMonth);

  for (const receipt of paidRevenues) {
    const month = monthOf(receipt.paid_at);
    if (month === null) continue;
    // Recebimentos patrimoniais também movimentam caixa (ex.: crédito recebido).
    months[month].receiptsCents += receipt.amount_cents;
  }

  for (const payment of paidExpenses) {
    const month = monthOf(payment.paid_at);
    if (month === null) continue;
    const bucket = months[month];
    const group = payment.category?.dre_group;

    // Um registro de CMV (mesmo com status 'paid') não deve ser contado
    // como uma segunda saída junto às liquidações de fornecedores.
    if (group === "cmv") {
      bucket.cmvExcludedCents += payment.amount_cents;
      bucket.cmvExcludedCount += 1;
      continue;
    }

    if (group === "supplier") {
      bucket.supplierPaymentsCents += payment.amount_cents;
    } else if (payment.category?.is_balance_sheet === true) {
      bucket.otherPatrimonialPaymentsCents += payment.amount_cents;
    } else {
      bucket.operatingPaymentsCents += payment.amount_cents;
    }
    bucket.outflowsCents += payment.amount_cents;
  }

  return months;
}
