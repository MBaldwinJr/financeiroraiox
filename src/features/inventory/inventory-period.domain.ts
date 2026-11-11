/**
 * As-of window for Inventory indicators. End is EXCLUSIVE, based on the
 * current UTC calendar day. Historical years end on January 1 next year;
 * future years have no elapsed days and must not inherit future records.
 */
export function inventoryAsOfWindow(year: number, todayIso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) {
    throw new Error("Data de referência inválida.");
  }
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const today = new Date(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(today.getTime()) || today.toISOString().slice(0, 10) !== todayIso) {
    throw new Error("Data de referência inválida.");
  }
  const nextUtcDay = new Date(today.getTime() + 86_400_000).toISOString().slice(0, 10);
  const upperExclusive = nextUtcDay < start ? start : nextUtcDay > end ? end : nextUtcDay;
  const daysElapsed = Math.max(
    0,
    Math.round((Date.parse(upperExclusive) - Date.parse(start)) / 86_400_000),
  );
  return { start, end, upperExclusive, daysElapsed };
}
