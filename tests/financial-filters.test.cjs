"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const filename = path.join(__dirname, "..", "src", "lib", "financial-filters.ts");
const source = fs.readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);
const { financialFiltersSchema, financialFiltersKey, selectFinancialFilters, hasFinancialFilters, applyFinancialFilters } = mod.exports;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("contrato rejeita UUID e forma de pagamento inválidos", () => {
  assert.equal(financialFiltersSchema.safeParse({ categoryIds: ["not-uuid"] }).success, false);
  assert.equal(financialFiltersSchema.safeParse({ paymentMethods: ["bitcoin"] }).success, false);
  assert.equal(financialFiltersSchema.safeParse({ categoryIds: [A] }).success, true);
});

test("seleção do Zustand usa apenas métodos reconhecidos", () => {
  assert.deepEqual(selectFinancialFilters({
    categoryIds: [A], costCenterIds: [], bankAccountIds: [], partyIds: [],
    paymentMethods: ["pix", "invalid"],
  }).paymentMethods, ["pix"]);
});

test("chave de cache inclui todos os filtros sem depender da ordem", () => {
  const a = financialFiltersKey({ categoryIds: [A, B], paymentMethods: ["pix"] });
  const b = financialFiltersKey({ categoryIds: [B, A], paymentMethods: ["pix"] });
  const c = financialFiltersKey({ categoryIds: [A, B], paymentMethods: ["boleto"] });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("builder filtra todas as dimensões na consulta SQL", () => {
  const calls = [];
  const builder = { in(column, values) { calls.push([column, values]); return this; } };
  assert.equal(applyFinancialFilters(builder, {
    categoryIds: [A], costCenterIds: [B], bankAccountIds: [A],
    partyIds: [B], paymentMethods: ["pix"],
  }), builder);
  assert.deepEqual(calls.map(([name]) => name),
    ["category_id", "cost_center_id", "bank_account_id", "party_id", "payment_method"]);
  assert.equal(calls[0][1][0], A);
});

test("seleção vazia não altera query e sinaliza ausência de filtros", () => {
  const empty = { categoryIds: [], costCenterIds: [], bankAccountIds: [], partyIds: [], paymentMethods: [] };
  assert.equal(hasFinancialFilters(empty), false);
  const builder = { in() { throw new Error("não devia aplicar"); } };
  assert.equal(applyFinancialFilters(builder, empty), builder);
  assert.equal(hasFinancialFilters({ bankAccountIds: [A] }), true);
});
