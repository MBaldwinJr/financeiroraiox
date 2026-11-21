// @lovable.dev/vite-tanstack-config already installs the TanStack Start,
// React, Tailwind, and Nitro Vite plugins. Do NOT register them a second time.
// In Lovable, retain its existing Cloudflare target. In Vercel CI, override
// only Nitro's output preset so SSR and server routes run in Vercel Functions.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isVercelBuild = process.env.VERCEL === "1";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  ...(isVercelBuild ? { nitro: { preset: "vercel" } } : {}),
});
