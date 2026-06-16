import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { InventorySection } from "@/features/inventory/inventory-section";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [{ title: "Estoque — Finance Vision Pro" }],
  }),
  component: () => (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-black tracking-tight">Estoque</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Snapshots periódicos do valor agregado de estoque e indicadores de giro.
          </p>
        </header>
        <InventorySection />
      </div>
    </AppShell>
  ),
});
