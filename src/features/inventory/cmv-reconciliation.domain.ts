/** Cross-check only; matching costs is not a certified accounting reconciliation. */
export interface ErpCostRow {
  period_start: string;
  period_end: string;
  cost_cents: number;
}

export interface InventoryCostSnapshot {
  snapshot_date: string;
  cost_cents: number;
}

export type CmvCheckStatus =
  | "missing_pdf"
  | "missing_dre"
  | "partial_period"
  | "investigate"
  | "cent_difference"
  | "totals_equal";

export interface CmvMonthComparison {
  month: number;
  dreCostCents: number;
  dreEntryCount: number;
  importedCostCents: number | null;
  importedRows: number;
  differenceCents: number | null;
  reportCoversCalendarMonth: boolean;
  inventoryClosingSnapshotDate: string | null;
  latestInventorySnapshotDate: string | null;
  status: CmvCheckStatus;
}

export interface CmvReconciliationReport {
  year: number;
  monthly: CmvMonthComparison[];
  comparableMonths: number;
  flaggedMonths: number;
  missingPdfMonths: number;
  missingInventoryClosings: number;
}

function dateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Compare the CMV actually recognized by the DRE with sum(cost_cents)
 * from imported monthly sales PDFs. For each month mark the presence of
 * an EXACT month-end inventory snapshot but never infer purchases from it.
 */
export function reconcileCmvSources(
  year: number,
  dreCostMonthly: readonly number[],
  dreEntryCounts: readonly number[],
  sales: readonly ErpCostRow[],
  snapshots: readonly InventoryCostSnapshot[],
): CmvReconciliationReport {
  if (dreCostMonthly.length !== 12 || dreEntryCounts.length !== 12) {
    throw new Error("A reconciliação exige doze competências da DRE.");
  }

  const monthly = Array.from({ length: 12 }, (_, index): CmvMonthComparison => {
    const month = index + 1;
    const first = dateString(year, month, 1);
    const closing = dateString(year, month, lastDay(year, month));
    const monthSales = sales.filter((row) =>
      row.period_start.slice(0, 7) === first.slice(0, 7),
    );
    const importedRows = monthSales.length;
    const importedCostCents = importedRows
      ? monthSales.reduce((total, row) => total + row.cost_cents, 0)
      : null;
    const dreCostCents = dreCostMonthly[index];
    const dreEntryCount = dreEntryCounts[index];
    const differenceCents = importedCostCents == null
      ? null
      : dreCostCents - importedCostCents;
    const reportCoversCalendarMonth = importedRows > 0 &&
      monthSales.every((row) => row.period_start === first && row.period_end === closing);

    const monthlySnapshots = snapshots
      .filter((snapshot) => snapshot.snapshot_date.slice(0, 7) === first.slice(0, 7))
      .map((snapshot) => snapshot.snapshot_date)
      .sort();
    const inventoryClosingSnapshotDate = monthlySnapshots.includes(closing) ? closing : null;
    const latestInventorySnapshotDate = monthlySnapshots.at(-1) ?? null;

    let status: CmvCheckStatus;
    if (importedRows === 0) status = "missing_pdf";
    else if (dreEntryCount === 0) status = "missing_dre";
    else if (!reportCoversCalendarMonth) status = "partial_period";
    else if (differenceCents === 0) status = "totals_equal";
    else if (differenceCents != null && Math.abs(differenceCents) <= 2) status = "cent_difference";
    else status = "investigate";

    return {
      month, dreCostCents, dreEntryCount,
      importedCostCents, importedRows,
      differenceCents, reportCoversCalendarMonth,
      inventoryClosingSnapshotDate, latestInventorySnapshotDate, status,
    };
  });

  return {
    year,
    monthly,
    comparableMonths: monthly.filter((row) =>
      row.importedCostCents !== null && row.dreEntryCount > 0 && row.reportCoversCalendarMonth,
    ).length,
    flaggedMonths: monthly.filter((row) => row.status === "investigate").length,
    missingPdfMonths: monthly.filter((row) => row.status === "missing_pdf").length,
    missingInventoryClosings: monthly.filter((row) => !row.inventoryClosingSnapshotDate).length,
  };
}
