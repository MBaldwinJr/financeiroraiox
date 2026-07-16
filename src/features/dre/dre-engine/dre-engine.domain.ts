/**
 * Motor puro da DRE (sem I/O).
 * Regras:
 *  - Receitas somam positivo; deduções/despesas somam positivo (representam abatimentos).
 *  - Subtotais são derivados. Nunca somamos duas fontes para a mesma linha.
 *  - Contas patrimoniais são filtradas antes de entrar aqui.
 */
import type {
  DreCompetenciaRow,
  DreMatrix,
  DreMonthRow,
  StoredLine,
} from "./dre-engine.types";

const monthIndex = (iso: string): number => Number(iso.slice(5, 7)) - 1;

const emptyRow = (): DreMonthRow => ({ monthly: Array(12).fill(0), total: 0 });

const STORED_LINES: StoredLine[] = [
  "receita_bruta",
  "deducoes",
  "cmv",
  "despesa_comercial",
  "despesa_administrativa",
  "despesa_operacional",
  "depreciacao",
  "resultado_financeiro",
  "ir_csll",
];

/** Agrupa lançamentos por linha da DRE + mês (regime de competência). */
export function aggregateByDreLine(rows: readonly DreCompetenciaRow[]): Record<StoredLine, DreMonthRow> {
  const acc = STORED_LINES.reduce(
    (m, k) => {
      m[k] = emptyRow();
      return m;
    },
    {} as Record<StoredLine, DreMonthRow>,
  );

  for (const r of rows) {
    if (!r.category) continue;
    if (r.category.is_balance_sheet) continue; // NUNCA na DRE
    const line = r.category.dre_line;
    if (!line || !STORED_LINES.includes(line as StoredLine)) continue;
    const idx = monthIndex(r.competencia);
    const bucket = acc[line as StoredLine];
    bucket.monthly[idx] += r.amount_cents;
    bucket.total += r.amount_cents;
  }
  return acc;
}

const subtract = (a: DreMonthRow, ...others: DreMonthRow[]): DreMonthRow => {
  const monthly = a.monthly.map((v, i) => v - others.reduce((s, o) => s + o.monthly[i], 0));
  return { monthly, total: monthly.reduce((s, v) => s + v, 0) };
};

const clone = (r: DreMonthRow): DreMonthRow => ({ monthly: [...r.monthly], total: r.total });

/** Calcula todas as 15 linhas da DRE CPC a partir das linhas armazenadas. */
export function buildDreMatrix(stored: Record<StoredLine, DreMonthRow>): DreMatrix {
  const receita_bruta = clone(stored.receita_bruta);
  const deducoes = clone(stored.deducoes);
  const receita_liquida = subtract(receita_bruta, deducoes);
  const cmv = clone(stored.cmv);
  const lucro_bruto = subtract(receita_liquida, cmv);
  const despesa_comercial = clone(stored.despesa_comercial);
  const despesa_administrativa = clone(stored.despesa_administrativa);
  const despesa_operacional = clone(stored.despesa_operacional);
  const ebitda = subtract(
    lucro_bruto,
    despesa_comercial,
    despesa_administrativa,
    despesa_operacional,
  );
  const depreciacao = clone(stored.depreciacao);
  const ebit = subtract(ebitda, depreciacao);
  const resultado_financeiro = clone(stored.resultado_financeiro); // pode ser +/-
  // Somar resultado financeiro (positivo receita, negativo despesa). Armazenado como "abatimento" (positivo = despesa).
  const lair: DreMonthRow = {
    monthly: ebit.monthly.map((v, i) => v - resultado_financeiro.monthly[i]),
    total: 0,
  };
  lair.total = lair.monthly.reduce((s, v) => s + v, 0);
  const ir_csll = clone(stored.ir_csll);
  const lucro_liquido = subtract(lair, ir_csll);

  return {
    receita_bruta,
    deducoes,
    receita_liquida,
    cmv,
    lucro_bruto,
    despesa_comercial,
    despesa_administrativa,
    despesa_operacional,
    ebitda,
    depreciacao,
    ebit,
    resultado_financeiro,
    lair,
    ir_csll,
    lucro_liquido,
  };
}
