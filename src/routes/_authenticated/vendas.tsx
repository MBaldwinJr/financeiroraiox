import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { SalesPage } from "@/features/sales/sales-page";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({ meta: [{ title: "Vendas — Finance Vision Pro" }] }),
  component: () => (
    <AppShell>
      <SalesPage />
    </AppShell>
  ),
});
