import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { CashflowPage } from "@/features/cashflow/cashflow-page";

export const Route = createFileRoute("/_authenticated/fluxo-caixa")({
  head: () => ({ meta: [{ title: "Fluxo de Caixa — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <CashflowPage />
    </AppShell>
  ),
});
