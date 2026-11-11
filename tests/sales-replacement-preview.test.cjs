"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(file, importer = require) {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "features", "sales", file), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)(importer, module, module.exports);
  return module.exports;
}
const identity = load("sales-import-integrity.domain.ts");
const { createSalesReplacementPreview } = load(
  "sales-replacement-preview.domain.ts",
  (specifier) => {
    if (specifier === "./sales-import-integrity.domain") return identity;
    return require(specifier);
  },
);
const company = "test-company";
const first = "2026-05-01";
const end = "2026-05-31";
const newSale = (sellerName, netAmountCents, costCents, returnsCents = 0) => ({
  sellerName, sellerCode: null,
  netAmountCents, costCents, returnsCents, itemsQty: 10, salesQty: 5,
});
const oldSale = (id, name, net, cost, returns = 0) => ({
  id, seller_name: name, seller_code: null, period_end: end,
  net_amount_cents: net, cost_cents: cost, returns_cents: returns,
  items_qty: 10, sales_qty: 5, source_file: "synthetic.pdf",
  imported_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
});

test("prévia conserva centavos e contabiliza removidos, adicionados e alterados", () => {
  const prev = [oldSale("a", "Ana", 150000, 90000, 10000), oldSale("b", "Beto", 200000, 130000)];
  const next = [newSale("Ana", 160000, 94000, 15000), newSale("Carla", 120000, 85000)];
  const prevSnapshot = structuredClone(prev);
  const nextSnapshot = structuredClone(next);
  const report = createSalesReplacementPreview(company, first, end, prev, next);
  assert.equal(report.previous.sellers, 2);
  assert.equal(report.proposed.sellers, 2);
  assert.equal(report.previous.costCents, 220000);
  assert.equal(report.proposed.costCents, 179000);
  assert.equal(report.difference.costCents, -41000);
  assert.equal(report.previous.netAfterReturnsCents, 340000);
  assert.equal(report.proposed.netAfterReturnsCents, 265000);
  assert.equal(report.difference.netAfterReturnsCents, -75000);
  assert.equal(report.difference.contributionCents, -34000);
  assert.deepEqual(report.differences.map((x) => x.change), ["modified", "removed", "added"]);
  assert.equal(report.replacementEnabled, false);
  assert.equal(report.hasExistingPeriod, true);
  assert.deepEqual(prev, prevSnapshot);
  assert.deepEqual(next, nextSnapshot);
});

test("prévia distingue dados iguais de custos alterados", () => {
  const prev = [oldSale("a", "Ana", 150000, 90000)];
  const result = createSalesReplacementPreview(company, first, end, prev, [
    newSale("Ana", 150000, 90000),
  ]);
  assert.equal(result.differences[0].change, "unchanged");
  assert.equal(result.difference.costCents, 0);
  assert.equal(result.difference.contributionCents, 0);
});

test("grafia diferente é mostrada como risco e não é mesclada silenciosamente", () => {
  const report = createSalesReplacementPreview(company, first, end,
    [oldSale("a", "JOÃO TESTE", 100000, 50000)],
    [newSale("João Teste", 100000, 50000)],
  );
  assert.equal(report.spellingChanges, 1);
  assert.deepEqual(report.differences.map((x) => x.change), ["removed", "added"]);
  assert.equal(report.difference.costCents, 0);
});

test("preview de mês novo é somente leitura e não propõe apagar dados", () => {
  const report = createSalesReplacementPreview(company, first, end, [], [
    newSale("Ana", 140000, 80000),
  ]);
  assert.equal(report.previous.costCents, 0);
  assert.equal(report.hasExistingPeriod, false);
  assert.equal(report.difference.costCents, 80000);
  assert.equal(report.replacementEnabled, false);
});

test("token muda com empresa, arquivo proposto e registros existentes", () => {
  const before = [oldSale("a", "Ana", 100000, 60000)];
  const next = [newSale("Ana", 100000, 65000)];
  const base = createSalesReplacementPreview(company, first, end, before, next).snapshotToken;
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.notEqual(base, createSalesReplacementPreview("another-company", first, end, before, next).snapshotToken);
  assert.notEqual(base, createSalesReplacementPreview(company, first, end, before, [newSale("Ana", 110000, 65000)]).snapshotToken);
  assert.notEqual(base, createSalesReplacementPreview(company, first, end, [{ ...before[0], updated_at: "2026-06-02T00:00:00Z" }], next).snapshotToken);
  assert.equal(base, createSalesReplacementPreview(company, first, end, before, next).snapshotToken);
});

test("é proibido comparar uma importação inválida ou sem vendedor", () => {
  assert.throws(() => createSalesReplacementPreview(company, "", end, [], [newSale("Ana", 100, 80)]), /Período/);
  assert.throws(() => createSalesReplacementPreview(company, first, end, [], []), /não contém vendedores/);
  assert.throws(() => createSalesReplacementPreview(company, first, end, [], [
    newSale(" João ", 100, 80), newSale("JOAO", 100, 80),
  ]), /nomes repetidos/);
});
