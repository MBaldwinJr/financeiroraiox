import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ReconciliationPage } from "@/features/import/reconciliation-page";

export const Route = createFileRoute("/_authenticated/reconciliacao")({
  head: () => ({ meta: [{ title: "Reconciliação — Finance Vision BI" }] }),
  component: () => (
    <AppShell>
      <ReconciliationPage />
    </AppShell>
  ),
});
