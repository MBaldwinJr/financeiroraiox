/**
 * Money utilities — store as integer cents, never floats.
 */
export const toCents = (value: number): number => Math.round(value * 100);
export const fromCents = (cents: number | null | undefined): number => (cents ?? 0) / 100;

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const pct = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const formatBRL = (cents: number | null | undefined): string => brl.format(fromCents(cents));
export const formatBRLCompact = (cents: number | null | undefined): string =>
  brlCompact.format(fromCents(cents));
export const formatPct = (value: number): string => pct.format(value);
export const formatDate = (iso: string): string =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");

export const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;
