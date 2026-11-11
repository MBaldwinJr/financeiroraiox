"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(
  path.join(__dirname, "..", "src", "features", "dre", "dre-review-signals.domain.ts"),
  "utf8",
);
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", js)(require, mod, mod.exports);
const { inferReviewSignal, summarizeReviewSignals, reviewSignalInfo } = mod.exports;

test("rotativo, taxas, devoluções e permutas são apenas sinais de análise", () => {
  assert.equal(inferReviewSignal("Crédito em Rotativo"), "credit_operations");
  assert.equal(inferReviewSignal("TAXAS ADQUIRENCIA"), "fees");
  assert.equal(inferReviewSignal("Tarifa bancária"), "fees");
  assert.equal(inferReviewSignal("Devolução Cliente"), "returns");
  assert.equal(inferReviewSignal("Estorno de venda"), "returns");
  assert.equal(inferReviewSignal("Permuta de bens"), "barter");
  assert.equal(inferReviewSignal("Compra de material diverso"), "unresolved");
  assert.equal(inferReviewSignal(null), "unresolved");
});

test("classificação textual respeita acentos, caixa e prioridade exclusiva", () => {
  assert.equal(inferReviewSignal("crédito rotativo - tarifa"), "credit_operations");
  assert.equal(inferReviewSignal("TÁRIFA DE CARTÃO"), "fees");
  assert.equal(inferReviewSignal("PERMÚTA E DEVOLUÇÃO"), "returns");
});

test("grupo de revisão soma centavos e quantidades sem duplicar registros", () => {
  const rows = [
    { description: "Rotativo", kind: "expense", amount_cents: 5501 },
    { description: "crédito em rotativo", kind: "expense", amount_cents: 4499 },
    { description: "TAXA", kind: "expense", amount_cents: 1400 },
    { description: "Taxa", kind: "revenue", amount_cents: 200 },
    { description: "Devolução", kind: "expense", amount_cents: 800 },
    { description: "Permuta", kind: "expense", amount_cents: 2300 },
    { description: "Outros", kind: "expense", amount_cents: 700 },
  ];
  const result = summarizeReviewSignals(rows);
  assert.equal(result.reduce((v, row) => v + row.count, 0), rows.length);
  assert.equal(result.reduce((v, row) => v + row.expenseCents, 0), 15200);
  assert.equal(result.reduce((v, row) => v + row.revenueCents, 0), 200);
  const rotativo = result.find((v) => v.signal === "credit_operations");
  assert.equal(rotativo.count, 2);
  assert.equal(rotativo.expenseCents, 10000);
  assert.equal(result[0].signal, "credit_operations");
});

test("texto de revisão não recomenda classificação automática", () => {
  assert.match(reviewSignalInfo("credit_operations").reviewQuestion, /principal, juros/);
  assert.match(reviewSignalInfo("barter").reviewQuestion, /documentos fiscais/);
  assert.match(reviewSignalInfo("unresolved").reviewQuestion, /natureza econômica/);
});

test("coleções vazias não inventam valores", () => {
  assert.deepEqual(summarizeReviewSignals([]), []);
});

test("cada tipo de sinal exige documentação antes de qualquer classificação", () => {
  for (const signal of ["credit_operations", "fees", "returns", "barter", "unresolved"]) {
    const item = reviewSignalInfo(signal);
    assert.ok(item.evidenceToCheck.length >= 3);
    assert.ok(item.evidenceToCheck.every((document) => typeof document === "string" && document.length > 8));
  }
});
