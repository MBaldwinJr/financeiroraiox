import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { SalesImportPage } from "@/features/sales/sales-import-page";

export const Route = createFileRoute("/_authenticated/importar-vendas")({
  head: () => ({ meta: [{ title: "Importar Vendas — Finance Vision Pro" }] }),
  component: () => (
    <AppShell>
      <SalesImportPage />
    </AppShell>
  ),
});
