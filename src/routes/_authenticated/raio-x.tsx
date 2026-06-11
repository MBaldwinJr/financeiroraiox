import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { RaioXPage } from "@/features/raio-x/raio-x-page";

export const Route = createFileRoute("/_authenticated/raio-x")({
  head: () => ({ meta: [{ title: "Raio-X Financeiro — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <RaioXPage />
    </AppShell>
  ),
});
