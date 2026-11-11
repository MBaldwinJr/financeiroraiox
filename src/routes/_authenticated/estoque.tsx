import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { InventorySection } from "@/features/inventory/inventory-section";
import { useCompanyStore } from "@/stores/company-store";
import { useFilterStore } from "@/stores/filter-store";
import { CmvReconciliationSection } from "@/features/inventory/cmv-reconciliation-section";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [{ title: "Estoque — Finance Vision Pro" }],
  }),
  component: () => <EstoquePage />,
});

function EstoquePage() {
  const companyId = useCompanyStore((s) => s.activeCompanyId);
  const year = useFilterStore((s) => s.range.year);
  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-black tracking-tight">Estoque</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Snapshots periódicos do valor agregado de estoque e indicadores de giro.
          </p>
        </header>
        <InventorySection />
        {companyId && <CmvReconciliationSection companyId={companyId} year={year} />}
      </div>
    </AppShell>
  );
}
