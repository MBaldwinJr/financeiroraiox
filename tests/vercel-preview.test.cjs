const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

test("Vercel build selects Nitro Vercel preset without duplicating plugins", () => {
  const config = source("vite.config.ts");
  assert.match(config, /process\.env\.VERCEL/);
  assert.match(config, /preset:\s*["']vercel["']/);
  assert.match(config, /@lovable\.dev\/vite-tanstack-config/);
  assert.doesNotMatch(config, /nitro\(\)/);
});

test("Google login on the external host uses Supabase OAuth, not Lovable Cloud", () => {
  const authPage = source("src/routes/auth.tsx");
  assert.match(authPage, /supabase\.auth\.signInWithOAuth\(/);
  assert.match(authPage, /provider:\s*["']google["']/);
  assert.match(authPage, /redirectTo:\s*`\$\{window\.location\.origin\}\/auth`/);
  assert.doesNotMatch(authPage, /lovable\.auth\.signInWithOAuth/);
});

test("Preview deployment documents client/server secrets separately", () => {
  const env = source(".env.example");
  for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.match(env, new RegExp(`^${key}=`, "m"));
  }
  assert.doesNotMatch(env, /^VITE_SUPABASE_SERVICE_ROLE_KEY=/m);
});

test("Privileged Supabase access is created on the server only", () => {
  const serverClient = source("src/integrations/supabase/client.server.ts");
  assert.match(serverClient, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(serverClient, /persistSession:\s*false/);
  const browserClient = source("src/integrations/supabase/client.ts");
  assert.match(browserClient, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(browserClient, /SERVICE_ROLE_KEY/);
});
