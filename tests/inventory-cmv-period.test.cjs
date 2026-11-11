"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(
  __dirname, "..", "src", "features", "inventory", "inventory-period.domain.ts",
), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", transpiled)(require, mod, mod.exports);
const { inventoryAsOfWindow } = mod.exports;

test("ano atual inclui hoje até amanhã, sem cortar o dia corrente", () => {
  const w = inventoryAsOfWindow(2026, "2026-11-10");
  assert.equal(w.start, "2026-01-01");
  assert.equal(w.end, "2027-01-01");
  assert.equal(w.upperExclusive, "2026-11-11");
  assert.ok(w.daysElapsed > 300 && w.daysElapsed < 365);
});

test("ano anterior não herda CMV ou estoque do ano atual", () => {
  const w = inventoryAsOfWindow(2025, "2026-11-10");
  assert.equal(w.upperExclusive, "2026-01-01");
  assert.equal(w.daysElapsed, 365);
});

test("ano futuro não inventa CMV nem contagem de dias", () => {
  const w = inventoryAsOfWindow(2027, "2026-11-10");
  assert.equal(w.upperExclusive, "2027-01-01");
  assert.equal(w.daysElapsed, 0);
});

test("ano bissexto tem 366 dias e inclui 29 de fevereiro", () => {
  const feb = inventoryAsOfWindow(2028, "2028-02-29");
  assert.equal(feb.upperExclusive, "2028-03-01");
  assert.equal(feb.daysElapsed, 60);
  const end = inventoryAsOfWindow(2028, "2030-01-11");
  assert.equal(end.upperExclusive, "2029-01-01");
  assert.equal(end.daysElapsed, 366);
});

test("fim do ano não inclui janeiro seguinte", () => {
  const w = inventoryAsOfWindow(2026, "2026-12-31");
  assert.equal(w.upperExclusive, "2027-01-01");
  assert.equal(w.daysElapsed, 365);
});

test("datas inválidas não são normalizadas silenciosamente", () => {
  assert.throws(() => inventoryAsOfWindow(2026, "2026-02-30"), /Data de referência/);
  assert.throws(() => inventoryAsOfWindow(2026, "2026/11/10"), /Data de referência/);
});
