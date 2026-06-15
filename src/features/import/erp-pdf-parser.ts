import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ErpParsedRow {
  date: string;
  description: string;
  amountCents: number;
  rawAmount: number;
  kind: "revenue" | "expense";
  erpCode: string;
  erpName: string;
  partyName: string | null;
  docNumber: string | null;
}

const ACCOUNT_RE = /^(\d{2}(?:\.\d{3}(?:\.\d{3})?)?)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^]+)$/;
const DATE_RE = /(\d{2})\/(\d{2})\/(\d{4})/;
// Capture EVERY monetary token on the line so we can pick the correct column.
// In ERP "Razão / Plano de Contas" reports the LAST token is the running
// balance (saldo) — never the entry amount.
const AMOUNT_GLOBAL_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const FORN_RE = /Forn:\s*\d+\s*-\s*(.+?)(?:\s{2,}|\s+)(\S+)\s*(?:Hist:)?\s*$/i;

function parseBr(num: string): number {
  return Number(num.replace(/\./g, "").replace(",", "."));
}

interface PdfTextItem {
  readonly str: string;
  readonly transform: readonly number[];
}

export async function parseErpPdf(file: File): Promise<ErpParsedRow[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byRow = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as unknown as PdfTextItem[]) {
      if (!item.str) continue;
      const y = Math.round((item.transform[5] ?? 0) * 2) / 2;
      const x = item.transform[4] ?? 0;
      if (!byRow.has(y)) byRow.set(y, []);
      byRow.get(y)!.push({ x, s: item.str });
    }
    const sortedY = [...byRow.keys()].sort((a, b) => b - a);
    for (const y of sortedY) {
      const cells = byRow.get(y)!.sort((a, b) => a.x - b.x);
      const text = cells
        .map((c) => c.s)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) lines.push(text);
    }
  }

  return extractRows(lines);
}

function shouldSkip(line: string): boolean {
  return (
    /^Total da Conta/i.test(line) ||
    /^Sub-?Total/i.test(line) ||
    /^Relatório:/i.test(line) ||
    /^Pag\./i.test(line) ||
    /^Codigo\b/i.test(line) ||
    /^Detalhe\b/i.test(line) ||
    /Emitido em/i.test(line) ||
    /Relação do Plano/i.test(line)
  );
}

function extractRows(lines: string[]): ErpParsedRow[] {
  const rows: ErpParsedRow[] = [];
  let section: "revenue" | "expense" | null = null;
  let currentCode = "";
  let currentName = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^RECEITAS:?$/i.test(line)) {
      section = "revenue";
      continue;
    }
    if (/^DESPESAS:?$/i.test(line)) {
      section = "expense";
      continue;
    }
    if (shouldSkip(line)) continue;

    const dateMatch = line.match(DATE_RE);
    const amounts = [...line.matchAll(AMOUNT_GLOBAL_RE)];

    // Account header: starts with code, no date on the same line
    if (!dateMatch) {
      const acct = line.match(ACCOUNT_RE);
      if (acct) {
        currentCode = acct[1];
        currentName = acct[2].trim();
      }
      continue;
    }

    if (!amounts.length || !currentCode || !section) continue;

    const [, dd, mm, yyyy] = dateMatch;
    const iso = `${yyyy}-${mm}-${dd}`;

    // Pick the transaction amount:
    //  - 1 monetary token  → that is the entry value
    //  - 2+ monetary tokens → the LAST is the running balance (saldo);
    //                         the one immediately before it is the entry value
    const entryToken = amounts.length === 1 ? amounts[0] : amounts[amounts.length - 2];
    const value = parseBr(entryToken[0]);
    const entryStart = entryToken.index ?? line.length;

    // Description = all non-monetary text after the date. Some ERP PDFs place
    // "Forn: ... Doc ... Hist:" after the value columns; using only the text
    // before the first amount loses the supplier/document and breaks dedupe.
    const dateEnd = (dateMatch.index ?? 0) + dateMatch[0].length;
    const firstAmountStart = amounts[0].index ?? entryStart;
    const afterDateWithoutAmounts = line
      .slice(dateEnd)
      .replace(AMOUNT_GLOBAL_RE, " ")
      .replace(/\s+/g, " ")
      .trim();
    const middle = line.slice(dateEnd, firstAmountStart).trim();
    const before = line.slice(0, dateMatch.index).trim();
    const descSource = afterDateWithoutAmounts || middle || before;

    let description = descSource;
    let partyName: string | null = null;
    let docNumber: string | null = null;

    const forn = descSource.match(FORN_RE);
    if (forn) {
      partyName = forn[1].trim();
      docNumber = forn[2].trim();
      description = partyName + (docNumber ? ` — Doc ${docNumber}` : "");
    } else {
      const docTrail = descSource.match(/^(.+?)\s+(\d{4,})\s*$/);
      if (docTrail) {
        description = docTrail[1].trim();
        docNumber = docTrail[2];
      }
    }

    rows.push({
      date: iso,
      description: (description || currentName).slice(0, 280),
      amountCents: Math.round(Math.abs(value) * 100),
      rawAmount: value,
      kind: section,
      erpCode: currentCode,
      erpName: currentName,
      partyName,
      docNumber,
    });
  }
  return rows;
}
