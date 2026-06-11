import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { IndicatorsPage } from "@/features/indicators/indicators-page";

export const Route = createFileRoute("/_authenticated/analises")({
  head: () => ({ meta: [{ title: "Análises — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <IndicatorsPage />
    </AppShell>
  ),
});
