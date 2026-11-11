"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "supabase-paginate.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", js)(require, mod, mod.exports);
const { fetchAllRowsConcurrent } = mod.exports;

const records = (length) => Array.from({ length }, (_, id) => ({ id }));

test("paginação concorrente busca todas as páginas e preserva ordem de IDs", async () => {
  const all = records(2540);
  const calls = [];
  let running = 0;
  let maxRunning = 0;
  const result = await fetchAllRowsConcurrent(async (from, to, count) => {
    calls.push({ from, to, count });
    running++;
    maxRunning = Math.max(maxRunning, running);
    await Promise.resolve();
    running--;
    return { data: all.slice(from, to + 1), error: null, count: count ? all.length : null };
  }, 500, 3);
  assert.deepEqual(result, all);
  assert.equal(calls[0].count, true);
  assert.equal(calls.slice(1).every((call) => call.count === false), true);
  assert.ok(maxRunning > 1 && maxRunning <= 3);
  assert.deepEqual(calls.map((call) => call.from).sort((a, b) => a - b), [0, 500, 1000, 1500, 2000, 2500]);
});

test("consulta curta faz um request só e preserva resultado vazio", async () => {
  let calls = 0;
  const result = await fetchAllRowsConcurrent(async () => {
    calls++;
    return { data: [], count: 0, error: null };
  });
  assert.deepEqual(result, []);
  assert.equal(calls, 1);
});

test("se o provedor omitir count, faz paginação sequencial sem inventar total", async () => {
  const all = records(2101);
  const calls = [];
  const result = await fetchAllRowsConcurrent(async (from, to) => {
    calls.push(from);
    return { data: all.slice(from, to + 1), error: null };
  }, 1000, 3);
  assert.equal(result.length, all.length);
  assert.deepEqual(calls, [0, 1000, 2000]);
});

test("inconsistência de contagem não retorna dados financeiros incompletos", async () => {
  const all = records(1400);
  await assert.rejects(
    () => fetchAllRowsConcurrent(async (from, to, withCount) => ({
      data: all.slice(from, Math.min(to + 1, 1100)),
      error: null,
      count: withCount ? 1400 : null,
    }), 1000, 2),
    /Resultado alterado/,
  );
});

test("falhas em uma página são propagadas", async () => {
  await assert.rejects(
    () => fetchAllRowsConcurrent(async (from, to, withCount) => ({
      data: from === 0 ? records(1000) : null,
      error: from === 1000 ? { message: "Banco indisponível" } : null,
      count: withCount ? 1100 : null,
    }), 1000, 2),
    /Banco indisponível/,
  );
});

test("limites de concorrência impedem requisições excessivas", async () => {
  await assert.rejects(() => fetchAllRowsConcurrent(async () => ({ data: [], error: null }), 1000, 5), /Concorrência/);
  await assert.rejects(() => fetchAllRowsConcurrent(async () => ({ data: [], error: null }), 0, 2), /Tamanho de página/);
});
