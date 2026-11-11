"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const file = path.join(__dirname, "..", "src", "features", "dre", "audit-reassignment.domain.ts");
const source = fs.readFileSync(file, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", compiled)(mod, mod.exports);
const { assertCompatibleAuditReassignment } = mod.exports;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("reclassificação com o mesmo tipo é permitida", () => {
  assert.doesNotThrow(() => assertCompatibleAuditReassignment(
    [A, B],
    [{ id: A, kind: "expense" }, { id: B, kind: "expense" }],
    "expense",
  ));
});

test("não permite transformar uma despesa em receita", () => {
  assert.throws(() => assertCompatibleAuditReassignment(
    [A],
    [{ id: A, kind: "expense" }],
    "revenue",
  ), /Não é possível atribuir/);
});

test("não permite seleção mista de receitas e despesas", () => {
  assert.throws(() => assertCompatibleAuditReassignment(
    [A, B],
    [{ id: A, kind: "expense" }, { id: B, kind: "revenue" }],
    "expense",
  ), /Separe os lançamentos por tipo/);
});

test("IDs não autorizados ou excluídos bloqueiam toda a atualização", () => {
  assert.throws(() => assertCompatibleAuditReassignment(
    [A, B], [{ id: A, kind: "expense" }], "expense",
  ), /não estão disponíveis/);
  assert.throws(() => assertCompatibleAuditReassignment(
    [A], [{ id: B, kind: "expense" }], "expense",
  ), /não estão disponíveis/);
});

test("não permite seleção duplicada ou vazia", () => {
  assert.throws(() => assertCompatibleAuditReassignment(
    [A, A], [{ id: A, kind: "expense" }], "expense",
  ), /repetidos/);
  assert.throws(() => assertCompatibleAuditReassignment([], [], "expense"), /Selecione/);
});
