import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { RelatoriosPage } from "@/features/reports/relatorios-page";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <RelatoriosPage />
    </AppShell>
  ),
});
