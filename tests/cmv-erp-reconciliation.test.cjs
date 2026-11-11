"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "features", "inventory", "cmv-reconciliation.domain.ts"), "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", js)(require, mod, mod.exports);
const { reconcileCmvSources } = mod.exports;

const costs = Array(12).fill(0);
const entries = Array(12).fill(0);
const sale = (start, end, cents) => ({ period_start: start, period_end: end, cost_cents: cents });
const snapshot = (date, cents = 1000000) => ({ snapshot_date: date, cost_cents: cents });

test("soma custo por vendedor e mostra diferenças em centavos sem chamar equivalência de auditoria", () => {
  const dre = [...costs], count = [...entries];
  dre[0] = 150001; count[0] = 1;
  dre[1] = 200000; count[1] = 1;
  dre[4] = 120000; count[4] = 1;
  const sales = [
    sale("2026-01-01", "2026-01-31", 100000),
    sale("2026-01-01", "2026-01-31", 50000),
    sale("2026-02-01", "2026-02-28", 200000),
    sale("2026-05-01", "2026-05-31", 115000),
  ];
  const result = reconcileCmvSources(2026, dre, count, sales, [
    snapshot("2026-01-31"),
    snapshot("2026-02-20"),
  ]);
  assert.equal(result.monthly[0].importedCostCents, 150000);
  assert.equal(result.monthly[0].differenceCents, 1);
  assert.equal(result.monthly[0].status, "cent_difference");
  assert.equal(result.monthly[1].status, "totals_equal");
  assert.equal(result.monthly[4].status, "investigate");
  assert.equal(result.monthly[4].differenceCents, 5000);
  assert.equal(result.monthly[0].inventoryClosingSnapshotDate, "2026-01-31");
  assert.equal(result.monthly[1].inventoryClosingSnapshotDate, null);
  assert.equal(result.monthly[1].latestInventorySnapshotDate, "2026-02-20");
  assert.equal(result.comparableMonths, 3);
  assert.equal(result.flaggedMonths, 1);
});

test("reconciliação de PDF parcial não inventa fechamento do período", () => {
  const dre = [...costs], count = [...entries];
  dre[2] = 40000; count[2] = 1;
  const result = reconcileCmvSources(2026, dre, count, [
    sale("2026-03-01", "2026-03-15", 40000),
  ], []);
  assert.equal(result.monthly[2].reportCoversCalendarMonth, false);
  assert.equal(result.monthly[2].status, "partial_period");
  assert.equal(result.comparableMonths, 0);
});

test("ausência de PDF não é custo zero", () => {
  const dre = [...costs], count = [...entries];
  dre[9] = 500000; count[9] = 1;
  const result = reconcileCmvSources(2026, dre, count, [], []);
  assert.equal(result.monthly[9].status, "missing_pdf");
  assert.equal(result.monthly[9].importedCostCents, null);
  assert.equal(result.monthly[9].differenceCents, null);
  assert.equal(result.missingPdfMonths, 12);
  assert.equal(result.missingInventoryClosings, 12);
});

test("vendas sem linha de CMV não podem ser consideradas conciliadas", () => {
  const result = reconcileCmvSources(2026, costs, entries, [
    sale("2026-07-01", "2026-07-31", 70000),
  ], []);
  assert.equal(result.monthly[6].status, "missing_dre");
  assert.equal(result.monthly[6].differenceCents, -70000);
  assert.equal(result.comparableMonths, 0);
});

test("fevereiro bissexto exige dia correto e dados de outros anos não contam", () => {
  const dre = [...costs], count = [...entries];
  dre[1] = 90000; count[1] = 1;
  const result = reconcileCmvSources(2028, dre, count, [
    sale("2028-02-01", "2028-02-29", 90000),
    sale("2027-02-01", "2027-02-28", 500000),
  ], [snapshot("2028-02-28"), snapshot("2028-02-29")]);
  assert.equal(result.monthly[1].status, "totals_equal");
  assert.equal(result.monthly[1].importedCostCents, 90000);
  assert.equal(result.monthly[1].inventoryClosingSnapshotDate, "2028-02-29");
});

test("rejeita série parcial para não produzir totais comparativos incorretos", () => {
  assert.throws(() => reconcileCmvSources(2026, [1, 2], [], [], []), /doze competências/);
});
