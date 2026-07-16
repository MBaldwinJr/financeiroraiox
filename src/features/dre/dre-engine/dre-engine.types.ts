/**
 * DRE Contábil CPC/IFRS — tipos.
 * Regime de COMPETÊNCIA. Contas patrimoniais (Fornecedores, Empréstimos, Imobilizado)
 * NUNCA aparecem aqui.
 */

export type DreLine =
  | "receita_bruta"
  | "deducoes"
  | "receita_liquida"
  | "cmv"
  | "lucro_bruto"
  | "despesa_comercial"
  | "despesa_administrativa"
  | "despesa_operacional"
  | "ebitda"
  | "depreciacao"
  | "ebit"
  | "resultado_financeiro"
  | "lair"
  | "ir_csll"
  | "lucro_liquido";

export type AccountClass =
  | "revenue"
  | "deduction"
  | "cogs"
  | "selling_expense"
  | "admin_expense"
  | "other_operating_expense"
  | "depreciation"
  | "financial_result"
  | "tax_on_profit"
  | "non_operating"
  | "balance_sheet";

/** Linhas armazenadas (valores absolutos, em centavos). Subtotais são calculados. */
export type StoredLine =
  | "receita_bruta"
  | "deducoes"
  | "cmv"
  | "despesa_comercial"
  | "despesa_administrativa"
  | "despesa_operacional"
  | "depreciacao"
  | "resultado_financeiro"
  | "ir_csll";

export interface DreMonthRow {
  monthly: number[]; // 12 posições, centavos
  total: number;
}

export type DreMatrix = Record<DreLine, DreMonthRow>;

export interface DreCompetenciaRow {
  competencia: string; // yyyy-mm-dd
  amount_cents: number;
  kind: "revenue" | "expense";
  category: {
    account_class: AccountClass | null;
    dre_line: DreLine | null;
    is_balance_sheet: boolean;
  } | null;
}
