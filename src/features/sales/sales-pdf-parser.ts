import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ParsedSalesRow {
  readonly sellerCode: string | null;
  readonly sellerName: string;
  readonly netAmountCents: number;
  readonly returnsCents: number;
  readonly costCents: number;
  readonly itemsQty: number;
  readonly salesQty: number;
}

export interface ParsedSalesReport {
  readonly periodStart: string; // ISO yyyy-mm-dd
  readonly periodEnd: string;
  readonly rows: readonly ParsedSalesRow[];
  readonly totals: {
    readonly netAmountCents: number;
    readonly returnsCents: number;
    readonly costCents: number;
    readonly itemsQty: number;
    readonly salesQty: number;
  };
}

interface PdfTextItem {
  readonly str: string;
  readonly transform: readonly number[];
}

const PERIODO_RE =
  /Per[ií]odo\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/i;
const NUM_BR = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const INT_BR = /-?\d{1,3}(?:\.\d{3})*/g;

const parseBrDec = (s: string): number =>
  Number(s.replace(/\./g, "").replace(",", "."));
const parseBrInt = (s: string): number => Number(s.replace(/\./g, ""));

export async function parseSalesPdf(file: File): Promise<ParsedSalesReport> {
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
      const text = cells.map((c) => c.s).join(" ").replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
    }
  }

  let periodStart = "";
  let periodEnd = "";
  const rows: ParsedSalesRow[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (!periodStart) {
      const m = line.match(PERIODO_RE);
      if (m) {
        periodStart = `${m[3]}-${m[2]}-${m[1]}`;
        periodEnd = `${m[6]}-${m[5]}-${m[4]}`;
        continue;
      }
    }

    if (/^Totais\.\.?:?/i.test(line)) continue;
    if (/^(C[oó]digo|Nome|Relat[oó]rio|Abrang|Data|Pag\.|Per[ií]odo)/i.test(line))
      continue;

    // Need 3 decimal numbers (Vlr Liq, Trocas, Custo). Items/Vendas can be integers.
    const decs = [...line.matchAll(NUM_BR)];
    if (decs.length < 3) continue;

    // Take the LAST 3 decimal tokens as Vlr Liq, Trocas, Custo (in order).
    const lastThree = decs.slice(-3);
    const liq = parseBrDec(lastThree[0][0]);
    const trocas = parseBrDec(lastThree[1][0]);
    const custo = parseBrDec(lastThree[2][0]);

    // After custo, the remaining tail should contain Itens and Vendas as integers.
    const tailStart = (lastThree[2].index ?? 0) + lastThree[2][0].length;
    const tail = line.slice(tailStart);
    const ints = [...tail.matchAll(INT_BR)].map((m) => parseBrInt(m[0]));
    const itemsQty = ints[0] ?? 0;
    const salesQty = ints[1] ?? 0;

    // Name = everything before the first decimal token, optionally starting with a numeric code.
    const head = line.slice(0, decs[0].index ?? 0).trim();
    if (!head) continue;
    const codeMatch = head.match(/^(\d+)\s+(.+)$/);
    const sellerCode = codeMatch ? codeMatch[1] : null;
    const sellerName = (codeMatch ? codeMatch[2] : head).trim();
    if (!/[A-Za-zÀ-ÿ]/.test(sellerName)) continue;

    rows.push({
      sellerCode,
      sellerName,
      netAmountCents: Math.round(liq * 100),
      returnsCents: Math.round(trocas * 100),
      costCents: Math.round(custo * 100),
      itemsQty,
      salesQty,
    });
  }

  if (!periodStart) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    periodStart = `${yyyy}-${mm}-01`;
    periodEnd = `${yyyy}-${mm}-28`;
  }

  const totals = rows.reduce(
    (acc, r) => ({
      netAmountCents: acc.netAmountCents + r.netAmountCents,
      returnsCents: acc.returnsCents + r.returnsCents,
      costCents: acc.costCents + r.costCents,
      itemsQty: acc.itemsQty + r.itemsQty,
      salesQty: acc.salesQty + r.salesQty,
    }),
    { netAmountCents: 0, returnsCents: 0, costCents: 0, itemsQty: 0, salesQty: 0 },
  );

  return { periodStart, periodEnd, rows, totals };
}
