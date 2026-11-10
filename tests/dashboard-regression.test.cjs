"use strict";

/**
 * Testa os próprios módulos TypeScript de domínio sem alterar a toolchain da aplicação.
 * Usa TypeScript já instalado como devDependency para transpilar CommonJS em memória.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const domainDir = path.join(__dirname, "..", "src", "features", "dashboard");
function loadDomain(fileName, cache = new Map()) {
  if (cache.has(fileName)) return cache.get(fileName).exports;
  const module = { exports: {} };
  cache.set(fileName, module);
  const source = fs.readFileSync(path.join(domainDir, fileName), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const customRequire = (specifier) => {
    if (specifier === "./dashboard.types") return loadDomain("dashboard.types.ts", cache);
    throw new Error("Import inesperado: " + specifier);
  };
  new Function("require", "module", "exports", js)(customRequire, module, module.exports);
  return module.exports;
}

const domain = loadDomain("dashboard.domain.ts");
const { emptyMonthBucket } = loadDomain("dashboard.types.ts");
const months = () => Array.from({ length: 12 }, () => emptyMonthBucket());
const tx = (partial) => ({
  date: "2026-01-31", competencia: "2026-02-01", kind: "revenue",
  amount_cents: 10000, payment_method: "pix",
  category: { dre_group: "revenue", is_balance_sheet: false },
  ...partial,
});

test("competência define o mês gerencial; não a data do lançamento", () => {
  const result = domain.bucketTransactionsByMonth([tx({})]);
  assert.equal(result.monthly[0].revenue, 0);
  assert.equal(result.monthly[1].revenue, 10000);
  assert.equal(result.byPayment.pix, 10000);
});

test("contas patrimoniais não entram no resultado gerencial", () => {
  const result = domain.bucketTransactionsByMonth([
    tx({ category: { dre_group: "revenue", is_balance_sheet: true } }),
    tx({ amount_cents: 2000 }),
  ]);
  assert.equal(result.monthly[1].revenue, 2000);
  assert.equal(result.byPayment.pix, 2000);
});

test("KPI de despesas exclui CMV uma única vez", () => {
  const b = months();
  Object.assign(b[3], { revenue: 15000, expense: 7000, cmv: 5000, fixed: 2000 });
  const kpi = domain.computeKpis(b, [3]);
  assert.equal(kpi.grossProfit, 10000);
  assert.equal(kpi.totalExpenses, 2000);
  assert.equal(kpi.netProfit, 8000);
  assert.equal(kpi.margin, 8000 / 15000);
});

test("comparação com mês anterior usa despesas sem CMV", () => {
  const curr = months(), prev = months();
  Object.assign(curr[2], { revenue: 9000, expense: 5000, cmv: 3000, fixed: 2000 });
  const p = domain.computePrevious(4, 2026, curr, prev);
  assert.deepEqual(p, { revenue: 9000, expense: 2000, netProfit: 4000 });
});

test("janeiro compara dezembro do ano anterior", () => {
  const curr = months(), prev = months();
  Object.assign(prev[11], { revenue: 19000, expense: 8000, cmv: 3000, operational: 5000 });
  assert.deepEqual(domain.computePrevious(1, 2026, curr, prev), {
    revenue: 19000, expense: 5000, netProfit: 11000,
  });
});

test("ano completo compara o ano anterior completo", () => {
  const curr = months(), prev = months();
  Object.assign(prev[0], { revenue: 1000, expense: 200, cmv: 100, fixed: 100 });
  Object.assign(prev[11], { revenue: 5000, expense: 1000, cmv: 400, fixed: 600 });
  assert.deepEqual(domain.computePrevious(null, 2026, curr, prev), {
    revenue: 6000, expense: 700, netProfit: 4800,
  });
});

test("regime caixa agrega por paid_at, preservando competência separada", () => {
  const b = months();
  b[0].revenue = 5000;
  domain.applyRevenueBasis(b, "cash", [
    { paid_at: "2026-03-10", amount_cents: 2000, category: { is_balance_sheet: false } },
    { paid_at: "2026-03-10", amount_cents: 6000, category: { is_balance_sheet: true } },
  ], []);
  assert.equal(b[0].revenue, 0);
  assert.equal(b[2].revenue, 2000);
  domain.applyCashExpenses(b, [
    { paid_at: "2026-03-12", amount_cents: 1000, category: { dre_group: "fixed", is_balance_sheet: false } },
    { paid_at: "2026-03-12", amount_cents: 4000, category: { dre_group: "fixed", is_balance_sheet: true } },
  ]);
  assert.equal(b[2].expense, 1000);
  assert.equal(b[2].fixed, 1000);
});

test("vendas ERP substituem a receita, sem somar lançamentos", () => {
  const b = months();
  b[0].revenue = 8000;
  domain.applyRevenueBasis(b, "erp_sales", [], [
    { period_start: "2026-01-01", net_amount_cents: 12000, returns_cents: 2000 },
  ]);
  assert.equal(b[0].revenue, 10000);
});

test("resumo vazio em novembro não se confunde com atividade anual", () => {
  const rows = [
    tx({ competencia: "2026-01-06" }),
    tx({ competencia: "2026-10-15", amount_cents: 0 }),
  ];
  assert.equal(domain.hasFinancialActivity("accrual", 11, rows, [], [], []), false);
  assert.equal(domain.hasFinancialActivity("accrual", null, rows, [], [], []), true);
  assert.equal(domain.hasFinancialActivity("accrual", 10, rows, [], [], []), true);
});

test("ausência no caixa utiliza liquidação, sem contar itens patrimoniais", () => {
  const rows = [tx({ competencia: "2026-11-01" })];
  const paid = [
    { paid_at: "2026-11-05", amount_cents: 900, category: { is_balance_sheet: true } },
    { paid_at: "2026-10-05", amount_cents: 1000, category: { is_balance_sheet: false } },
  ];
  assert.equal(domain.hasFinancialActivity("cash", 11, rows, paid, [], []), false);
  assert.equal(domain.hasFinancialActivity("cash", 10, rows, paid, [], []), true);
});

test("vendas ERP respeitam o mês da venda; despesas continuam por competência", () => {
  const expenses = [tx({
    kind: "expense", competencia: "2026-09-01", amount_cents: 300,
    category: { dre_group: "fixed", is_balance_sheet: false },
  })];
  const sales = [{ period_start: "2026-08-01", net_amount_cents: 1500, returns_cents: 0 }];
  assert.equal(domain.hasFinancialActivity("erp_sales", 11, expenses, [], [], sales), false);
  assert.equal(domain.hasFinancialActivity("erp_sales", 9, expenses, [], [], sales), true);
  assert.equal(domain.hasFinancialActivity("erp_sales", 8, expenses, [], [], sales), true);
});
