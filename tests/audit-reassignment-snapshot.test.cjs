"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(
  __dirname, "..", "src", "features", "dre", "audit-reassignment-snapshot.domain.ts"
), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", js)(require, mod, mod.exports);
const { reassignmentSnapshotToken } = mod.exports;

const destination = { id: "dest-1", kind: "expense", dre_line: "despesa_operacional", is_balance_sheet: false };
const row = (id, amount_cents = 100) => ({
  id, kind: "expense", competencia: "2026-02-12", amount_cents,
  category_id: "source-1", category: { dre_line: "nao_aplicavel", is_balance_sheet: false },
});

test("token independe da ordem da seleção mas muda se empresa ou destino mudam", () => {
  const a = reassignmentSnapshotToken("company-1", [row("a"), row("b")], destination);
  const b = reassignmentSnapshotToken("company-1", [row("b"), row("a")], destination);
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, reassignmentSnapshotToken("company-2", [row("a"), row("b")], destination));
  assert.notEqual(a, reassignmentSnapshotToken("company-1", [row("a"), row("b")], { ...destination, id: "dest-2" }));
});

test("mudança de valor, competência ou categoria invalida a prévia anterior", () => {
  const baseline = reassignmentSnapshotToken("company", [row("a")], destination);
  const changedAmount = reassignmentSnapshotToken("company", [row("a", 200)], destination);
  const changedDate = reassignmentSnapshotToken("company", [{ ...row("a"), competencia: "2026-03-12" }], destination);
  const changedSource = reassignmentSnapshotToken("company", [{ ...row("a"), category_id: "source-2" }], destination);
  const changedDestinationLine = reassignmentSnapshotToken("company", [row("a")], { ...destination, dre_line: "resultado_financeiro" });
  assert.notEqual(baseline, changedAmount);
  assert.notEqual(baseline, changedDate);
  assert.notEqual(baseline, changedSource);
  assert.notEqual(baseline, changedDestinationLine);
});

test("mudança na classificação contábil de origem ou patrimônio invalida a prévia", () => {
  const baseline = reassignmentSnapshotToken("company", [row("a")], destination);
  const changedLine = reassignmentSnapshotToken("company", [{ ...row("a"), category: { dre_line: "despesa_operacional", is_balance_sheet: false } }], destination);
  const changedBalance = reassignmentSnapshotToken("company", [row("a")], { ...destination, is_balance_sheet: true });
  assert.notEqual(baseline, changedLine);
  assert.notEqual(baseline, changedBalance);
});
