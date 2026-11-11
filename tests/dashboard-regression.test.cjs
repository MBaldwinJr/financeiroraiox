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

test("resultado acumulado subtrai CMV uma vez, sem somá-lo de volta", () => {
  const monthly = months();
  Object.assign(monthly[0], { revenue: 100000, expense: 70000, cmv: 50000, fixed: 20000 });
  Object.assign(monthly[1], { revenue: 80000, expense: 100000, cmv: 40000, fixed: 60000 });
  const cumulative = domain.accumulatedNetResult(monthly);
  assert.equal(cumulative[0], 30000);
  assert.equal(cumulative[1], 10000);
  assert.equal(cumulative[11], 10000);
  assert.equal(cumulative[11], domain.computeKpis(monthly, domain.selectedMonthIndices(null)).netProfit);
});

test("composição de pagamentos por período e regime não mistura meses", () => {
  const transactions = [
    tx({ competencia: "2026-01-12", amount_cents: 12000, payment_method: "pix" }),
    tx({ competencia: "2026-02-12", amount_cents: 34000, payment_method: "card" }),
    tx({ competencia: "2026-02-12", amount_cents: 90000, kind: "expense", payment_method: "pix" }),
    tx({ competencia: "2026-02-14", amount_cents: 70000, category: { is_balance_sheet: true }, payment_method: "pix" }),
  ];
  const paid = [
    { paid_at: "2026-01-12", amount_cents: 15000, payment_method: "boleto", category: { is_balance_sheet: false } },
    { paid_at: "2026-02-12", amount_cents: 7000, payment_method: "pix", category: { is_balance_sheet: false } },
    { paid_at: "2026-02-12", amount_cents: 9999, payment_method: "pix", category: { is_balance_sheet: true } },
  ];
  const jan = domain.paymentBreakdownForPeriod("accrual", 1, transactions, paid);
  const feb = domain.paymentBreakdownForPeriod("accrual", 2, transactions, paid);
  assert.equal(jan.pix, 12000);
  assert.equal(feb.card, 34000);
  assert.equal(feb.pix, 0);
  const cashFebruary = domain.paymentBreakdownForPeriod("cash", 2, transactions, paid);
  assert.equal(cashFebruary.pix, 7000);
  assert.equal(cashFebruary.boleto, 0);
  const yearly = domain.paymentBreakdownForPeriod("accrual", null, transactions, paid);
  assert.equal(yearly.pix, 12000);
  assert.equal(yearly.card, 34000);
  assert.equal(domain.paymentBreakdownForPeriod("erp_sales", null, transactions, paid).pix, 0);
});


test("visões mensais do snapshot anual reproduzem KPIs, pagamentos e comparações", () => {
  const transactions = [
    tx({ competencia: "2026-01-10", amount_cents: 120000, payment_method: "pix" }),
    tx({ competencia: "2026-01-13", kind: "expense", amount_cents: 40000, category: { dre_group: "cmv", is_balance_sheet: false } }),
    tx({ competencia: "2026-01-14", kind: "expense", amount_cents: 15000, category: { dre_group: "fixed", is_balance_sheet: false } }),
    tx({ competencia: "2026-02-10", amount_cents: 70000, payment_method: "card" }),
    tx({ competencia: "2026-02-12", kind: "expense", amount_cents: 32000, category: { dre_group: "cmv", is_balance_sheet: false } }),
    tx({ competencia: "2026-03-09", amount_cents: 700000, payment_method: "boleto", category: { dre_group: "revenue", is_balance_sheet: true } }),
  ];
  const monthly = domain.bucketTransactionsByMonth(transactions).monthly;
  const previousMonths = months();
  Object.assign(previousMonths[11], { revenue: 28000, expense: 11000, cmv: 8000, fixed: 3000 });
  const snapshots = domain.buildFinancialMonthViews(
    2026, "accrual", monthly, previousMonths, transactions, [], [], [],
  );
  assert.equal(snapshots.length, 12);
  for (let index = 0; index < 12; index++) {
    const month = index + 1;
    assert.deepEqual(snapshots[index].kpis, {
      ...domain.computeKpis(monthly, [index]),
      prev: domain.computePrevious(month, 2026, monthly, previousMonths),
    });
    assert.deepEqual(
      snapshots[index].byPayment,
      domain.paymentBreakdownForPeriod("accrual", month, transactions, []),
    );
    assert.deepEqual(snapshots[index].expenseComposition, domain.computeExpenseComposition(monthly, [index]));
    assert.equal(snapshots[index].periodActivity.hasSelectedPeriodData,
      domain.hasFinancialActivity("accrual", month, transactions, [], [], []));
    assert.equal(snapshots[index].periodActivity.hasYearData, true);
  }
  assert.equal(snapshots[0].kpis.netProfit, 65000);
  assert.equal(snapshots[1].kpis.netProfit, 38000);
  assert.equal(snapshots[10].periodActivity.hasSelectedPeriodData, false);
  assert.equal(snapshots[0].kpis.prev.revenue, 28000);
  assert.equal(snapshots[0].byPayment.pix, 120000);
  assert.equal(snapshots[1].byPayment.card, 70000);
  assert.equal(snapshots[2].byPayment.boleto, 0, "conta patrimonial não é receita");
});

