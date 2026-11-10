"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(relative, importer = require) {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "features", relative), "utf8",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)(importer, mod, mod.exports);
  return mod.exports;
}
const dreEngine = load("dre/dre-engine/dre-engine.domain.ts");
const { summarizeClassificationGaps } = load("dre/dre-audit.domain.ts", (specifier) => {
  if (specifier === "@/features/dre/dre-engine/dre-engine.domain") return dreEngine;
  throw new Error("Unexpected import: " + specifier);
});
const { buildFinanceAIContext } = load("ai-copilot/financial-context.domain.ts");

function snapshot() {
  return {
    totalsMatch: false, unclassifiedCount: 2,
    unclassifiedExpenseCents: 60000, unclassifiedRevenueCents: 0,
    comparisons: [
      { label: "Lucro Líquido", dreCents: 20000, managerialCents: 10000, deltaCents: -10000, matches: false },
    ],
  };
}
function month(revenue = 0, cmv = 0, expense = 0) {
  return {
    revenue, cmv, expense, fixed: expense - cmv, variable: 0,
    supplier: 0, freight: 0, operational: 0, other: 0,
  };
}
function params(overrides = {}) {
  return {
    year: 2026, month: 1, filtersApplied: true,
    transactionCount: 4,
    monthly: [month(100000, 30000, 90000), month(50000, 10000, 10000), ...Array.from({ length: 10 }, () => month())],
    kpis: {
      grossRevenue: 100000, cmv: 30000, grossProfit: 70000,
      totalRevenue: 100000, totalExpenses: 60000,
      operatingResult: 10000, netProfit: 10000, margin: 0.1,
    },
    reconciliation: snapshot(),
    categories: [{ name: "Outras Despesas", amountCents: 60000 }],
    ...overrides,
  };
}

test("contexto de IA explicita competência, escopo e divergência DRE", () => {
  const context = buildFinanceAIContext(params());
  assert.match(context, /COMPETÊNCIA/);
  assert.match(context, /Jan\/2026/);
  assert.match(context, /filtros financeiros aplicados/);
  assert.match(context, /diferença \(gerencial menos DRE\)/);
  assert.match(context, /há divergência entre DRE e gestão/);
  assert.match(context, /Outras Despesas/);
  assert.doesNotMatch(context, /Fev\/2026: Receita gerencial/);
});

test("janeiro sem registros não é apresentado como faturamento confirmado zero", () => {
  const context = buildFinanceAIContext(params({
    transactionCount: 0,
    monthly: Array.from({ length: 12 }, () => month()),
    kpis: { ...params().kpis, grossRevenue: 0, cmv: 0, grossProfit: 0, totalExpenses: 0, netProfit: 0, operatingResult: 0, margin: 0 },
    categories: [],
  }));
  assert.match(context, /sem movimentações registradas/);
  assert.match(context, /Não afirmar que houve faturamento zero/);
});

test("ano inteiro apresenta todas as competências sem misturar bases", () => {
  const context = buildFinanceAIContext(params({ month: null, filtersApplied: false }));
  assert.match(context, /Jan\/2026: Receita gerencial/);
  assert.match(context, /Fev\/2026: Receita gerencial/);
  assert.match(context, /todos os filtros financeiros vazios/);
  assert.match(context, /Caixa, competência e vendas ERP são bases diferentes/);
});

test("auditoria soma todas as linhas de categoria não mapeada e separa receita de despesa", () => {
  const expense = {
    amount_cents: 5000, kind: "expense",
    category: { id: "cat1", name: "Outras Despesas", dre_line: "nao_aplicavel", is_balance_sheet: false },
  };
  const rows = [
    expense, { ...expense, amount_cents: 6000 },
    { amount_cents: 4000, kind: "revenue", category: null },
    { amount_cents: 2000, kind: "expense", category: null },
    { amount_cents: 99999, kind: "expense", category: { ...expense.category, id: "cat2", is_balance_sheet: true } },
    { amount_cents: 9000, kind: "expense", category: { ...expense.category, id: "cat3", dre_line: "despesa_operacional" } },
  ];
  const summaries = summarizeClassificationGaps(rows);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].categoryName, "Outras Despesas");
  assert.equal(summaries[0].count, 2);
  assert.equal(summaries[0].expenseCents, 11000);
  assert.equal(summaries[1].categoryName, "Sem categoria");
  assert.equal(summaries[1].revenueCents, 4000);
  assert.equal(summaries[1].expenseCents, 2000);
  assert.equal(summaries[1].count, 2);
});
