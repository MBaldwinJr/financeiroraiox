import { createHash } from "node:crypto";
import {
  assessSalesImport,
  normalizedSellerKey,
  type SaleImportRow,
} from "./sales-import-integrity.domain";

/**
 * The preview is a read-only financial comparison. It does not authorize
 * replacement or certify either PDF's accounting accuracy.
 */
export interface ExistingSaleForReplacement {
  id: string;
  seller_name: string;
  seller_code: string | null;
  period_end: string;
  net_amount_cents: number;
  returns_cents: number;
  cost_cents: number;
  items_qty: number;
  sales_qty: number;
  source_file: string | null;
  imported_at: string;
  updated_at: string;
}

export interface SaleReplacementTotals {
  sellers: number;
  netAmountCents: number;
  returnsCents: number;
  netAfterReturnsCents: number;
  costCents: number;
  contributionCents: number;
  itemsQty: number;
  salesQty: number;
}

export interface SaleReplacementDifference {
  sellerName: string;
  change: "added" | "removed" | "modified" | "unchanged";
  previousCostCents: number | null;
  nextCostCents: number | null;
  costDeltaCents: number;
  previousNetAfterReturnsCents: number | null;
  nextNetAfterReturnsCents: number | null;
  salesDeltaCents: number;
}

type NumericSale = {
  netAmountCents: number;
  returnsCents: number;
  costCents: number;
  itemsQty: number;
  salesQty: number;
};

const emptyTotals = (): SaleReplacementTotals => ({
  sellers: 0, netAmountCents: 0, returnsCents: 0,
  netAfterReturnsCents: 0, costCents: 0, contributionCents: 0,
  itemsQty: 0, salesQty: 0,
});

function totals(rows: readonly NumericSale[]): SaleReplacementTotals {
  const total = emptyTotals();
  total.sellers = rows.length;
  for (const row of rows) {
    total.netAmountCents += row.netAmountCents;
    total.returnsCents += row.returnsCents;
    total.costCents += row.costCents;
    total.itemsQty += row.itemsQty;
    total.salesQty += row.salesQty;
  }
  total.netAfterReturnsCents = total.netAmountCents - total.returnsCents;
  total.contributionCents = total.netAfterReturnsCents - total.costCents;
  for (const n of Object.values(total)) {
    if (!Number.isSafeInteger(n)) throw new Error("Totais fora do intervalo numérico seguro.");
  }
  return total;
}

function fromOld(row: ExistingSaleForReplacement): NumericSale {
  return {
    netAmountCents: row.net_amount_cents,
    returnsCents: row.returns_cents,
    costCents: row.cost_cents,
    itemsQty: row.items_qty,
    salesQty: row.sales_qty,
  };
}

function fromNew(row: SaleImportRow): NumericSale {
  return {
    netAmountCents: row.netAmountCents,
    returnsCents: row.returnsCents,
    costCents: row.costCents,
    itemsQty: row.itemsQty,
    salesQty: row.salesQty,
  };
}

function isSame(a: NumericSale, b: NumericSale): boolean {
  return a.netAmountCents === b.netAmountCents &&
    a.returnsCents === b.returnsCents &&
    a.costCents === b.costCents &&
    a.itemsQty === b.itemsQty && a.salesQty === b.salesQty;
}

export function createSalesReplacementPreview(
  companyId: string,
  periodStart: string,
  periodEnd: string,
  existing: readonly ExistingSaleForReplacement[],
  incoming: readonly SaleImportRow[],
) {
  const integrity = assessSalesImport(periodStart, periodEnd, incoming);
  if (integrity.errors.length) throw new Error(integrity.errors.join(" "));

  const oldRows = existing.map(fromOld);
  const newRows = incoming.map(fromNew);
  const previous = totals(oldRows);
  const proposed = totals(newRows);

  const previousMap = new Map(existing.map((row) => [row.seller_name.trim(), row]));
  const proposedMap = new Map(incoming.map((row) => [row.sellerName.trim(), row]));
  const allNames = [...new Set([...previousMap.keys(), ...proposedMap.keys()])].sort((a, b) => a.localeCompare(b));

  const differences: SaleReplacementDifference[] = allNames.map((sellerName) => {
    const old = previousMap.get(sellerName);
    const next = proposedMap.get(sellerName);
    const prevCost = old ? old.cost_cents : null;
    const nextCost = next ? next.costCents : null;
    const prevNet = old ? old.net_amount_cents - old.returns_cents : null;
    const nextNet = next ? next.netAmountCents - next.returnsCents : null;
    return {
      sellerName,
      change: !old ? "added" : !next ? "removed" :
        isSame(fromOld(old), fromNew(next)) ? "unchanged" : "modified",
      previousCostCents: prevCost,
      nextCostCents: nextCost,
      costDeltaCents: (nextCost ?? 0) - (prevCost ?? 0),
      previousNetAfterReturnsCents: prevNet,
      nextNetAfterReturnsCents: nextNet,
      salesDeltaCents: (nextNet ?? 0) - (prevNet ?? 0),
    };
  });

  const existingNormalized = new Set(existing.map((row) => normalizedSellerKey(row.seller_name)));
  const incomingNormalized = new Set(incoming.map((row) => normalizedSellerKey(row.sellerName)));
  const spellingChanges = [...incomingNormalized].filter((key) => existingNormalized.has(key) &&
    !existing.some((old) => incoming.some((next) =>
      old.seller_name.trim() === next.sellerName.trim() && normalizedSellerKey(old.seller_name) === key,
    ))).length;

  // The token detects a stale proposed plan in a future transactional API.
  // It is NOT a secret, a permission check, or a commitment authorization.
  const token = createHash("sha256").update(JSON.stringify({
    companyId, periodStart, periodEnd,
    previous: [...existing].sort((a, b) => a.id.localeCompare(b.id)),
    next: [...incoming].sort((a, b) => a.sellerName.localeCompare(b.sellerName)),
  })).digest("hex");

  return {
    previous, proposed,
    difference: {
      sellers: proposed.sellers - previous.sellers,
      netAmountCents: proposed.netAmountCents - previous.netAmountCents,
      returnsCents: proposed.returnsCents - previous.returnsCents,
      netAfterReturnsCents: proposed.netAfterReturnsCents - previous.netAfterReturnsCents,
      costCents: proposed.costCents - previous.costCents,
      contributionCents: proposed.contributionCents - previous.contributionCents,
      itemsQty: proposed.itemsQty - previous.itemsQty,
      salesQty: proposed.salesQty - previous.salesQty,
    },
    differences,
    spellingChanges,
    warnings: integrity.warnings,
    snapshotToken: token,
    hasExistingPeriod: existing.length > 0,
    // A single transaction-bound DB operation is REQUIRED before enabling replacement.
    replacementEnabled: false as const,
  };
}
