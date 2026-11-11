/**
 * Sinais derivados SOMENTE do texto da descrição.
 * Não são classificação contábil, inferência de dívida, nem sugestão de lançamento.
 * O enquadramento correto exige documentos e confirmação contábil.
 */
export type ReviewSignal =
  | "credit_operations"
  | "fees"
  | "returns"
  | "barter"
  | "unresolved";

export interface ReviewSignalInfo {
  signal: ReviewSignal;
  label: string;
  reviewQuestion: string;
  evidenceToCheck: readonly string[];
}

export const REVIEW_SIGNALS: readonly ReviewSignalInfo[] = [
  {
    signal: "credit_operations",
    label: "Crédito e rotativo",
    reviewQuestion: "Separar principal, juros, encargos e transferências conforme contrato e extrato.",
    evidenceToCheck: ["Contrato e aditivos do crédito", "Extratos com movimentações de principal", "Demonstrativo de juros e tarifas", "Comprovantes de amortização ou liberação"],
  },
  {
    signal: "fees",
    label: "Tarifas e taxas",
    reviewQuestion: "Conferir comprovantes e identificar tarifa, antecipação, comissão ou outro ajuste.",
    evidenceToCheck: ["Relatório da adquirente ou banco", "Comprovante de desconto ou antecipação", "Conciliação com as vendas e recebíveis", "Documento fiscal ou demonstrativo de tarifas"],
  },
  {
    signal: "returns",
    label: "Devoluções e estornos",
    reviewQuestion: "Conferir operação original, reembolso, cancelamento e respectiva competência.",
    evidenceToCheck: ["Venda e documento fiscal originais", "Nota de devolução ou documento de estorno", "Comprovante do reembolso", "Conciliação com estoque e contas a receber"],
  },
  {
    signal: "barter",
    label: "Permutas e trocas",
    reviewQuestion: "Verificar bens ou serviços trocados, documentos fiscais e eventuais contrapartidas.",
    evidenceToCheck: ["Contrato ou termo de permuta", "Notas fiscais de ambos os lados", "Valoração e registro dos bens ou serviços", "Conciliação de estoques e contrapartidas"],
  },
  {
    signal: "unresolved",
    label: "Outros / indeterminados",
    reviewQuestion: "Analisar documento e natureza econômica antes de propor um enquadramento.",
    evidenceToCheck: ["Documento ou extrato original", "Identificação da contraparte", "Justificativa econômica da operação", "Confirmação do responsável contábil"],
  },
];

export function reviewSignalInfo(signal: ReviewSignal): ReviewSignalInfo {
  return REVIEW_SIGNALS.find((entry) => entry.signal === signal)!;
}

function normalizeDescription(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

/**
 * Regras exclusivas por prioridade para evitar dupla contagem.
 * As palavras-chave NÃO autorizam reclassificar uma transação.
 */
export function inferReviewSignal(description: string | null | undefined): ReviewSignal {
  const value = normalizeDescription(description);
  if (/ROTATIV|CREDITO\s+(?:EM\s+)?ROTATIV/.test(value)) return "credit_operations";
  if (/TAXAS?|TARIFAS?|ADQUIRENCIA/.test(value)) return "fees";
  if (/DEVOLU|REEMBOLS|ESTORN|CANCELAMENT/.test(value)) return "returns";
  if (/PERMUT|TROCA/.test(value)) return "barter";
  return "unresolved";
}

export interface ReviewSignalSummary {
  signal: ReviewSignal;
  label: string;
  reviewQuestion: string;
  count: number;
  expenseCents: number;
  revenueCents: number;
}

/** Preserva centavos inteiros, contagem exclusiva e ordem por impacto. */
export function summarizeReviewSignals(
  rows: readonly {
    description?: string | null;
    kind: "revenue" | "expense";
    amount_cents: number;
  }[],
): ReviewSignalSummary[] {
  const summary = new Map<ReviewSignal, ReviewSignalSummary>();
  for (const row of rows) {
    const signal = inferReviewSignal(row.description);
    let bucket = summary.get(signal);
    if (!bucket) {
      const info = reviewSignalInfo(signal);
      bucket = {
        signal,
        label: info.label,
        reviewQuestion: info.reviewQuestion,
        count: 0,
        expenseCents: 0,
        revenueCents: 0,
      };
      summary.set(signal, bucket);
    }
    bucket.count += 1;
    if (row.kind === "expense") bucket.expenseCents += row.amount_cents;
    else bucket.revenueCents += row.amount_cents;
  }
  return [...summary.values()].sort(
    (a, b) =>
      Math.abs(b.expenseCents) + Math.abs(b.revenueCents)
      - (Math.abs(a.expenseCents) + Math.abs(a.revenueCents)),
  );
}