test("projeções mensais respeitam regime caixa e ERP sem misturar meses", () => {
  const transactions = [
    tx({ competencia: "2026-01-07", amount_cents: 12000, payment_method: "pix" }),
  ];
  const paidRevenues = [
    { paid_at: "2026-03-10", amount_cents: 7000, payment_method: "boleto", category: { is_balance_sheet: false } },
    { paid_at: "2026-03-10", amount_cents: 9000, payment_method: "pix", category: { is_balance_sheet: true } },
  ];
  const paidExpenses = [
    { paid_at: "2026-03-14", amount_cents: 2500, category: { dre_group: "fixed", is_balance_sheet: false } },
  ];
  const cashMonths = domain.bucketTransactionsByMonth(transactions).monthly;
  domain.applyRevenueBasis(cashMonths, "cash", paidRevenues, []);
  domain.applyCashExpenses(cashMonths, paidExpenses);
  const cash = domain.buildFinancialMonthViews(
    2026, "cash", cashMonths, months(), transactions, paidRevenues, paidExpenses, [],
  );
  assert.equal(cash[0].kpis.grossRevenue, 0);
  assert.equal(cash[2].kpis.grossRevenue, 7000);
  assert.equal(cash[2].kpis.netProfit, 4500);
  assert.equal(cash[2].byPayment.boleto, 7000);
  assert.equal(cash[2].byPayment.pix, 0);
  assert.equal(cash[0].periodActivity.hasSelectedPeriodData, false);
  assert.equal(cash[2].periodActivity.hasSelectedPeriodData, true);

  const sales = [{ period_start: "2026-07-01", net_amount_cents: 40000, returns_cents: 2000 }];
  const erpMonths = domain.bucketTransactionsByMonth(transactions).monthly;
  domain.applyRevenueBasis(erpMonths, "erp_sales", [], sales);
  const erp = domain.buildFinancialMonthViews(
    2026, "erp_sales", erpMonths, months(), transactions, [], [], sales,
  );
  assert.equal(erp[6].kpis.grossRevenue, 38000);
  assert.equal(erp[0].kpis.grossRevenue, 0);
  assert.equal(erp[6].periodActivity.hasSelectedPeriodData, true);
  assert.equal(erp[9].periodActivity.hasSelectedPeriodData, false);
  assert.ok(erp.every((snapshot) => Object.values(snapshot.byPayment).every((value) => value === 0)));
});

test("um ano vazio mantém todos os meses sem atividade", () => {
  const monthly = months();
  const result = domain.buildFinancialMonthViews(2026, "accrual", monthly, months(), [], [], [], []);
  assert.equal(result.length, 12);
  assert.ok(result.every((snapshot) => !snapshot.periodActivity.hasSelectedPeriodData));
  assert.ok(result.every((snapshot) => !snapshot.periodActivity.hasYearData));
  assert.ok(result.every((snapshot) => snapshot.kpis.grossRevenue === 0));
});
