/** Pure safety checks for PDF sales reports. Never replaces or removes existing records. */
export interface SaleIdentity {
  sellerName: string;
  sellerCode?: string | null;
}
export interface SaleImportRow extends SaleIdentity {
  netAmountCents: number;
  returnsCents: number;
  costCents: number;
  itemsQty: number;
  salesQty: number;
}
export interface SaleImportIntegrity {
  errors: string[];
  warnings: string[];
  missingSellerCodes: number;
  duplicateSellerNames: number;
}

export function normalizedSellerKey(value: string): string {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toUpperCase();
}

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function assessSalesImport(
  periodStart: string,
  periodEnd: string,
  rows: readonly SaleImportRow[],
): SaleImportIntegrity {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRealIsoDate(periodStart) || !isRealIsoDate(periodEnd)) {
    errors.push("Período do relatório inválido. Confirme as datas no PDF.");
  } else {
    if (periodEnd < periodStart) errors.push("O fim do período antecede o início.");
    if (periodStart.slice(0, 7) !== periodEnd.slice(0, 7)) {
      errors.push("O período do relatório atravessa meses. Importe relatórios separados por competência.");
    }
    const year = Number(periodStart.slice(0, 4));
    const month = Number(periodStart.slice(5, 7));
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    if (periodStart.slice(-2) !== "01" || periodEnd !== monthEnd) {
      warnings.push("O período informado não cobre o mês civil completo.");
    }
  }

  if (!rows.length) errors.push("O PDF não contém vendedores reconhecidos.");
  const seen = new Set<string>();
  let duplicateSellerNames = 0;
  let missingSellerCodes = 0;
  for (const row of rows) {
    const key = normalizedSellerKey(row.sellerName);
    if (!key) errors.push("Há um vendedor sem nome no arquivo.");
    if (key && seen.has(key)) duplicateSellerNames++;
    seen.add(key);
    if (!row.sellerCode?.trim()) missingSellerCodes++;
    for (const amount of [
      row.netAmountCents, row.returnsCents, row.costCents, row.itemsQty, row.salesQty,
    ]) {
      if (!Number.isSafeInteger(amount)) {
        errors.push("O relatório contém valor ou quantidade que não é um inteiro válido.");
        break;
      }
    }
  }
  if (duplicateSellerNames) {
    errors.push("O PDF contém nomes repetidos de vendedores. Confira linhas e totais antes de importar.");
  }
  if (missingSellerCodes) {
    warnings.push(
      `${missingSellerCodes} vendedor(es) sem código. A identificação por nome pode falhar após alterações de grafia.`,
    );
  }
  return { errors: [...new Set(errors)], warnings, missingSellerCodes, duplicateSellerNames };
}

/** Count only. Never expose existing seller identities in the API response. */
export function assessSalesReimport(
  existing: readonly (SaleIdentity & { periodEnd?: string | null })[],
  incoming: readonly SaleIdentity[],
  newPeriodEnd?: string,
) {
  const previousKeys = new Set(existing.map((row) => normalizedSellerKey(row.sellerName)));
  const newKeys = new Set(incoming.map((row) => normalizedSellerKey(row.sellerName)));
  const missingExistingCount = [...previousKeys].filter((key) => !newKeys.has(key)).length;
  const newSellerCount = [...newKeys].filter((key) => !previousKeys.has(key)).length;
  const retainedCount = [...newKeys].filter((key) => previousKeys.has(key)).length;
  const previousDuplicateCount = existing.length - previousKeys.size;
  const periodMismatchCount = newPeriodEnd
    ? existing.filter((row) => row.periodEnd != null && row.periodEnd !== newPeriodEnd).length
    : 0;
  return {
    existingCount: existing.length,
    incomingCount: incoming.length,
    missingExistingCount,
    newSellerCount,
    retainedCount,
    previousDuplicateCount,
    periodMismatchCount,
    blocked: missingExistingCount > 0 || previousDuplicateCount > 0 || periodMismatchCount > 0,
  };
}
