"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "features", "sales", "sales-import-integrity.domain.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("require","module","exports",js)(require,mod,mod.exports);
const { assessSalesImport, assessSalesReimport, normalizedSellerKey } = mod.exports;
const seller = (sellerName, sellerCode = null) => ({
  sellerName, sellerCode, netAmountCents: 15000, returnsCents: 0,
  costCents: 9000, itemsQty: 10, salesQty: 6,
});

test("período mensal completo pode ser importado; códigos faltantes geram aviso", () => {
  const r = assessSalesImport("2026-02-01", "2026-02-28", [seller("Ana"), seller("Beto")]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.missingSellerCodes, 2);
  assert.equal(r.warnings.length, 1);
});

test("não adivinha competência nem aceita fevereiro fictício", () => {
  assert.match(assessSalesImport("2026-02-01", "2026-02-30", [seller("Ana")]).errors.join(" "), /inválido/);
  assert.match(assessSalesImport("", "2026-02-28", [seller("Ana")]).errors.join(" "), /inválido/);
  assert.match(assessSalesImport("2026-02-15", "2026-01-29", [seller("Ana")]).errors.join(" "), /antecede/);
  assert.match(assessSalesImport("2026-02-15", "2026-03-10", [seller("Ana")]).errors.join(" "), /atravessa meses/);
});

test("período parcial não se torna cobertura falsa do mês", () => {
  const r = assessSalesImport("2026-08-15", "2026-08-27", [seller("Ana", "1")]);
  assert.equal(r.errors.length, 0);
  assert.match(r.warnings.join(" "), /mês civil completo/);
});

test("nomes equivalentes com variações de espaço e acento são duplicados", () => {
  const r = assessSalesImport("2026-07-01", "2026-07-31", [seller(" João  Silva "), seller("JOAO SILVA")]);
  assert.equal(r.duplicateSellerNames, 1);
  assert.match(r.errors.join(" "), /nomes repetidos/);
  assert.equal(normalizedSellerKey(" JoãO   Silva "), normalizedSellerKey("JOAO SILVA"));
});

test("valores inválidos e lista vazia são recusados", () => {
  assert.match(assessSalesImport("2026-10-01","2026-10-31", []).errors.join(" "), /não contém vendedores/);
  assert.match(assessSalesImport("2026-10-01","2026-10-31", [{ ...seller("Ana"), costCents: Infinity }]).errors.join(" "), /inteiro válido/);
});

test("reimportação idêntica é segura, sem alterações de identidades", () => {
  const prev = [{ sellerName: "Ana", periodEnd: "2026-07-31" }, { sellerName: "Beto", periodEnd: "2026-07-31" }];
  const next = [seller("Ana"), seller("Beto")];
  assert.deepEqual(assessSalesReimport(prev, next, "2026-07-31"), {
    existingCount: 2, incomingCount: 2, missingExistingCount: 0, newSellerCount: 0,
    retainedCount: 2, previousDuplicateCount: 0, nameVariantCount: 0,
    periodMismatchCount: 0, blocked: false,
  });
});

test("reimportação parcial é bloqueada antes de somar saldo antigo com novo", () => {
  const prev = [{ sellerName: "Ana" }, { sellerName: "Beto" }];
  const r = assessSalesReimport(prev, [seller("Ana")]);
  assert.equal(r.blocked, true);
  assert.equal(r.missingExistingCount, 1);
});

test("grafia alterada, duplicação legada e período incompatível bloqueiam", () => {
  const variant = assessSalesReimport([{ sellerName: "Maria", periodEnd: "2026-03-31" }], [seller("MARIA")], "2026-03-31");
  assert.equal(variant.blocked, true);
  assert.equal(variant.nameVariantCount, 1);
  const legacy = assessSalesReimport([{ sellerName: "João" }, { sellerName: "JOAO" }], [seller("João")]);
  assert.equal(legacy.previousDuplicateCount, 1);
  assert.equal(legacy.blocked, true);
  const period = assessSalesReimport([{ sellerName: "Ana", periodEnd: "2026-07-25" }], [seller("Ana")], "2026-07-31");
  assert.equal(period.periodMismatchCount, 1);
  assert.equal(period.blocked, true);
});
