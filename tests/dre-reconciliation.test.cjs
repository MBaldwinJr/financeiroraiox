"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "features", "dre", "reconciliation.domain.ts"),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", js)(require, mod, mod.exports);
const { buildReconciliationSnapshot } = mod.exports;
function matrix(overrides = {}) {
  const row = (jan, feb = 0) => ({
    monthly: [jan, feb, ...Array(10).fill(0)],
    total: jan + feb,
  });
  return {
    receita_bruta: row(10000, 5000),
    cmv: row(3000, 2000),
    lucro_bruto: row(7000, 3000),
    lucro_liquido: row(4000, 1000),
    ...overrides,
  };
}
function kpis(revenue = 10000, cmv = 3000, profit = 4000) {
  return {
    grossRevenue: revenue, cmv, grossProfit: revenue - cmv,
    totalRevenue: revenue, totalExpenses: revenue - profit - cmv,
    operatingResult: profit, netProfit: profit, margin: revenue > 0 ? profit / revenue : 0,
  };
}
function tx(competencia, category = { dre_line: "receita_bruta", is_balance_sheet: false }) {
  return { competencia, amount_cents: 1200, category };
}
test("mês correto compara quatro métricas do mesmo período", () => {
  const result = buildReconciliationSnapshot(2026, 1, matrix(), kpis(), [tx("2026-01-10")]);
  assert.equal(result.month, 1);
  assert.equal(result.totalsMatch, true);
  assert.equal(result.hasUnclassified, false);
  assert.equal(result.periodTransactionCount, 1);
  assert.equal(result.comparisons.length, 4);
});
test("diferenças preservam sinal gerencial menos DRE", () => {
  const result = buildReconciliationSnapshot(2026, 1, matrix(), kpis(9000, 3000, 3000), []);
  assert.equal(result.totalsMatch, false);
  assert.equal(result.comparisons[0].deltaCents, -1000);
  assert.equal(result.comparisons[3].deltaCents, -1000);
});
test("classificação ausente alerta mesmo com totais idênticos", () => {
  const result = buildReconciliationSnapshot(
    2026, 1, matrix(), kpis(),
    [tx("2026-01-01", null), tx("2026-01-12", { dre_line: null, is_balance_sheet: false })],
  );
  assert.equal(result.totalsMatch, true);
  assert.equal(result.unclassifiedCount, 2);
  assert.equal(result.unclassifiedCents, 2400);
  assert.equal(result.hasUnclassified, true);
});
test("contas patrimoniais não são classificadas como pendência da DRE", () => {
  const result = buildReconciliationSnapshot(2026, 1, matrix(), kpis(), [
    tx("2026-01-10", { dre_line: null, is_balance_sheet: true }),
  ]);
  assert.equal(result.unclassifiedCount, 0);
});
test("período anual soma meses sem pegar registros de meses não selecionados", () => {
  const result = buildReconciliationSnapshot(2026, null, matrix(), kpis(15000, 5000, 5000), [
    tx("2026-01-05"), tx("2026-02-12"),
  ]);
  assert.equal(result.totalsMatch, true);
  assert.equal(result.periodTransactionCount, 2);
  assert.equal(result.comparisons[3].dreCents, 5000);
});
