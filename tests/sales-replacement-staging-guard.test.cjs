"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(
  __dirname, "..", "src", "features", "sales", "sales-replacement-activation.domain.ts",
), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", transpiled)(mod, mod.exports);
const { canRunSalesReplacementInStaging, assertSalesReplacementInStaging, isSalesMonthDatabaseVersion } = mod.exports;

const stagingUrl = "https://staging-project.supabase.co/";
const prodUrl = "https://production-project.supabase.co/";

test("substituição fica desligada por padrão", () => {
  assert.equal(canRunSalesReplacementInStaging(undefined, undefined), false);
  assert.equal(canRunSalesReplacementInStaging("false", "homologation", stagingUrl, stagingUrl), false);
  assert.equal(canRunSalesReplacementInStaging("true", undefined, stagingUrl, stagingUrl), false);
  assert.equal(canRunSalesReplacementInStaging("true", "production", stagingUrl, stagingUrl), false);
  assert.equal(canRunSalesReplacementInStaging("TRUE", "homologation", stagingUrl, stagingUrl), false);
  assert.equal(canRunSalesReplacementInStaging("true", "homologation", stagingUrl, undefined), false);
  assert.equal(canRunSalesReplacementInStaging("true", "homologation", prodUrl, stagingUrl), false);
  assert.equal(canRunSalesReplacementInStaging("true", "homologation", "http://staging-project.supabase.co/", stagingUrl), false);
});

test("flags e URL exata precisam apontar para o banco de homologação", () => {
  assert.equal(canRunSalesReplacementInStaging("true", "homologation", stagingUrl, stagingUrl), true);
  assert.doesNotThrow(() => assertSalesReplacementInStaging("true", "homologation", stagingUrl, stagingUrl));
  assert.throws(
    () => assertSalesReplacementInStaging("true", "production", stagingUrl, stagingUrl),
    /Substituição transacional desativada/,
  );
  assert.throws(() => assertSalesReplacementInStaging("true", "homologation", prodUrl, stagingUrl), /desativada/);
});

test("versão do banco precisa ser md5 de linhas do mês, não token da prévia", () => {
  assert.equal(isSalesMonthDatabaseVersion("d41d8cd98f00b204e9800998ecf8427e"), true);
  assert.equal(isSalesMonthDatabaseVersion("a".repeat(64)), false);
  assert.equal(isSalesMonthDatabaseVersion("A".repeat(32)), false);
  assert.equal(isSalesMonthDatabaseVersion(null), false);
  assert.equal(isSalesMonthDatabaseVersion({}), false);
});

test("script SQL permanece sob docs e não é executado pelo app ou pelo CI", () => {
  const sql = fs.readFileSync(path.join(
    __dirname, "..", "docs", "sql", "SALES_MONTH_ATOMIC_REPLACE_HOMOLOGATION_DRAFT.sql",
  ), "utf8");
  assert.match(sql, /NÃO APLICADA NO BANCO/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /pg_advisory_xact_lock/);
  // A STABLE fingerprint could see a stale snapshot after DELETE+INSERT
  // inside the same RPC; require VOLATILE so the new version is re-read.
  assert.match(sql, /sales_month_version\([\s\S]*?language plpgsql volatile security definer/);
  assert.match(sql, /sales_month_version\([\s\S]*?language plpgsql volatile security invoker/);
  assert.match(sql, /p_expected_version/);
  assert.match(sql, /auth.uid\(\)/);
  assert.match(sql, /sales_month_revisions/);
  assert.match(sql, /sales_month_restore/);
  assert.match(sql, /revoke all privileges on table public\.sales from public, anon, authenticated/);
  assert.match(sql, /grant select on table public\.sales to authenticated/);
  assert.match(sql, /grant execute on function public\.sales_month_commit/);
});

test("scripts de banco documentam as três condições de segurança", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "docs", "sql",
    "SALES_MONTH_ATOMIC_REPLACE_HOMOLOGATION_DRAFT.sql"), "utf8");
  const mustHave = [
    "m.role::text in ('owner','admin')",
    "if v_version<>p_expected_version",
    "finance_internal.sales_month_revisions",
    "where s.company_id=p_company_id and s.period_start=p_period_start",
    "unique(company_id, period_start, request_id)",
  ];
  for (const token of mustHave) assert.ok(sql.includes(token), token);
});
