"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const original = fs.readFileSync(
  path.join(__dirname, "..", "src", "features", "dre", "dre-audit-permissions.domain.ts"), "utf8",
);
const compiled = ts.transpileModule(original, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);
const { canMutateAudit, assertCanMutateAudit, requireAuditMutationRole } = mod.exports;

test("somente owner e admin podem modificar lançamentos da auditoria", () => {
  assert.equal(canMutateAudit("owner"), true);
  assert.equal(canMutateAudit("admin"), true);
  for (const role of ["member", null, undefined, "viewer", "OWNER", ""]) {
    assert.equal(canMutateAudit(role), false);
    assert.throws(() => assertCanMutateAudit(role), /proprietário ou administrador/);
  }
});

function client({ role, error = null, captured }) {
  return {
    from(table) {
      assert.equal(table, "company_members");
      return {
        select(column) {
          assert.equal(column, "role");
          return {
            eq(columnA, company) {
              assert.equal(columnA, "company_id");
              captured.company = company;
              return {
                eq(columnB, user) {
                  assert.equal(columnB, "user_id");
                  captured.user = user;
                  return { maybeSingle: async () => ({ data: role ? { role } : null, error }) };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("validação consulta papel do usuário da empresa escolhida", async () => {
  const captured = {};
  await requireAuditMutationRole(client({ role: "admin", captured }), "empresa-A", "usuario-A");
  assert.deepEqual(captured, { company: "empresa-A", user: "usuario-A" });
});

test("usuário de outra empresa ou sem registro não pode executar mutação", async () => {
  await assert.rejects(
    () => requireAuditMutationRole(client({ role: null, captured: {} }), "empresa-A", "usuario-B"),
    /proprietário ou administrador/,
  );
});

test("falha da consulta de permissões bloqueia a ação", async () => {
  await assert.rejects(
    () => requireAuditMutationRole(client({ role: null, captured: {}, error: { message: "RLS" } }), "empresa-A", "usuario-A"),
    /Não foi possível validar/,
  );
});

test("membros não podem acessar operação financeira, mesmo com companyId válido", async () => {
  await assert.rejects(
    () => requireAuditMutationRole(client({ role: "member", captured: {} }), "empresa-A", "usuario-C"),
    /Apenas proprietário ou administrador/,
  );
});
