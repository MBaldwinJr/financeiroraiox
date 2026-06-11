import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { CostCentersPage } from "@/features/cost-centers/cost-centers-page";

export const Route = createFileRoute("/_authenticated/centros-custos")({
  head: () => ({ meta: [{ title: "Centros de Custos — Finance Vision Pro" }] }),
  component: () => (
    <AppShell>
      <CostCentersPage />
    </AppShell>
  ),
});
