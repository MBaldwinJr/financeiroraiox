"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(relativePath, importer = require) {
  const file = path.join(__dirname, "..", "src", "features", relativePath);
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)(importer, mod, mod.exports);
  return mod.exports;
}

const { buildCashMovementMonths } = load("cashflow/cashflow.domain.ts");
const types = load("dashboard/dashboard.types.ts");
const dashboard = load("dashboard/dashboard.domain.ts", (specifier) => {
  if (specifier === "./dashboard.types") return types;
  throw new Error("Unexpected import: " + specifier);
});

const receipt = (paid_at, amount_cents, category = { is_balance_sheet: false }) => ({
  paid_at, amount_cents, payment_method: "pix", category,
});
const payment = (paid_at, amount_cents, dre_group, is_balance_sheet) => ({
  paid_at, amount_cents,
  category: { dre_group, is_balance_sheet },
});

test("fornecedores entram em saídas liquidadas mas não alteram a DRE por competência", () => {
  const cash = buildCashMovementMonths(
    [receipt("2026-02-10", 120000)],
    [
      payment("2026-02-11", 65000, "supplier", true),
      payment("2026-02-12", 10000, "fixed", false),
      payment("2026-02-13", 40000, "cmv", false),
      payment("2026-02-14", 8000, "variable", true),
    ],
  );
  assert.equal(cash[1].receiptsCents, 120000);
  assert.equal(cash[1].supplierPaymentsCents, 65000);
  assert.equal(cash[1].operatingPaymentsCents, 10000);
  assert.equal(cash[1].otherPatrimonialPaymentsCents, 8000);
  assert.equal(cash[1].cmvExcludedCents, 40000);
  assert.equal(cash[1].cmvExcludedCount, 1);
  assert.equal(cash[1].outflowsCents, 83000);
  assert.equal(cash[1].receiptsCents - cash[1].outflowsCents, 37000);

  const txs = [
    { date: "2026-02-10", competencia: "2026-02-10", amount_cents: 120000,
      kind: "revenue", payment_method: "pix",
      category: { dre_group: "revenue", is_balance_sheet: false } },
    { date: "2026-02-12", competencia: "2026-02-12", amount_cents: 65000,
      kind: "expense", payment_method: "pix",
      category: { dre_group: "supplier", is_balance_sheet: true } },
    { date: "2026-02-13", competencia: "2026-02-13", amount_cents: 40000,
      kind: "expense", payment_method: "pix",
      category: { dre_group: "cmv", is_balance_sheet: false } },
    { date: "2026-02-14", competencia: "2026-02-14", amount_cents: 10000,
      kind: "expense", payment_method: "pix",
      category: { dre_group: "fixed", is_balance_sheet: false } },
  ];
  const monthly = dashboard.bucketTransactionsByMonth(txs).monthly;
  const kpis = dashboard.computeKpis(monthly, [1]);
  assert.equal(kpis.grossRevenue, 120000);
  assert.equal(kpis.cmv, 40000);
  assert.equal(kpis.grossProfit, 80000);
  assert.equal(kpis.totalExpenses, 10000);
  assert.equal(kpis.netProfit, 70000);
  assert.equal(kpis.grossRevenue - kpis.cmv - kpis.totalExpenses, kpis.netProfit);
});

test("CMV pago é excluído mesmo se categorizado como patrimonial, sem dupla contagem", () => {
  const months = buildCashMovementMonths([], [
    payment("2026-04-07", 25000, "cmv", false),
    payment("2026-04-08", 9000, "cmv", true),
    payment("2026-04-15", 12000, "supplier", true),
  ]);
  assert.equal(months[3].cmvExcludedCents, 34000);
  assert.equal(months[3].cmvExcludedCount, 2);
  assert.equal(months[3].supplierPaymentsCents, 12000);
  assert.equal(months[3].outflowsCents, 12000);
});

test("movimentos usam data de liquidação e incluem outros pagamentos patrimoniais", () => {
  const paid = [
    payment("2026-03-01", 5300, "fixed", false),
    payment("2026-04-01", 7500, "variable", true),
    payment("2026-04-11", 1100, "supplier", true),
  ];
  const months = buildCashMovementMonths(
    [receipt("2026-04-03", 2000, { is_balance_sheet: true })],
    paid,
  );
  assert.equal(months[2].outflowsCents, 5300);
  assert.equal(months[3].outflowsCents, 8600);
  assert.equal(months[3].otherPatrimonialPaymentsCents, 7500);
  assert.equal(months[3].supplierPaymentsCents, 1100);
  assert.equal(months[3].receiptsCents, 2000);
});

test("nenhum pagamento e categoria desconhecida não inventam CMV ou fornecedores", () => {
  const months = buildCashMovementMonths([], [
    { paid_at: "2026-10-01", amount_cents: 1500, category: null },
    { paid_at: "", amount_cents: 300, category: { dre_group: "supplier", is_balance_sheet: true } },
  ]);
  assert.equal(months.length, 12);
  assert.equal(months[9].operatingPaymentsCents, 1500);
  assert.equal(months[9].supplierPaymentsCents, 0);
  assert.equal(months[9].outflowsCents, 1500);
  assert.equal(months.reduce((sum, bucket) => sum + bucket.outflowsCents, 0), 1500);
});

test("total anual de saídas corresponde exatamente à soma das três origens e exclui CMV", () => {
  const months = buildCashMovementMonths(
    [receipt("2026-01-11", 120000), receipt("2026-02-11", 80000)],
    [payment("2026-01-11", 33000, "supplier", true),
     payment("2026-01-12", 11000, "fixed", false),
     payment("2026-02-11", 12000, "other", true),
     payment("2026-02-15", 54000, "cmv", false)],
  );
  const sum = (key) => months.reduce((total, month) => total + month[key], 0);
  assert.equal(sum("receiptsCents"), 200000);
  assert.equal(sum("supplierPaymentsCents"), 33000);
  assert.equal(sum("operatingPaymentsCents"), 11000);
  assert.equal(sum("otherPatrimonialPaymentsCents"), 12000);
  assert.equal(sum("outflowsCents"), 56000);
  assert.equal(sum("cmvExcludedCents"), 54000);
  assert.equal(sum("outflowsCents"), sum("supplierPaymentsCents") +
    sum("operatingPaymentsCents") + sum("otherPatrimonialPaymentsCents"));
});
