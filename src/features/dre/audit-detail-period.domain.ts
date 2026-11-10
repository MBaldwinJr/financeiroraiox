/**
 * Mesma janela temporal da Auditoria DRE: competência dentro do período
 * ou, somente quando competência está ausente, data dentro do período.
 */
export function auditDetailWindow(year: number, month: number | null | undefined) {
  const start = month == null
    ? `${year}-01-01`
    : `${year}-${String(month).padStart(2, "0")}-01`;
  const end = month == null
    ? `${year + 1}-01-01`
    : month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { start, end };
}

/** Todas as datas são geradas a partir de números já validados por Zod. */
export function auditDetailPeriodFilter(year: number, month: number | null | undefined): string {
  const { start, end } = auditDetailWindow(year, month);
  return `and(competencia.gte.${start},competencia.lt.${end}),and(competencia.is.null,date.gte.${start},date.lt.${end})`;
}

export function auditDetailOffset(page: number, pageSize = 25) {
  const from = page * pageSize;
  return { from, to: from + pageSize - 1 };
}
