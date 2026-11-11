"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..", "src", "features", "dre");
function load(relativePath, importer = require) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)(importer, module, module.exports);
  return module.exports;
}
const engine = load("dre-engine/dre-engine.domain.ts");
const { previewReassignmentImpact } = load(
  "audit-reassignment-preview.domain.ts",
  (name) => {
    if (name === "@/features/dre/dre-engine/dre-engine.domain") return engine;
    throw new Error("Import inesperado: " + name);
  },
);

function transaction(kind, amount_cents, dre_line = "nao_aplicavel", competencia = "2026-10-12") {
  return {
    id: "tx",
    kind,
    competencia,
    amount_cents,
    category: { dre_line, is_balance_sheet: false },
  };
}
const metric = (preview, line) => preview.differences.find((item) => item.line === line);

test("despesa não mapeada, simulada como operacional, reduz lucro sem alterar receita ou CMV", () => {
  const rows = [transaction("expense", 10500)];
  const copy = structuredClone(rows);
  const preview = previewReassignmentImpact(rows, { dre_line: "despesa_operacional", is_balance_sheet: false });
  assert.equal(preview.selectedCount, 1);
  assert.equal(preview.selectedAmountCents, 10500);
  assert.equal(metric(preview, "receita_bruta").deltaCents, 0);
  assert.equal(metric(preview, "cmv").deltaCents, 0);
  assert.equal(metric(preview, "lucro_liquido").deltaCents, -10500);
  assert.deepEqual(rows, copy, "simulação não pode alterar o objeto original");
});

test("despesa operacional para despesa financeira altera EBITDA sem mudar lucro líquido", () => {
  const preview = previewReassignmentImpact(
    [transaction("expense", 30000, "despesa_operacional")],
    { dre_line: "resultado_financeiro", is_balance_sheet: false },
  );
  assert.equal(metric(preview, "ebitda").deltaCents, 30000);
  assert.equal(metric(preview, "resultado_financeiro").deltaCents, 30000);
  assert.equal(metric(preview, "lucro_liquido").deltaCents, 0);
});

test("CMV hipotético reduz lucro bruto e lucro líquido uma vez", () => {
  const preview = previewReassignmentImpact(
    [transaction("expense", 7000)],
    { dre_line: "cmv", is_balance_sheet: false },
  );
  assert.equal(metric(preview, "cmv").deltaCents, 7000);
  assert.equal(metric(preview, "lucro_bruto").deltaCents, -7000);
  assert.equal(metric(preview, "lucro_liquido").deltaCents, -7000);
});

test("destino patrimonial exclui contribuição anteriormente operacional do resultado", () => {
  const preview = previewReassignmentImpact(
    [transaction("expense", 12000, "despesa_operacional")],
    { dre_line: "nao_aplicavel", is_balance_sheet: true },
  );
  assert.equal(metric(preview, "lucro_liquido").beforeCents, -12000);
  assert.equal(metric(preview, "lucro_liquido").afterCents, 0);
  assert.equal(metric(preview, "lucro_liquido").deltaCents, 12000);
});

test("lançamento sem competência não é inventado no resultado da DRE", () => {
  const preview = previewReassignmentImpact(
    [transaction("expense", 10000, "nao_aplicavel", null)],
    { dre_line: "despesa_operacional", is_balance_sheet: false },
  );
  assert.equal(preview.withoutCompetenciaCount, 1);
  assert.ok(preview.differences.every((entry) => entry.deltaCents === 0));
});

test("receita sem classificação, simulada como receita bruta, aumenta lucro", () => {
  const preview = previewReassignmentImpact(
    [{ ...transaction("revenue", 25000), category: null }],
    { dre_line: "receita_bruta", is_balance_sheet: false },
  );
  assert.equal(metric(preview, "receita_bruta").deltaCents, 25000);
  assert.equal(metric(preview, "lucro_liquido").deltaCents, 25000);
});
