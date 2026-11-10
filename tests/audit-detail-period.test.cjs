"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(
  __dirname, "..", "src", "features", "dre", "audit-detail-period.domain.ts"
), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", javascript)(require, mod, mod.exports);
const { auditDetailWindow, auditDetailPeriodFilter, auditDetailOffset } = mod.exports;

test("janeiro da auditoria termina precisamente em fevereiro", () => {
  assert.deepEqual(auditDetailWindow(2026, 1), {
    start: "2026-01-01", end: "2026-02-01",
  });
});

test("dezembro e ano inteiro atravessam corretamente a virada do ano", () => {
  assert.deepEqual(auditDetailWindow(2026, 12), {
    start: "2026-12-01", end: "2027-01-01",
  });
  assert.deepEqual(auditDetailWindow(2026, null), {
    start: "2026-01-01", end: "2027-01-01",
  });
});

test("predicado inclui competência válida e data apenas quando competência é ausente", () => {
  assert.equal(
    auditDetailPeriodFilter(2026, 5),
    "and(competencia.gte.2026-05-01,competencia.lt.2026-06-01),and(competencia.is.null,date.gte.2026-05-01,date.lt.2026-06-01)",
  );
});

test("paginação é estável e não sobrepõe registros", () => {
  assert.deepEqual(auditDetailOffset(0), { from: 0, to: 24 });
  assert.deepEqual(auditDetailOffset(1), { from: 25, to: 49 });
  assert.deepEqual(auditDetailOffset(30), { from: 750, to: 774 });
});
